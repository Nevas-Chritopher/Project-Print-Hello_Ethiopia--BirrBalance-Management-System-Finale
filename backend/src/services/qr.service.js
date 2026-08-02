import CryptoJS from "crypto-js";
import crypto from "crypto";
import env from "../config/env.js";
import { AppError } from "../utils/AppError.js";

const QR_TOKEN_TTL_MINUTES = 10;
const QR_SESSION_TTL_MINUTES = 3;

export const hashQRToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
export const hashQRSessionId = (sessionId) => crypto.createHash("sha256").update(sessionId).digest("hex");

export const generateQRToken = (employeeId) => {
  const expiresAt = new Date(Date.now() + QR_TOKEN_TTL_MINUTES * 60 * 1000);
  const payload = JSON.stringify({
    employee_id: employeeId,
    nonce: crypto.randomBytes(16).toString("hex"),
    issued_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  return {
    token: CryptoJS.AES.encrypt(payload, env.AES_SECRET).toString(),
    expiresAt,
  };
};

export const decryptQRToken = (token) => {
  try {
    const bytes = CryptoJS.AES.decrypt(token, env.AES_SECRET);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);

    if (!decrypted) {
      return null;
    }

    const payload = JSON.parse(decrypted);
    if (!payload.employee_id || !payload.expires_at || new Date(payload.expires_at) <= new Date()) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
};

export const createQRSession = async ({ employeeId, waiterId, cafeId, tx }) => {
  const qrSessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + QR_SESSION_TTL_MINUTES * 60 * 1000);

  await tx.qr_sessions.create({
    data: {
      session_hash: hashQRSessionId(qrSessionId),
      employee_id: employeeId,
      waiter_id: waiterId,
      cafe_id: cafeId,
      expires_at: expiresAt,
    },
  });

  return { qrSessionId, expiresAt };
};

export const consumeQRSession = async ({ sessionId, employeeId, waiterId, cafeId, tx }) => {
  const sessionHash = hashQRSessionId(sessionId);
  const session = await tx.qr_sessions.findUnique({
    where: { session_hash: sessionHash },
  });

  if (
    !session ||
    session.employee_id !== employeeId ||
    session.waiter_id !== waiterId ||
    session.cafe_id !== cafeId ||
    session.used_at ||
    session.expires_at <= new Date()
  ) {
    throw new AppError("QR session is invalid, expired, or already used", 409);
  }

  const result = await tx.qr_sessions.updateMany({
    where: {
      id: session.id,
      used_at: null,
      expires_at: { gt: new Date() },
    },
    data: { used_at: new Date() },
  });

  if (result.count !== 1) {
    throw new AppError("QR session is invalid, expired, or already used", 409);
  }

  return session;
};
