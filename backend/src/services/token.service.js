import crypto from "crypto";
import prisma from "../config/db.js";
import env from "../config/env.js";
import { AppError } from "../utils/AppError.js";

const parseDuration = (duration) => {
  if (typeof duration !== "string") return 0;
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return Number(duration) * 1000;

  const value = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return value * 1000;
  }
};

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

export const generateRefreshToken = async (userId) => {
  const refreshToken = crypto.randomBytes(64).toString("hex");
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseDuration(env.REFRESH_TOKEN_EXPIRES_IN));

  await prisma.refresh_tokens.create({
    data: {
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    },
  });

  return refreshToken;
};

export const verifyRefreshToken = async (refreshToken) => {
  const tokenHash = hashToken(refreshToken);

  const storedToken = await prisma.refresh_tokens.findFirst({
    where: {
      token_hash: tokenHash,
      expires_at: { gt: new Date() },
    },
    include: {
      users: {
        include: {
          user_roles: {
            include: { roles: true },
          },
        },
      },
    },
  });

  if (!storedToken) {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  return storedToken;
};

export const revokeRefreshToken = async (refreshToken) => {
  const tokenHash = hashToken(refreshToken);
  await prisma.refresh_tokens.deleteMany({ where: { token_hash: tokenHash } });
};

export const revokeUserRefreshTokens = async (userId) => {
  await prisma.refresh_tokens.deleteMany({ where: { user_id: userId } });
};
