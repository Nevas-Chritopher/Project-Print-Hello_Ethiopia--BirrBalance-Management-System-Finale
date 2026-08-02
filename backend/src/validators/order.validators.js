import { AppError } from "../utils/AppError.js";
import { requireString, toPositiveInt } from "./common.validators.js";

const MAX_ITEMS_PER_ORDER = 20;
const MAX_QUANTITY_PER_ITEM = 10;
const ORDER_STATUSES = ["pending", "confirmed", "preparing", "ready", "completed", "cancelled", "refunded"];

const validateOrderItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("items must be a non-empty array", 400);
  }

  if (items.length > MAX_ITEMS_PER_ORDER) {
    throw new AppError(`items cannot contain more than ${MAX_ITEMS_PER_ORDER} entries`, 400);
  }

  return items.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new AppError(`items[${index}] must be an object`, 400);
    }

    const quantity = toPositiveInt(item.quantity, `items[${index}].quantity`);
    if (quantity > MAX_QUANTITY_PER_ITEM) {
      throw new AppError(`items[${index}].quantity cannot exceed ${MAX_QUANTITY_PER_ITEM}`, 400);
    }

    return {
      menu_item_id: toPositiveInt(item.menu_item_id, `items[${index}].menu_item_id`),
      quantity,
    };
  });
};

export const validateOnlineOrder = (body) => ({
  cafe_id: toPositiveInt(body.cafe_id, "cafe_id"),
  items: validateOrderItems(body.items),
});

export const validateOfflineOrder = (body) => ({
  employee_id: toPositiveInt(body.employee_id, "employee_id"),
  cafe_id: toPositiveInt(body.cafe_id, "cafe_id"),
  qr_session_id: requireString(body.qr_session_id, "qr_session_id", 128),
  password: requireString(body.password, "password", 100),
  items: validateOrderItems(body.items),
});

export const validateOrderId = (params) => toPositiveInt(params.id, "order id");

export const validateOrderStatusUpdate = (body) => {
  const status = requireString(body.status, "status", 20);
  if (!ORDER_STATUSES.includes(status)) {
    throw new AppError(`status must be one of ${ORDER_STATUSES.join(", ")}`, 400);
  }
  if (status === "cancelled" || status === "refunded") {
    throw new AppError("Use the dedicated cancel or refund endpoint for this status", 400);
  }
  return { status };
};
