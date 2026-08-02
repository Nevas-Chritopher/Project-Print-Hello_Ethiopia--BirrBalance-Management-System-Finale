import express from "express";
import {
  addMenuItem,
  addCafeWaiter,
  cafeAnalytics,
  cafeOperationalReport,
  editMenuItem,
  listCafeFeedback,
  listCafeOrders,
  listCafeWaiters,
  listMenuItems,
  markMenuItemAvailability,
  removeMenuItem,
} from "../controllers/cafe.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { uploadMenuImage } from "../middleware/upload.middleware.js";
import { ROLES } from "../config/constants.js";

const router = express.Router();

router.use(authenticate);

// Waiters need the menu to build offline orders; everything else stays manager-only.
router.get("/menu", requireRole(ROLES.CAFE_MANAGER, ROLES.WAITER), listMenuItems);

router.use(requireRole(ROLES.CAFE_MANAGER));

router.post("/menu", uploadMenuImage.single("image"), addMenuItem);
router.patch("/menu/:id", uploadMenuImage.single("image"), editMenuItem);
router.delete("/menu/:id", removeMenuItem);
router.patch("/menu/:id/availability", markMenuItemAvailability);

router.get("/orders", listCafeOrders);
router.get("/waiters", listCafeWaiters);
router.post("/waiters", addCafeWaiter);
router.get("/feedback", listCafeFeedback);

router.get("/analytics", cafeAnalytics);
router.get("/reports/operational", cafeOperationalReport);

export default router;
