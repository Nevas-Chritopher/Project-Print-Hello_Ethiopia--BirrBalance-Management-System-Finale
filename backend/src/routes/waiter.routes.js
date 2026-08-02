import express from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { ROLES } from "../config/constants.js";
import {
  scanQR,
  lookupEmployee,
  changeWaiterPassword,
  createOfflineOrder,
  syncOfflineOrders,
} from "../controllers/waiter.controller.js";

const router = express.Router();

router.use(authenticate);
router.use(requireRole(ROLES.WAITER));
router.patch("/password", changeWaiterPassword);

router.post("/scan", scanQR);
router.post("/lookup-employee", lookupEmployee);
router.post("/order", createOfflineOrder);
router.post("/sync-orders", syncOfflineOrders);

export default router;
