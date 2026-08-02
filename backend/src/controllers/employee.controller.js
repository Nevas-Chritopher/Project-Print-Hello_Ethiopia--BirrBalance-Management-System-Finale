import prisma from "../config/db.js";
import { getEmployeeBalance } from "../services/balance.service.js";
import { createOrderWithBalanceDeduction } from "../services/order.service.js";
import { validateOnlineOrder } from "../validators/order.validators.js";
import { successResponse } from "../utils/response.js";
import { generateQRToken, hashQRToken } from "../services/qr.service.js";
import { writeAuditLog } from "../services/audit.service.js";
import {
  getNotifications as listUserNotifications,
  markNotificationRead as markUserNotificationRead,
} from "../services/notification.service.js";
import { parsePagination, parseSort, requireString, validatePassword } from "../validators/common.validators.js";
import { comparePassword, hashPassword } from "../services/auth.service.js";
import { validateFeedbackCreate } from "../validators/employee.validators.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getProfile = asyncHandler(async (req, res) => {
  const user = await prisma.users.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      fullname: true,
      employee_external_id: true,
      email: true,
      phone_number: true,
      is_active: true,
      created_at: true,
      departments: {
        select: { name: true },
      },
    },
  });

  return successResponse(res, user, "Profile fetched successfully");
});

export const getBalance = asyncHandler(async (req, res) => {
  const balance = await getEmployeeBalance(req.user.id);
  return successResponse(res, { balance }, "Balance fetched successfully");
});

export const getOrders = async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const orderBy = parseSort(req.query, ["created_at", "total_amount", "status"], "-created_at");
    const where = { employee_id: req.user.id };
    const [orders, total] = await Promise.all([
      prisma.orders.findMany({
        where,
        include: {
          order_items: {
            include: {
              menu_items: {
                select: { name: true, price: true },
              },
            },
          },
          cafes: {
            select: { name: true },
          },
        },
        orderBy,
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.orders.count({ where }),
    ]);

    return successResponse(
      res,
      {
        items: orders,
        total,
        page: pagination.page,
        limit: pagination.limit,
        total_pages: Math.ceil(total / pagination.limit),
      },
      "Orders fetched successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const createOnlineOrder = async (req, res, next) => {
  try {
    const payload = validateOnlineOrder(req.body);
    const result = await createOrderWithBalanceDeduction({
      employeeId: req.user.id,
      cafeId: payload.cafe_id,
      items: payload.items,
      orderMethod: "online",
      actor: req.user,
      ipAddress: req.ip,
    });

    return successResponse(
      res,
      {
        order_id: result.order.id,
        order_uuid: result.order.order_uuid,
        total_amount: result.total_amount,
        remaining_balance: result.remaining_balance,
      },
      "Order created successfully",
      201,
    );
  } catch (error) {
    next(error);
  }
};

export const getNotifications = async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const orderBy = parseSort(req.query, ["created_at", "is_read"], "-created_at");
    const data = await listUserNotifications(req.user, pagination, req.ip, orderBy);

    return successResponse(
      res,
      data,
      "Notifications fetched successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const markNotificationRead = asyncHandler(async (req, res) => {
  const notificationId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    throw new AppError("notification id must be a positive integer", 400);
  }

  const notification = await markUserNotificationRead(req.user, notificationId, req.ip);
  return successResponse(res, notification, "Notification marked as read");
});

export const generateQR = asyncHandler(async (req, res) => {
  const { token, expiresAt } = generateQRToken(req.user.id);
  const tokenHash = hashQRToken(token);

  const existing = await prisma.employee_qr_codes.findUnique({
    where: { user_id: req.user.id },
  });

  if (existing) {
    await prisma.employee_qr_codes.update({
      where: { user_id: req.user.id },
      data: {
        token_hash: tokenHash,
        is_active: true,
        expires_at: expiresAt,
      },
    });
  } else {
    await prisma.employee_qr_codes.create({
      data: {
        user_id: req.user.id,
        token_hash: tokenHash,
        is_active: true,
        expires_at: expiresAt,
      },
    });
  }

  await writeAuditLog({
    userId: req.user.id,
    action: "employee.qr.generate",
    entityType: "employee_qr_codes",
    entityId: existing?.id ?? null,
    description: "Generated employee QR token",
    ipAddress: req.ip,
  });

  return successResponse(
    res,
    { qr_token: token, expires_at: expiresAt },
    "QR code generated successfully",
  );
});

export const changePassword = asyncHandler(async (req, res) => {
  const oldPassword = requireString(req.body.old_password, "old_password", 100);
  const newPassword = validatePassword(req.body.new_password, "new_password");

  const user = await prisma.users.findUnique({
    where: { id: req.user.id },
    select: { password_hash: true },
  });

  const isPasswordValid = await comparePassword(oldPassword, user.password_hash);
  if (!isPasswordValid) {
    throw new AppError("Current password is incorrect", 401);
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.users.update({
      where: { id: req.user.id },
      data: { password_hash: passwordHash, updated_at: new Date() },
    });

    await writeAuditLog(
      {
        userId: req.user.id,
        action: "employee.password.change",
        entityType: "users",
        entityId: req.user.id,
        description: "Changed own password",
        ipAddress: req.ip,
      },
      tx,
    );
  });

  return successResponse(res, { changed: true }, "Password updated successfully");
});

export const createFeedback = async (req, res, next) => {
  try {
    const payload = validateFeedbackCreate(req.body);

    const feedback = await prisma.$transaction(async (tx) => {
      if (payload.cafe_id) {
        const cafe = await tx.cafes.findFirst({
          where: { id: payload.cafe_id, is_active: true },
          select: { id: true },
        });
        if (!cafe) {
          throw new AppError("Cafe not found or inactive", 404);
        }
      }

      const created = await tx.feedback.create({
        data: {
          user_id: req.user.id,
          cafe_id: payload.cafe_id,
          rating: payload.rating,
          comment: payload.comment,
        },
      });

      await writeAuditLog(
        {
          userId: req.user.id,
          action: "employee.feedback.create",
          entityType: "feedback",
          entityId: created.id,
          description: "Created employee feedback",
          ipAddress: req.ip,
        },
        tx,
      );

      if (payload.cafe_id) {
        const managers = await tx.cafe_staff.findMany({
          where: {
            cafe_id: payload.cafe_id,
            users: {
              user_roles: {
                some: { roles: { name: "cafe_manager" } },
              },
            },
          },
          select: { user_id: true },
        });

        if (managers.length) {
          await tx.notifications.createMany({
            data: managers.map((manager) => ({
              user_id: manager.user_id,
              title: "New employee feedback",
              message: "New feedback was submitted for your cafe.",
              type: "feedback",
            })),
          });
        }
      }

      return created;
    });

    return successResponse(res, feedback, "Feedback submitted successfully", 201);
  } catch (error) {
    next(error);
  }
};
