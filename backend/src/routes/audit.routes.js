import express from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { ROLES } from "../config/constants.js";
import { getAuditLogs } from "../controllers/audit.controller.js";

const router = express.Router();

router.get("/", authenticate, requireRole(ROLES.COMPANY_MANAGER), getAuditLogs);

export default router;
