import express from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { ROLES } from "../config/constants.js";
import {
  getProfile,
  getBalance,
  getLedger,
  getOrders,
  generateQR,
  createOnlineOrder,
  createFeedback,
  changePassword,
  sendMessageToCompanyManagers,
} from "../controllers/employee.controller.js";
import { listActiveCafes, listPublicMenuItems } from "../controllers/cafe.controller.js";

const router = express.Router();

router.use(authenticate);
router.use(requireRole(ROLES.EMPLOYEE));

router.get("/profile", getProfile);
router.get("/balance", getBalance);
router.get("/ledger", getLedger);
router.get("/orders", getOrders);
router.get("/cafes", listActiveCafes);
router.get("/cafes/:cafeId/menu", listPublicMenuItems);
router.post("/orders", createOnlineOrder);
router.post("/generate-qr", generateQR);
router.post("/feedback", createFeedback);
router.post("/messages", sendMessageToCompanyManagers);
router.patch("/password", changePassword);


export default router;
