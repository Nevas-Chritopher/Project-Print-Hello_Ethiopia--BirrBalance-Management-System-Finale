import { AppError } from "../utils/AppError.js";
import { requireString, toPositiveInt, toPositiveMoney } from "./common.validators.js";

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

const validateOrderPayment = (body) => {
  if (body.manual_total !== undefined && body.manual_total !== null && body.manual_total !== "") {
    return { items: [], manual_total: toPositiveMoney(body.manual_total, "manual_total") };
  }
  return { items: validateOrderItems(body.items), manual_total: undefined };
};

export const validateOnlineOrder = (body) => ({
  cafe_id: toPositiveInt(body.cafe_id, "cafe_id"),
  items: validateOrderItems(body.items),
});

export const validateOfflineOrder = (body, { requireQrSession = true } = {}) => ({
  employee_id: toPositiveInt(body.employee_id, "employee_id"),
  cafe_id: toPositiveInt(body.cafe_id, "cafe_id"),
  qr_session_id: requireQrSession ? requireString(body.qr_session_id, "qr_session_id", 128) : undefined,
  password: requireString(body.password, "password", 100),
  ...validateOrderPayment(body),
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
