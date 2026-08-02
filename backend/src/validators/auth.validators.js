import { AppError } from "../utils/AppError.js";
import { requireString, validatePassword } from "./common.validators.js";

export const validateLogin = (body) => ({
  employee_external_id: requireString(body.employee_external_id, "employee_external_id", 50),
  password: requireString(body.password, "password", 100),
});

export const validateRefreshRequest = (body) => ({
  refresh_token: requireString(body.refresh_token, "refresh_token", 200),
});

export const validateLogoutRequest = validateRefreshRequest;

export const validatePasswordResetRequest = (body) => ({
  employee_external_id: requireString(body.employee_external_id, "employee_external_id", 50),
});

export const validatePasswordResetConfirm = (body) => ({
  employee_external_id: requireString(body.employee_external_id, "employee_external_id", 50),
  otp_code: requireString(body.otp_code, "otp_code", 10),
  new_password: validatePassword(body.new_password, "new_password"),
});
