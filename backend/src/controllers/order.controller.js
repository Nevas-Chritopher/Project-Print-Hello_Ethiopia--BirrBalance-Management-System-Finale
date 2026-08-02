import { cancelOrder, refundOrder, updateOrderStatus } from "../services/order.service.js";
import { successResponse } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  validateOrderId,
  validateOrderStatusUpdate,
} from "../validators/order.validators.js";

export const patchOrderStatus = asyncHandler(async (req, res) => {
  const orderId = validateOrderId(req.params);
  const payload = validateOrderStatusUpdate(req.body);
  const order = await updateOrderStatus({
    orderId,
    status: payload.status,
    actor: req.user,
    ipAddress: req.ip,
  });

  return successResponse(res, order, "Order status updated successfully");
});

export const patchOrderCancel = asyncHandler(async (req, res) => {
  const result = await cancelOrder({
    orderId: validateOrderId(req.params),
    actor: req.user,
    ipAddress: req.ip,
  });

  return successResponse(res, result, "Order cancelled successfully");
});

export const postOrderRefund = asyncHandler(async (req, res) => {
  const result = await refundOrder({
    orderId: validateOrderId(req.params),
    actor: req.user,
    ipAddress: req.ip,
  });

  return successResponse(res, result, "Order refunded successfully");
});
