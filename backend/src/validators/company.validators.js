import { AppError } from "../utils/AppError.js";
import {
  optionalString,
  requireString,
  toMoney,
  toPositiveMoney,
  toPositiveInt,
  validateFormat,
  validateMonth,
  validateEmployeePin,
  validatePassword,
  validatePhone,
  validateOptionalPhone,
} from "./common.validators.js";

const ALLOWED_ROLES = ["employee", "waiter", "cafe_manager", "company_manager"];

const parseBoolean = (value, fieldName) => {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new AppError(`${fieldName} must be true or false`, 400);
};

const validateRoles = (roles) => {
  if (roles === undefined) return ["employee"];
  if (!Array.isArray(roles) || roles.length === 0) {
    throw new AppError("roles must be a non-empty array", 400);
  }

  const uniqueRoles = [...new Set(roles)];
  for (const role of uniqueRoles) {
    if (!ALLOWED_ROLES.includes(role)) {
      throw new AppError(`Invalid role: ${role}`, 400);
    }
  }

  if (uniqueRoles.includes("company_manager")) {
    throw new AppError("company_manager role cannot be assigned through employee management", 403);
  }

  return uniqueRoles;
};

// Company managers manage company employees. Waiter accounts are created by
// the cafe manager assigned to that cafe, through the cafe routes.
const validateEmployeeOnlyRole = (roles) => {
  const parsed = validateRoles(roles);
  if (parsed.length !== 1 || parsed[0] !== "employee") {
    throw new AppError("Company managers can create employee accounts only", 403);
  }
  return parsed;
};

export const validateEmployeeCreate = (body) => ({
  employee_external_id: requireString(body.employee_external_id, "employee_external_id", 50),
  fullname: requireString(body.fullname, "fullname", 150),
  phone_number: validateOptionalPhone(body.phone_number),
  password: validateEmployeePin(body.password),
  department_id: body.department_id ? toPositiveInt(body.department_id, "department_id") : null,
  roles: validateEmployeeOnlyRole(body.roles),
  cafe_id: null,
});

export const validateEmployeeUpdate = (body) => {
  const payload = {};

  if (body.employee_external_id !== undefined) {
    payload.employee_external_id = requireString(body.employee_external_id, "employee_external_id", 50);
  }
  if (body.fullname !== undefined) payload.fullname = requireString(body.fullname, "fullname", 150);
  if (body.password !== undefined) payload.password = requireString(body.password, "password", 100);
  if (body.phone_number !== undefined) payload.phone_number = validateOptionalPhone(body.phone_number);
  if (body.department_id !== undefined) {
    payload.department_id = body.department_id ? toPositiveInt(body.department_id, "department_id") : null;
  }
  if (body.roles !== undefined) payload.roles = validateEmployeeOnlyRole(body.roles);
  if (body.cafe_id !== undefined) {
    throw new AppError("Cafe assignments are managed by cafe managers", 403);
  }
  if (body.is_active !== undefined) payload.is_active = parseBoolean(body.is_active, "is_active");

  if (Object.keys(payload).length === 0) {
    throw new AppError("At least one field is required", 400);
  }

  return payload;
};

export const validateDepartmentCreate = (body) => ({
  name: requireString(body.name, "name", 100),
});

export const validateDepartmentUpdate = validateDepartmentCreate;

export const validateCafeCreate = (body) => ({
  name: requireString(body.name, "name", 150),
  location: optionalString(body.location, "location", 255) ?? null,
});

export const validateCafeManagerCreate = (body) => ({
  employee_external_id: requireString(body.employee_external_id, "employee_external_id", 50),
  fullname: requireString(body.fullname, "fullname", 150),
  phone_number: validatePhone(body.phone_number),
  password: validatePassword(body.password),
  cafe_id: toPositiveInt(body.cafe_id, "cafe_id"),
});

export const validateAllocationCreate = (body) => ({
  user_id: toPositiveInt(body.user_id, "user_id"),
  amount: toPositiveMoney(body.amount, "amount"),
  month: validateMonth(body.month),
});

export const validateGroupAllocation = (body) => {
  const departmentId = body.department_id ? toPositiveInt(body.department_id, "department_id") : null;
  const appliesToAll = body.applies_to_all === true;
  if (!appliesToAll && !departmentId) throw new AppError("Select a department or all employees", 400);
  return {
    amount: toPositiveMoney(body.amount, "amount"),
    month: validateMonth(body.month),
    department_id: departmentId,
    applies_to_all: appliesToAll,
  };
};

export const validateAllocationUpdate = (body) => ({
  amount: toPositiveMoney(body.amount, "amount"),
});

export const validateMonthlyPaymentSchedule = (body) => {
  const paymentDate = requireString(body.payment_date, "payment_date", 10);
  const parsed = new Date(`${paymentDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || Number.isNaN(parsed.getTime())) {
    throw new AppError("payment_date must be a valid date in YYYY-MM-DD format", 400);
  }
  const departmentId = body.department_id ? toPositiveInt(body.department_id, "department_id") : null;
  const appliesToAll = body.applies_to_all === true;
  if (!appliesToAll && !departmentId) throw new AppError("Select a department or all employees", 400);
  return {
    amount: toPositiveMoney(body.amount, "amount"),
    payment_date: parsed,
    payout_day: parsed.getUTCDate(),
    department_id: departmentId,
    applies_to_all: appliesToAll,
    activation_key: requireString(body.activation_key, "activation_key", 128),
  };
};

export const validateScheduleActivation = (body) => ({
  activation_key: requireString(body.activation_key, "activation_key", 128),
});

export const validatePasswordReset = (body) => ({
  user_id: toPositiveInt(body.user_id, "user_id"),
  new_password: requireString(body.new_password, "new_password", 100),
});

export const validateCompanyManagerCreate = (body) => ({
  employee_external_id: requireString(body.employee_external_id, "employee_external_id", 50),
  fullname: requireString(body.fullname, "fullname", 150),
  phone_number: validatePhone(body.phone_number),
  password: validatePassword(body.password),
});

export const validateManagerPasswordChange = (body) => ({
  old_password: requireString(body.old_password, "old_password", 100),
  new_password: validatePassword(body.new_password, "new_password"),
});

export const validateId = (params, fieldName = "id") => toPositiveInt(params.id, fieldName);

export const validateCompanyReportQuery = (query) => ({
  month: validateMonth(query.month),
  format: validateFormat(query.format),
});

export const validateDepartmentUsageReportQuery = (query) => ({
  month: validateMonth(query.month),
  format: validateFormat(query.format),
  department_id: query.department_id ? toPositiveInt(query.department_id, "department_id") : undefined,
});

export const validateFeedbackQuery = (query) => ({
  cafe_id: query.cafe_id ? toPositiveInt(query.cafe_id, "cafe_id") : undefined,
  employee_id: query.employee_id ? toPositiveInt(query.employee_id, "employee_id") : undefined,
  search: optionalString(query.search, "search", 100),
  month: validateMonth(query.month),
});

export const validateEmployeeQuery = (query) => ({
  department_id: query.department_id ? toPositiveInt(query.department_id, "department_id") : undefined,
  role: query.role && ALLOWED_ROLES.includes(query.role) ? query.role : query.role ? (() => {
    throw new AppError("Invalid role filter", 400);
  })() : undefined,
  is_active: query.is_active === undefined ? undefined : parseBoolean(query.is_active, "is_active"),
  search: optionalString(query.search, "search", 100),
});
