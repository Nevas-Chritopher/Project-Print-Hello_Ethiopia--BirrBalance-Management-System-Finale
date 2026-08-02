import { AppError } from "../utils/AppError.js";

export const toPositiveInt = (value, fieldName = "id") => {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new AppError(`${fieldName} must be a positive integer`, 400);
  }

  return numberValue;
};

export const toMoney = (value, fieldName = "amount") => {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 99999999.99) {
    throw new AppError(`${fieldName} must be a non-negative number`, 400);
  }

  return Number(numberValue.toFixed(2));
};

export const toPositiveMoney = (value, fieldName = "amount") => {
  const numberValue = toMoney(value, fieldName);

  if (numberValue <= 0) {
    throw new AppError(`${fieldName} must be greater than zero`, 400);
  }

  return numberValue;
};

export const requireString = (value, fieldName, maxLength = 255) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AppError(`${fieldName} is required`, 400);
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new AppError(`${fieldName} must be at most ${maxLength} characters`, 400);
  }

  return trimmed;
};

export const optionalString = (value, fieldName, maxLength = 255) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return requireString(value, fieldName, maxLength);
};

export const validateEmail = (value, fieldName = "email") => {
  const email = optionalString(value, fieldName, 150);
  if (!email) return null;

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    throw new AppError(`${fieldName} must be a valid email address`, 400);
  }

  return email.toLowerCase();
};

export const validatePhone = (value, fieldName = "phone_number") => {
  const phone = requireString(value, fieldName, 20);
  const phonePattern = /^\+?[0-9]{9,15}$/;

  if (!phonePattern.test(phone)) {
    throw new AppError(`${fieldName} must be a valid phone number`, 400);
  }

  return phone;
};

export const validatePassword = (value, fieldName = "password") => {
  const password = requireString(value, fieldName, 100);
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  if (password.length < 8 || !hasLower || !hasUpper || !hasNumber) {
    throw new AppError(`${fieldName} must be at least 8 characters and include uppercase, lowercase, and number`, 400);
  }

  return password;
};

export const parsePagination = (query) => {
  const page = Math.max(Number.parseInt(query.page || "1", 10), 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit || "20", 10), 1), 100);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

export const parseSort = (query, allowedFields, defaultSort = "-created_at") => {
  const rawSort = optionalString(query.sort, "sort", 50) ?? defaultSort;
  const direction = rawSort.startsWith("-") ? "desc" : "asc";
  const field = rawSort.replace(/^-/, "");

  if (!allowedFields.includes(field)) {
    throw new AppError(`sort must be one of ${allowedFields.join(", ")}`, 400);
  }

  return { [field]: direction };
};

export const validateFormat = (format) => {
  const value = format || "json";
  const allowed = ["json", "csv", "xlsx", "pdf"];

  if (!allowed.includes(value)) {
    throw new AppError("format must be one of json, csv, xlsx, pdf", 400);
  }

  return value;
};

export const validateMonth = (month) => {
  if (month === undefined || month === null || month === "") return undefined;
  const value = requireString(month, "month", 7);

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new AppError("month must use YYYY-MM format", 400);
  }

  return value;
};
