import express from "express";
import {
  createNotificationForUser,
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
  clearAll,
} from "../controllers/notification.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { ROLES } from "../config/constants.js";

console.log("### notification.routes.js loaded - GET routes have no requireRole ###");

const router = express.Router();

router.use(authenticate);

router.get("/", listNotifications);
router.get("/unread-count", unreadCount);
router.patch("/read-all", markAllRead);
router.patch("/clear-all", clearAll);
router.patch("/:id/read", markRead);
router.post("/", requireRole(ROLES.COMPANY_MANAGER, ROLES.CAFE_MANAGER), createNotificationForUser);

export default router;
