import CryptoJS from "crypto-js";
import crypto from "crypto";
import env from "../config/env.js";
import { AppError } from "../utils/AppError.js";

const QR_TOKEN_TTL_MINUTES = 10;
const QR_SESSION_TTL_MINUTES = 3;
const QR_TOKEN_VERSION = "v1";

export const hashQRToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
export const hashQRSessionId = (sessionId) => crypto.createHash("sha256").update(sessionId).digest("hex");

// QR readers recognize URLs and open them directly. Keep the host configurable
// so deployed environments do not need a source-code change when their IP/domain changes.
export const buildWaiterPanelUrl = (employeeId) => {
  const url = new URL(env.WAITER_PANEL_URL);
  url.searchParams.set("id", String(employeeId));
  return url.toString();
};

const createStableQRToken = (employeeId) => {
  const payload = `${QR_TOKEN_VERSION}:${employeeId}`;
  const signature = crypto.createHmac("sha256", env.AES_SECRET).update(payload).digest("hex");
  return `${payload}:${signature}`;
};

export const generateQRToken = (employeeId, ttlMinutes = null) => {
  const token = createStableQRToken(employeeId);
  const expiresAt = ttlMinutes === null ? null : new Date(Date.now() + ttlMinutes * 60 * 1000);
  return { token, expiresAt };
};

const parseStableQRToken = (token) => {
  const parts = token.split(":");
  if (parts.length !== 3) {
    return null;
  }

  const [version, employeeId, signature] = parts;
  if (version !== QR_TOKEN_VERSION || !/^[0-9]+$/.test(employeeId) || signature.length !== 64) {
    return null;
  }

  const expectedSignature = crypto.createHmac("sha256", env.AES_SECRET).update(`${version}:${employeeId}`).digest("hex");
  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  return { employee_id: Number(employeeId) };
};

export const decryptQRToken = (token) => {
  try {
    const stablePayload = parseStableQRToken(token);
    if (stablePayload) {
      return stablePayload;
    }

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
