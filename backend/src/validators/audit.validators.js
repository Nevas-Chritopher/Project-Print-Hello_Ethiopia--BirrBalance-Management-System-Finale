import { optionalString, toPositiveInt } from "./common.validators.js";
import { AppError } from "../utils/AppError.js";

const parseDate = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`${fieldName} must be a valid date`, 400);
  }
  return date;
};

export const validateAuditLogQuery = (query) => ({
  action: optionalString(query.action, "action", 100),
  user_id: query.user_id ? toPositiveInt(query.user_id, "user_id") : undefined,
  from: parseDate(query.from, "from"),
  to: parseDate(query.to, "to"),
});
