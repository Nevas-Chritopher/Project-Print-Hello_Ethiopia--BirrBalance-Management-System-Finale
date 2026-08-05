import { AppError } from "../utils/AppError.js";
import {
  optionalString,
  requireString,
  toPositiveMoney,
  toPositiveInt,
  validateFormat,
  validateMonth,
} from "./common.validators.js";
import { validatePassword, validateOptionalPhone } from "./common.validators.js";

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
  // A phone number is useful but must not prevent a cafe manager from
  // creating a waiter account.  The service supplies a safe internal value
  // for older databases that still require the column.
  phone_number: validateOptionalPhone(body.phone_number),
  password: validatePassword(body.password),
});

export const validateWaiterUpdate = (body) => {
  const payload = {};
  if (body.employee_external_id !== undefined) payload.employee_external_id = requireString(body.employee_external_id, "employee_external_id", 50);
  if (body.fullname !== undefined) payload.fullname = requireString(body.fullname, "fullname", 150);
  if (body.phone_number !== undefined) payload.phone_number = validateOptionalPhone(body.phone_number);
  if (body.department_id !== undefined) payload.department_id = body.department_id ? toPositiveInt(body.department_id, "department_id") : null;
  if (body.password !== undefined) payload.password = validatePassword(body.password);
  if (Object.keys(payload).length === 0) throw new AppError("At least one field is required", 400);
  return payload;
};

const validateMenuPrice = (value) => {
  const price = toPositiveMoney(value, "price");
  if (price > 10000) {
    throw new AppError("price exceeds the allowed maximum", 400);
  }
  return price;
};
