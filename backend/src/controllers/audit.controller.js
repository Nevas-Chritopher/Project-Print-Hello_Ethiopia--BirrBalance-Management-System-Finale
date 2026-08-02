import { listAuditLogs } from "../services/audit.service.js";
import { successResponse } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { parsePagination } from "../validators/common.validators.js";
import { validateAuditLogQuery } from "../validators/audit.validators.js";

export const getAuditLogs = asyncHandler(async (req, res) => {
  const data = await listAuditLogs(
    validateAuditLogQuery(req.query),
    parsePagination(req.query),
  );

  return successResponse(res, data, "Audit logs fetched successfully");
});
