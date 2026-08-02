import express from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { ROLES } from "../config/constants.js";
import {
  getProfile,
  getBalance,
  getOrders,
  generateQR,
  createOnlineOrder,
  createFeedback,
  changePassword,
} from "../controllers/employee.controller.js";
import { listPublicMenuItems } from "../controllers/cafe.controller.js";

const router = express.Router();

router.use(authenticate);
router.use(requireRole(ROLES.EMPLOYEE));

router.get("/profile", getProfile);
router.get("/balance", getBalance);
router.get("/orders", getOrders);
router.get("/cafes/:cafeId/menu", listPublicMenuItems);
router.post("/orders", createOnlineOrder);
router.post("/generate-qr", generateQR);
router.post("/feedback", createFeedback);
router.patch("/password", changePassword);


export default router;
