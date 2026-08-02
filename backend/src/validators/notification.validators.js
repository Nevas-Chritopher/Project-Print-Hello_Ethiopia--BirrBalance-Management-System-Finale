import { requireString, toPositiveInt } from "./common.validators.js";
import { AppError } from "../utils/AppError.js";

const TYPES = ["low_balance", "allocation", "order_confirmed", "order_status", "refund", "feedback", "password_reset"];

export const validateNotificationCreate = (body) => {
  if (!TYPES.includes(body.type)) {
    throw new AppError("Invalid notification type", 400);
  }

  return {
    user_id: toPositiveInt(body.user_id, "user_id"),
    title: requireString(body.title, "title", 150),
    message: requireString(body.message, "message", 1000),
    type: body.type,
  };
};

export const validateNotificationId = (params) => toPositiveInt(params.id, "notification id");
