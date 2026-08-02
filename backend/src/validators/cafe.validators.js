import { AppError } from "../utils/AppError.js";
import {
  optionalString,
  requireString,
  toPositiveMoney,
  toPositiveInt,
  validateFormat,
  validateMonth,
} from "./common.validators.js";
import { validateEmail, validatePassword, validatePhone } from "./common.validators.js";

const parseBoolean = (value, fieldName) => {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new AppError(`${fieldName} must be true or false`, 400);
};

export const validateMenuItemCreate = (body) => ({
  name: requireString(body.name, "name", 150),
  description: optionalString(body.description, "description", 1000) ?? null,
  price: validateMenuPrice(body.price),
  is_available: parseBoolean(body.is_available, "is_available") ?? true,
});

export const validateMenuItemUpdate = (body) => {
  const payload = {};

  if (body.name !== undefined) payload.name = requireString(body.name, "name", 150);
  if (body.description !== undefined) {
    payload.description = optionalString(body.description, "description", 1000) ?? null;
  }
  if (body.price !== undefined) payload.price = validateMenuPrice(body.price);
  if (body.is_available !== undefined) {
    payload.is_available = parseBoolean(body.is_available, "is_available");
  }

  if (Object.keys(payload).length === 0) {
    throw new AppError("At least one field is required", 400);
  }

  return payload;
};

export const validateAvailability = (body) => ({
  is_available: (() => {
    const value = parseBoolean(body.is_available, "is_available");
    if (value === undefined) throw new AppError("is_available is required", 400);
    return value;
  })(),
});

export const validateMenuItemId = (params) => toPositiveInt(params.id, "menu item id");

export const validateCafeReportQuery = (query) => ({
  month: validateMonth(query.month),
  format: validateFormat(query.format),
});

export const validateCafeAnalyticsQuery = (query) => ({
  month: validateMonth(query.month),
});

export const validateWaiterCreate = (body) => ({
  employee_external_id: requireString(body.employee_external_id, "employee_external_id", 50),
  fullname: requireString(body.fullname, "fullname", 150),
  email: validateEmail(body.email),
  phone_number: validatePhone(body.phone_number),
  password: validatePassword(body.password),
});

const validateMenuPrice = (value) => {
  const price = toPositiveMoney(value, "price");
  if (price > 10000) {
    throw new AppError("price exceeds the allowed maximum", 400);
  }
  return price;
};
