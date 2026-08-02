import prisma from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { getMonthRange } from "../utils/date.js";
import { writeAuditLog } from "./audit.service.js";
import { getEmployeeCurrentMonthSummary } from "./balance.service.js";
import {
  createNotification,
  notifyOrderConfirmed,
  triggerLowBalanceIfNeeded,
} from "./notification.service.js";

const TERMINAL_STATUSES = new Set(["cancelled", "refunded"]);
const STATUS_TRANSITIONS = {
  pending: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["preparing", "ready", "completed", "cancelled", "refunded"]),
  preparing: new Set(["ready", "completed", "cancelled", "refunded"]),
  ready: new Set(["completed", "cancelled", "refunded"]),
  completed: new Set(["refunded"]),
  cancelled: new Set(),
  refunded: new Set(),
};

const normalizeItems = (items) => {
  const quantityByItem = new Map();

  for (const item of items) {
    quantityByItem.set(
      item.menu_item_id,
      (quantityByItem.get(item.menu_item_id) ?? 0) + item.quantity,
    );
  }

  return [...quantityByItem.entries()].map(([menu_item_id, quantity]) => ({
    menu_item_id,
    quantity,
  }));
};

const loadMenuItems = async (tx, cafeId, items) => {
  const itemIds = items.map((item) => item.menu_item_id);
  const menuItems = await tx.menu_items.findMany({
    where: {
      id: { in: itemIds },
      cafe_id: cafeId,
      is_available: true,
      cafes: { is_active: true },
    },
  });

  if (menuItems.length !== itemIds.length) {
    throw new AppError("One or more menu items are unavailable for this cafe", 400);
  }

  return menuItems;
};

const buildOrderItems = (items, menuItems) => {
  let totalAmount = 0;
  const menuItemById = new Map(menuItems.map((item) => [item.id, item]));

  const orderItems = items.map((item) => {
    const menuItem = menuItemById.get(item.menu_item_id);
    const unitPrice = Number(menuItem.price);
    const subtotal = Number((unitPrice * item.quantity).toFixed(2));
    totalAmount = Number((totalAmount + subtotal).toFixed(2));

    return {
      menu_item_id: menuItem.id,
      item_name_snapshot: menuItem.name,
      unit_price_snapshot: menuItem.price,
      quantity: item.quantity,
      subtotal,
    };
  });

  return { orderItems, totalAmount };
};

export const createOrderWithBalanceDeduction = async ({
  employeeId,
  cafeId,
  waiterId = null,
  items,
  orderMethod,
  actor,
  ipAddress,
  beforeCreate = null,
}) => {
  const normalizedItems = normalizeItems(items);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock($1)", employeeId);

    if (beforeCreate) {
      await beforeCreate(tx);
    }

    const employee = await tx.users.findFirst({
      where: {
        id: employeeId,
        is_active: true,
        user_roles: { some: { roles: { name: "employee" } } },
      },
      select: { id: true },
    });

    if (!employee) {
      throw new AppError("Employee not found or inactive", 404);
    }

    if (waiterId) {
      const waiterAssignment = await tx.cafe_staff.findFirst({
        where: { user_id: waiterId, cafe_id: cafeId },
      });

      if (!waiterAssignment) {
        throw new AppError("Waiter is not assigned to this cafe", 403);
      }
    }

    const menuItems = await loadMenuItems(tx, cafeId, normalizedItems);
    const { orderItems, totalAmount } = buildOrderItems(normalizedItems, menuItems);
    const { start } = getMonthRange();

    const allocation = await tx.monthly_allocations.findUnique({
      where: {
        user_id_allocation_month: {
          user_id: employeeId,
          allocation_month: start,
        },
      },
    });

    if (!allocation) {
      throw new AppError("Employee has no allocation for the current month", 409);
    }

    const balance = await getEmployeeCurrentMonthSummary(employeeId, tx);
    if (balance.remaining < totalAmount) {
      throw new AppError("Insufficient balance", 409);
    }

    const order = await tx.orders.create({
      data: {
        employee_id: employeeId,
        cafe_id: cafeId,
        waiter_id: waiterId,
        total_amount: totalAmount,
        status: "confirmed",
        order_method: orderMethod,
        completed_at: null,
        order_items: { create: orderItems },
      },
      include: { order_items: true },
    });

    await tx.balance_transactions.create({
      data: {
        user_id: employeeId,
        allocation_id: allocation.id,
        amount: totalAmount,
        direction: "debit",
        transaction_type: "order",
        reference_note: `Order ${order.order_uuid}`,
      },
    });

    await notifyOrderConfirmed(employeeId, order.id, totalAmount, actor, ipAddress, tx);
    await triggerLowBalanceIfNeeded(employeeId, actor, ipAddress, tx);

    await writeAuditLog(
      {
        userId: actor?.id ?? null,
        action: orderMethod === "offline_qr" ? "order.offline_qr.create" : "order.online.create",
        entityType: "orders",
        entityId: order.id,
        description: `Created ${orderMethod} order for ETB ${totalAmount.toFixed(2)}`,
        ipAddress,
      },
      tx,
    );

    const remainingBalance = Number((balance.remaining - totalAmount).toFixed(2));

    return {
      order,
      total_amount: totalAmount,
      remaining_balance: remainingBalance,
    };
  });
};

const loadOrderForUpdate = async (tx, orderId) => {
  const order = await tx.orders.findUnique({
    where: { id: orderId },
    include: {
      cafes: { select: { id: true, name: true } },
      users_orders_employee_idTousers: { select: { id: true, fullname: true } },
    },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock($1)", order.employee_id);
  return order;
};

const assertOrderAccess = (actor, order, action) => {
  const roles = actor?.roles ?? [];

  if (roles.includes("company_manager")) return;

  if (roles.includes("employee") && order.employee_id === actor.id && action === "cancel") {
    return;
  }

  if ((roles.includes("waiter") || roles.includes("cafe_manager")) && actor.cafeId === order.cafe_id) {
    return;
  }

  throw new AppError("You are not authorized to modify this order", 403);
};

const assertTransition = (fromStatus, toStatus) => {
  const from = fromStatus ?? "pending";
  if (!STATUS_TRANSITIONS[from]?.has(toStatus)) {
    throw new AppError(`Cannot transition order from ${from} to ${toStatus}`, 409);
  }
};

const createBalanceRestoration = async ({ tx, order, transactionType, note }) => {
  const existing = await tx.balance_transactions.findFirst({
    where: {
      user_id: order.employee_id,
      transaction_type: "refund",
      reference_note: { contains: `Order ${order.order_uuid}` },
    },
  });

  if (existing) {
    throw new AppError("Order balance has already been restored", 409);
  }

  const debit = await tx.balance_transactions.findFirst({
    where: {
      user_id: order.employee_id,
      transaction_type: "order",
      direction: "debit",
      reference_note: { contains: `Order ${order.order_uuid}` },
    },
    orderBy: { created_at: "asc" },
  });

  if (!debit?.allocation_id) {
    throw new AppError("Original order balance transaction was not found", 409);
  }

  return tx.balance_transactions.create({
    data: {
      user_id: order.employee_id,
      allocation_id: debit.allocation_id,
      amount: order.total_amount,
      direction: "credit",
      transaction_type: transactionType,
      reference_note: `${note} - Order ${order.order_uuid}`,
    },
  });
};

const notifyOrderStatus = (tx, order, status, actor, ipAddress) => {
  const type = status === "refunded" ? "refund" : "order_status";
  const title = status === "refunded" ? "Order refunded" : "Order status updated";
  return createNotification(
    {
      userId: order.employee_id,
      type,
      title,
      message: `Your order #${order.id} is now ${status}.`,
    },
    actor,
    ipAddress,
    tx,
  );
};

export const updateOrderStatus = async ({ orderId, status, actor, ipAddress }) => {
  if (TERMINAL_STATUSES.has(status)) {
    throw new AppError("Use the dedicated cancel or refund endpoint for this status", 400);
  }

  return prisma.$transaction(async (tx) => {
    const order = await loadOrderForUpdate(tx, orderId);
    assertOrderAccess(actor, order, "status");
    assertTransition(order.status, status);

    const updated = await tx.orders.update({
      where: { id: orderId },
      data: {
        status,
        completed_at: status === "completed" ? new Date() : order.completed_at,
      },
      include: { order_items: true, cafes: { select: { id: true, name: true } } },
    });

    await notifyOrderStatus(tx, updated, status, actor, ipAddress);
    await writeAuditLog(
      {
        userId: actor.id,
        action: "order.status.update",
        entityType: "orders",
        entityId: orderId,
        description: `Updated order status from ${order.status} to ${status}`,
        ipAddress,
      },
      tx,
    );

    return updated;
  });
};

export const cancelOrder = async ({ orderId, actor, ipAddress }) => {
  return prisma.$transaction(async (tx) => {
    const order = await loadOrderForUpdate(tx, orderId);
    assertOrderAccess(actor, order, "cancel");
    assertTransition(order.status, "cancelled");

    const restoration = await createBalanceRestoration({
      tx,
      order,
      transactionType: "refund",
      note: "Cancellation balance restoration",
    });

    const updated = await tx.orders.update({
      where: { id: orderId },
      data: { status: "cancelled" },
      include: { order_items: true, cafes: { select: { id: true, name: true } } },
    });

    await notifyOrderStatus(tx, updated, "cancelled", actor, ipAddress);
    await writeAuditLog(
      {
        userId: actor.id,
        action: "order.cancel",
        entityType: "orders",
        entityId: orderId,
        description: `Cancelled order and restored ETB ${Number(order.total_amount).toFixed(2)}`,
        ipAddress,
      },
      tx,
    );

    return { order: updated, balance_transaction: restoration };
  });
};

export const refundOrder = async ({ orderId, actor, ipAddress }) => {
  return prisma.$transaction(async (tx) => {
    const order = await loadOrderForUpdate(tx, orderId);
    assertOrderAccess(actor, order, "refund");
    assertTransition(order.status, "refunded");

    const refund = await createBalanceRestoration({
      tx,
      order,
      transactionType: "refund",
      note: "Order refund",
    });

    const updated = await tx.orders.update({
      where: { id: orderId },
      data: { status: "refunded" },
      include: { order_items: true, cafes: { select: { id: true, name: true } } },
    });

    await notifyOrderStatus(tx, updated, "refunded", actor, ipAddress);
    await writeAuditLog(
      {
        userId: actor.id,
        action: "order.refund",
        entityType: "orders",
        entityId: orderId,
        description: `Refunded order for ETB ${Number(order.total_amount).toFixed(2)}`,
        ipAddress,
      },
      tx,
    );

    return { order: updated, balance_transaction: refund };
  });
};
