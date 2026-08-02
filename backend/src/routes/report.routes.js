import express from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { ROLES } from "../config/constants.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendReportResponse } from "../utils/report.js";
import { generateMonthlyReport } from "../services/company.service.js";
import { validateCompanyReportQuery } from "../validators/company.validators.js";

const router = express.Router();

router.use(authenticate);
router.use(requireRole(ROLES.COMPANY_MANAGER, ROLES.CAFE_MANAGER));

// GET /api/reports/monthly?month=YYYY-MM&format=xlsx|csv|pdf|json
router.get("/monthly", asyncHandler(async (req, res) => {
  const actor = req.user;
  const params = validateCompanyReportQuery(req.query);
  const report = await generateMonthlyReport(actor, params, req.ip);

  if (report.format === "json") {
    return res.json({ success: true, data: report.data, message: "Monthly report generated successfully" });
  }

  return sendReportResponse(res, report);
}));

export default router;
