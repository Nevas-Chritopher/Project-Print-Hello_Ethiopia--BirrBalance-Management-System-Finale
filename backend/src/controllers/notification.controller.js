import { successResponse } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { parsePagination } from "../validators/common.validators.js";
import {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  clearAllNotifications,
} from "../services/notification.service.js";
import {
  validateNotificationCreate,
  validateNotificationId,
} from "../validators/notification.validators.js";

export const listNotifications = asyncHandler(async (req, res) => {
  const data = await getNotifications(req.user, parsePagination(req.query), req.ip);
  return successResponse(res, data, "Notifications fetched successfully");
});

export const unreadCount = asyncHandler(async (req, res) => {
  const count = await getUnreadCount(req.user, req.ip);
  return successResponse(res, { count }, "Unread notification count fetched successfully");
});

export const markRead = asyncHandler(async (req, res) => {
  const notification = await markNotificationRead(req.user, validateNotificationId(req.params), req.ip);
  return successResponse(res, notification, "Notification marked as read");
});

export const markAllRead = asyncHandler(async (req, res) => {
  const result = await markAllNotificationsRead(req.user, req.ip);
  return successResponse(res, result, "All notifications marked as read");
});

export const clearAll = asyncHandler(async (req, res) => {
  const result = await clearAllNotifications(req.user, req.ip);
  return successResponse(res, result, "All notifications cleared");
});

export const createNotificationForUser = asyncHandler(async (req, res) => {
  const payload = validateNotificationCreate(req.body);
  const notification = await createNotification(
    {
      userId: payload.user_id,
      title: payload.title,
      message: payload.message,
      type: payload.type,
    },
    req.user,
    req.ip,
  );
  return successResponse(res, notification, "Notification created successfully", 201);
});
