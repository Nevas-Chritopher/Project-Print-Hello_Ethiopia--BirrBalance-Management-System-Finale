import prisma from "../config/db.js";
import { comparePassword, hashPassword } from "../services/auth.service.js";
import { createQRSession, consumeQRSession, decryptQRToken, hashQRToken } from "../services/qr.service.js";
import { getEmployeeBalance } from "../services/balance.service.js";
import { createOrderWithBalanceDeduction } from "../services/order.service.js";
import { validateOfflineOrder } from "../validators/order.validators.js";
import { successResponse } from "../utils/response.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../services/audit.service.js";
import { requireString, validatePassword } from "../validators/common.validators.js";

export const changeWaiterPassword = async (req, res, next) => {
  try {
    const oldPassword = requireString(req.body.old_password, "old_password", 100);
    const newPassword = validatePassword(req.body.new_password, "new_password");
    const waiter = await prisma.users.findUnique({ where: { id: req.user.id }, select: { password_hash: true } });
    if (!waiter || !(await comparePassword(oldPassword, waiter.password_hash))) {
      throw new AppError("Current password is incorrect", 401);
    }
    await prisma.$transaction(async (tx) => {
      await tx.users.update({ where: { id: req.user.id }, data: { password_hash: await hashPassword(newPassword), updated_at: new Date() } });
      await writeAuditLog({ userId: req.user.id, action: "waiter.password.change", entityType: "users", entityId: req.user.id, description: "Changed own password", ipAddress: req.ip }, tx);
    });
    return successResponse(res, { changed: true }, "Password updated successfully");
  } catch (error) {
    next(error);
  }
};

export const scanQR = async (req, res, next) => {
  try {
    const { qr_token } = req.body;

    if (!qr_token) {
      throw new AppError("QR token is required", 400);
    }

    const decoded = decryptQRToken(qr_token);

    if (!decoded) {
      throw new AppError("Invalid or expired QR code", 400);
    }

    const employee = await prisma.users.findUnique({
      where: { id: decoded.employee_id },
      select: {
        id: true,
        fullname: true,
        employee_external_id: true,
        is_active: true,
        departments: {
          select: { name: true },
        },
        employee_qr_codes: {
          select: { token_hash: true, is_active: true, expires_at: true },
        },
      },
    });

    if (!employee || !employee.is_active) {
      throw new AppError("Employee not found or inactive", 404);
    }

    const storedQr = employee.employee_qr_codes;
    if (
      !storedQr?.is_active ||
      storedQr.token_hash !== hashQRToken(qr_token) ||
      (storedQr.expires_at && storedQr.expires_at <= new Date())
    ) {
      throw new AppError("QR code is inactive", 400);
    }

    if (!req.user.cafeId) {
      throw new AppError("Waiter is not assigned to a cafe", 403);
    }

    const balance = await getEmployeeBalance(employee.id);
    const session = await prisma.$transaction(async (tx) => {
      const qrSession = await createQRSession({
        employeeId: employee.id,
        waiterId: req.user.id,
        cafeId: req.user.cafeId,
        tx,
      });

      await writeAuditLog(
        {
          userId: req.user.id,
          action: "qr.session.create",
          entityType: "qr_sessions",
          description: `Created QR session for employee ${employee.id}`,
          ipAddress: req.ip,
        },
        tx,
      );

      return qrSession;
    });

    return successResponse(
      res,
      {
        employee: {
          id: employee.id,
          fullname: employee.fullname,
          employee_external_id: employee.employee_external_id,
          department: employee.departments?.name,
          balance,
        },
        qr_session_id: session.qrSessionId,
        session_expires_at: session.expiresAt,
      },
      "Employee verified successfully",
    );
  } catch (error) {
    next(error);
  }
};

export const lookupEmployee = async (req, res, next) => {
  try {
    const employeeExternalId =
      typeof req.body.employee_external_id === "string"
        ? req.body.employee_external_id.trim()
        : "";

    if (!employeeExternalId) {
      throw new AppError("employee_external_id is required", 400);
    }

    if (!req.user.cafeId) {
      throw new AppError("Waiter is not assigned to a cafe", 403);
    }

    const employee = await prisma.users.findFirst({
      where: {
        employee_external_id: { equals: employeeExternalId, mode: "insensitive" },
        user_roles: { some: { roles: { name: "employee" } } },
      },
      select: {
        id: true,
        fullname: true,
        employee_external_id: true,
        is_active: true,
        departments: {
          select: { name: true },
        },
      },
    });

    if (!employee || !employee.is_active) {
      throw new AppError("Employee not found or inactive", 404);
    }

    const balance = await getEmployeeBalance(employee.id);
    const session = await prisma.$transaction(async (tx) => {
      const qrSession = await createQRSession({
        employeeId: employee.id,
        waiterId: req.user.id,
        cafeId: req.user.cafeId,
        tx,
      });

      await writeAuditLog(
        {
          userId: req.user.id,
          action: "waiter.employee.lookup",
          entityType: "users",
          entityId: employee.id,
          description: `Looked up employee ${employee.employee_external_id} by external ID`,
          ipAddress: req.ip,
        },
        tx,
      );

      return qrSession;
    });

    return successResponse(
      res,
      {
        employee: {
          id: employee.id,
          fullname: employee.fullname,
          employee_external_id: employee.employee_external_id,
          department: employee.departments?.name,
          balance,
        },
        qr_session_id: session.qrSessionId,
        session_expires_at: session.expiresAt,
      },
      "Employee verified successfully",
    );
  } catch (error) {
    next(error);
  }
};

const processOfflineOrder = async (actor, body, ipAddress, { requireQrSession = true } = {}) => {
  const { employee_id, password, items, manual_total, cafe_id, qr_session_id } = validateOfflineOrder({
    ...body,
    cafe_id: body?.cafe_id ?? actor.cafeId,
  }, { requireQrSession });

  const employee = await prisma.users.findUnique({
    where: { id: employee_id },
  });

  if (!employee || !employee.is_active) {
    throw new AppError("Employee not found or inactive", 404);
  }

  const isPasswordValid = await comparePassword(
    password,
    employee.password_hash,
  );

  if (!isPasswordValid) {
    throw new AppError("Invalid password", 401);
  }

  return createOrderWithBalanceDeduction({
    employeeId: employee_id,
    cafeId: cafe_id,
    waiterId: actor.id,
    items,
    manualTotal: manual_total,
    orderMethod: "offline_qr",
    actor,
    ipAddress,
    ...(requireQrSession ? {
      beforeCreate: (tx) => consumeQRSession({
        sessionId: qr_session_id,
        employeeId: employee_id,
        waiterId: actor.id,
        cafeId: cafe_id,
        tx,
      }),
    } : {}),
  });
};

export const createOfflineOrder = async (req, res, next) => {
  try {
    const result = await processOfflineOrder(req.user, req.body, req.ip);

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

const MAX_SYNC_ORDERS = 50;

export const syncOfflineOrders = async (req, res, next) => {
  try {
    const { orders } = req.body;

    if (!Array.isArray(orders) || orders.length === 0) {
      throw new AppError("orders must be a non-empty array", 400);
    }

    if (orders.length > MAX_SYNC_ORDERS) {
      throw new AppError(`Cannot sync more than ${MAX_SYNC_ORDERS} orders at once`, 400);
    }

    const results = [];
    for (const [index, entry] of orders.entries()) {
      try {
        // Offline sales cannot have a live server QR session.  The employee
        // password is verified here before the queued order is accepted.
        const result = await processOfflineOrder(req.user, entry, req.ip, { requireQrSession: false });
        results.push({
          index,
          success: true,
          order_id: result.order.id,
          order_uuid: result.order.order_uuid,
          total_amount: result.total_amount,
        });
      } catch (error) {
        results.push({
          index,
          success: false,
          error: error instanceof AppError ? error.message : "Failed to sync order",
        });
      }
    }

    const synced = results.filter((entry) => entry.success).length;

    return successResponse(
      res,
      { synced, failed: orders.length - synced, results },
      "Offline orders processed",
    );
  } catch (error) {
    next(error);
  }
};
