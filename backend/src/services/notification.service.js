import prisma from "../config/db.js";
import { writeAuditLog } from "./audit.service.js";
import { AppError } from "../utils/AppError.js";
import { getCurrentMonthRange } from "../utils/date.js";

const LOW_BALANCE_PERCENT = 0.2;

export const createNotification = async (
  { userId, title, message, type },
  actor = null,
  ipAddress = null,
  tx = prisma,
) => {
  const targetUser = await tx.users.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!targetUser) {
    throw new AppError("Notification target user not found", 404);
  }

  const notification = await tx.notifications.create({
    data: {
      user_id: userId,
      title,
      message,
      type,
    },
  });

  if (actor) {
    await writeAuditLog(
      {
        userId: actor.id,
        action: "notification.create",
        entityType: "notifications",
        entityId: notification.id,
        description: `Created ${type} notification for user ${userId}`,
        ipAddress,
      },
      tx,
    );
  }

  return notification;
};

export const getNotifications = async (
  user,
  pagination,
  ipAddress,
  orderBy = { created_at: "desc" },
) => {
  const where = { user_id: user.id };
  const [items, total] = await Promise.all([
    prisma.notifications.findMany({
      where,
      orderBy,
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.notifications.count({ where }),
  ]);

  await writeAuditLog({
    userId: user.id,
    action: "notification.list",
    entityType: "notifications",
    description: "Fetched notifications",
    ipAddress,
  });

  return {
    items,
    page: pagination.page,
    limit: pagination.limit,
    total,
    total_pages: Math.ceil(total / pagination.limit),
  };
};

export const getUnreadCount = async (user, ipAddress) => {
  const count = await prisma.notifications.count({
    where: { user_id: user.id, is_read: false },
  });

  await writeAuditLog({
    userId: user.id,
    action: "notification.unread_count",
    entityType: "notifications",
    description: "Fetched unread notification count",
    ipAddress,
  });

  return count;
};

export const markNotificationRead = async (user, notificationId, ipAddress) => {
  const notification = await prisma.notifications.findFirst({
    where: { id: notificationId, user_id: user.id },
  });

  if (!notification) {
    throw new AppError("Notification not found", 404);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.notifications.update({
      where: { id: notificationId },
      data: { is_read: true },
    });

    await writeAuditLog(
      {
        userId: user.id,
        action: "notification.mark_read",
        entityType: "notifications",
        entityId: notificationId,
        description: "Marked notification as read",
        ipAddress,
      },
      tx,
    );

    return updated;
  });
};

export const markAllNotificationsRead = async (user, ipAddress) => {
  return prisma.$transaction(async (tx) => {
    const result = await tx.notifications.updateMany({
      where: { user_id: user.id, is_read: false },
      data: { is_read: true },
    });

    await writeAuditLog(
      {
        userId: user.id,
        action: "notification.mark_all_read",
        entityType: "notifications",
        description: `Marked ${result.count} notifications as read`,
        ipAddress,
      },
      tx,
    );

    return result;
  });
};

export const clearAllNotifications = async (user, ipAddress) => {
  return prisma.$transaction(async (tx) => {
    const result = await tx.notifications.deleteMany({
      where: { user_id: user.id },
    });

    await writeAuditLog(
      {
        userId: user.id,
        action: "notification.clear_all",
        entityType: "notifications",
        description: `Cleared ${result.count} notifications`,
        ipAddress,
      },
      tx,
    );

    return result;
  });
};

export const notifyAllocation = (userId, amount, actor, ipAddress, tx = prisma) => {
  return createNotification(
    {
      userId,
      type: "allocation",
      title: "Meal balance allocated",
      message: `Your meal balance has been allocated with ETB ${Number(amount).toFixed(2)} for this month.`,
    },
    actor,
    ipAddress,
    tx,
  );
};

export const notifyOrderConfirmed = (userId, orderId, totalAmount, actor, ipAddress, tx = prisma) => {
  return createNotification(
    {
      userId,
      type: "order_confirmed",
      title: "Order confirmed",
      message: `Your order #${orderId} was confirmed for ETB ${Number(totalAmount).toFixed(2)}.`,
    },
    actor,
    ipAddress,
    tx,
  );
};

export const notifyPasswordReset = (userId, actor, ipAddress, tx = prisma) => {
  return createNotification(
    {
      userId,
      type: "password_reset",
      title: "Password reset",
      message: "Your account password was reset. Please use the new password provided by your company manager.",
    },
    actor,
    ipAddress,
    tx,
  );
};

export const getCurrentMonthBalance = async (userId, tx = prisma) => {
  const { start, end } = getCurrentMonthRange();
  const allocation = await tx.monthly_allocations.findFirst({
    where: {
      user_id: userId,
      allocation_month: start,
    },
  });

  if (!allocation) {
    return {
      allocated: 0,
      used: 0,
      remaining: 0,
      monthStart: start,
      monthEnd: end,
    };
  }

  const spent = await tx.balance_transactions.aggregate({
    where: {
      user_id: userId,
      created_at: { gte: start, lt: end },
      direction: "debit",
    },
    _sum: { amount: true },
  });

  const credits = await tx.balance_transactions.aggregate({
    where: {
      user_id: userId,
      created_at: { gte: start, lt: end },
      direction: "credit",
    },
    _sum: { amount: true },
  });

  const allocated = Number(allocation.amount);
  const creditAmount = Number(credits._sum.amount ?? allocation.amount);
  const debitAmount = Number(spent._sum.amount ?? 0);

  return {
    allocated,
    used: debitAmount,
    remaining: Math.max(creditAmount - debitAmount, 0),
    monthStart: start,
    monthEnd: end,
  };
};

export const triggerLowBalanceIfNeeded = async (userId, actor, ipAddress, tx = prisma) => {
  const balance = await getCurrentMonthBalance(userId, tx);

  if (balance.allocated <= 0 || balance.remaining > balance.allocated * LOW_BALANCE_PERCENT) {
    return null;
  }

  const existing = await tx.notifications.findFirst({
    where: {
      user_id: userId,
      type: "low_balance",
      created_at: { gte: balance.monthStart, lt: balance.monthEnd },
    },
  });

  if (existing) {
    return existing;
  }

  return createNotification(
    {
      userId,
      type: "low_balance",
      title: "Low meal balance",
      message: `Your remaining meal balance is ETB ${balance.remaining.toFixed(2)}, which is at or below 20% of this month's allocation.`,
    },
    actor,
    ipAddress,
    tx,
  );
};
