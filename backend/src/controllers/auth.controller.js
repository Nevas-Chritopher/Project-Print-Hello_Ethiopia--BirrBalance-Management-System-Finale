import prisma from "../config/db.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { comparePassword, generateToken, hashPassword } from "../services/auth.service.js";
import {
  generateRefreshToken,
  revokeRefreshToken,
  verifyRefreshToken,
} from "../services/token.service.js";
import { writeAuditLog } from "../services/audit.service.js";
import { successResponse } from "../utils/response.js";
import {
  validateLogin,
  validateLogoutRequest,
  validatePasswordResetConfirm,
  validatePasswordResetRequest,
  validateRefreshRequest,
} from "../validators/auth.validators.js";
import env from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const login = asyncHandler(async (req, res) => {
  const { employee_external_id, password } = validateLogin(req.body);

  const user = await prisma.users.findUnique({
    where: { employee_external_id },
    include: {
      user_roles: {
        include: { roles: true },
      },
    },
  });

  if (!user) {
    throw new AppError("Invalid credentials", 401);
  }

  if (!user.is_active) {
    throw new AppError("Account is disabled. Contact your company manager", 403);
  }

  const isPasswordValid = await comparePassword(password, user.password_hash);

  if (!isPasswordValid) {
    throw new AppError("Invalid credentials", 401);
  }

  const roles = user.user_roles.map((ur) => ur.roles.name);

  const token = generateToken({
    id: user.id,
    employee_external_id: user.employee_external_id,
    roles,
  });

  const refresh_token = await generateRefreshToken(user.id);

  await prisma.$transaction(async (tx) => {
    await tx.login_history.create({
      data: {
        user_id: user.id,
        ip_address: req.ip,
        device_info: req.headers["user-agent"],
      },
    });

    await writeAuditLog(
      {
        userId: user.id,
        action: "auth.login",
        entityType: "users",
        entityId: user.id,
        description: "User logged in",
        ipAddress: req.ip,
      },
      tx,
    );
  });

  return successResponse(
    res,
    {
      token,
      refresh_token,
      user: {
        id: user.id,
        fullname: user.fullname,
        employee_external_id: user.employee_external_id,
        roles,
      },
    },
    "Login successful",
  );
});

export const refreshToken = asyncHandler(async (req, res) => {
  const { refresh_token } = validateRefreshRequest(req.body);

  const storedToken = await verifyRefreshToken(refresh_token);
  const user = storedToken.users;

  if (!user || !user.is_active) {
    throw new AppError("Invalid refresh token or user is inactive", 401);
  }

  const roles = user.user_roles.map((ur) => ur.roles.name);
  const token = generateToken({
    id: user.id,
    employee_external_id: user.employee_external_id,
    roles,
  });

  await revokeRefreshToken(refresh_token);
  const newRefreshToken = await generateRefreshToken(user.id);

  await writeAuditLog({
    userId: user.id,
    action: "auth.refresh",
    entityType: "users",
    entityId: user.id,
    description: "Refresh token rotated",
    ipAddress: req.ip,
  });

  return successResponse(
    res,
    { token, refresh_token: newRefreshToken },
    "Token refreshed successfully",
  );
});

export const logout = asyncHandler(async (req, res) => {
  const { refresh_token } = validateLogoutRequest(req.body);

  await revokeRefreshToken(refresh_token);

  return successResponse(res, null, "Logout successful");
});

export const requestPasswordReset = asyncHandler(async (req, res) => {
  const { employee_external_id } = validatePasswordResetRequest(req.body);
  const user = await prisma.users.findUnique({ where: { employee_external_id } });

  if (user?.is_active) {
    const otp = String(crypto.randomInt(100000, 1000000));
    const otpHash = await bcrypt.hash(otp, 12);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      await tx.password_reset_tokens.create({
        data: {
          user_id: user.id,
          otp_code: otpHash,
          expires_at: expiresAt,
        },
      });

      await writeAuditLog(
        {
          userId: user.id,
          action: "auth.password_reset.request",
          entityType: "users",
          entityId: user.id,
          description: "Password reset requested",
          ipAddress: req.ip,
        },
        tx,
      );
    });

    if (env.NODE_ENV !== "production") {
      return successResponse(
        res,
        { reset_otp: otp, expires_at: expiresAt },
        "If the employee ID exists, a reset code has been generated",
      );
    }
  }

  return successResponse(res, null, "If the employee ID exists, a reset code has been generated");
});

export const confirmPasswordReset = asyncHandler(async (req, res) => {
  const { employee_external_id, otp_code, new_password } = validatePasswordResetConfirm(req.body);
  const user = await prisma.users.findUnique({ where: { employee_external_id } });

  if (!user?.is_active) {
    throw new AppError("Invalid or expired reset code", 400);
  }

  const candidates = await prisma.password_reset_tokens.findMany({
    where: {
      user_id: user.id,
      used_at: null,
      expires_at: { gt: new Date() },
    },
    orderBy: { created_at: "desc" },
    take: 5,
  });

  let matchedToken = null;
  for (const token of candidates) {
    if (await bcrypt.compare(otp_code, token.otp_code)) {
      matchedToken = token;
      break;
    }
  }

  if (!matchedToken) {
    throw new AppError("Invalid or expired reset code", 400);
  }

  const passwordHash = await hashPassword(new_password);
  await prisma.$transaction(async (tx) => {
    await tx.users.update({
      where: { id: user.id },
      data: { password_hash: passwordHash, updated_at: new Date() },
    });
    await tx.password_reset_tokens.update({
      where: { id: matchedToken.id },
      data: { used_at: new Date() },
    });
    await tx.refresh_tokens.deleteMany({ where: { user_id: user.id } });
    await writeAuditLog(
      {
        userId: user.id,
        action: "auth.password_reset.confirm",
        entityType: "users",
        entityId: user.id,
        description: "Password reset completed",
        ipAddress: req.ip,
      },
      tx,
    );
  });

  return successResponse(res, null, "Password reset successfully");
});
