import express from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { ROLES } from "../config/constants.js";
import {
  patchOrderCancel,
  patchOrderStatus,
  postOrderRefund,
} from "../controllers/order.controller.js";

const router = express.Router();

router.use(authenticate);

router.patch(
  "/:id/status",
  requireRole(ROLES.WAITER, ROLES.COMPANY_MANAGER),
  patchOrderStatus,
);
router.patch(
  "/:id/cancel",
  requireRole(ROLES.EMPLOYEE, ROLES.WAITER, ROLES.CAFE_MANAGER, ROLES.COMPANY_MANAGER),
  patchOrderCancel,
);
router.post(
  "/:id/refund",
  requireRole(ROLES.CAFE_MANAGER, ROLES.COMPANY_MANAGER),
  postOrderRefund,
);

export default router;
