import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import env from "../config/env.js";

export const hashPassword = async (password) => {
  return await bcrypt.hash(password, 12);
};

export const comparePassword = async (password, hashedPassword) => {
  if (!hashedPassword) return false;

  if (typeof hashedPassword === 'string' && hashedPassword.startsWith('$2')) {
    return await bcrypt.compare(password, hashedPassword);
  }

  if (typeof hashedPassword === 'string' && hashedPassword === password) {
    return true;
  }

  return false;
};

export const generateAccessToken = (payload) => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET);
};

export const generateToken = generateAccessToken;
