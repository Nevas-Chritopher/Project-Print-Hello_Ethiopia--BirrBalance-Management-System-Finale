import { successResponse } from "../utils/response.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendReportResponse } from "../utils/report.js";
import { AppError } from "../utils/AppError.js";
import { parsePagination } from "../validators/common.validators.js";
import {
  createMenuItem,
  deleteMenuItem,
  getCafeFeedback,
  getCafeOrders,
  getCafeStatistics,
  getCafeWaiters,
  getActiveCafes,
  getMenuItems,
  getOperationalReport,
  getPublicMenuItems,
  setMenuItemAvailability,
  updateMenuItem,
} from "../services/cafe.service.js";
import {
  validateAvailability,
  validateCafeAnalyticsQuery,
  validateCafeReportQuery,
  validateMenuItemCreate,
  validateMenuItemId,
  validateMenuItemUpdate,
  validateWaiterCreate,
} from "../validators/cafe.validators.js";
import { createEmployee } from "../services/company.service.js";
import { getMonthRange } from "../utils/date.js";

export const listMenuItems = asyncHandler(async (req, res) => {
  const items = await getMenuItems(req.user, req.ip);
  return successResponse(res, items, "Menu items fetched successfully");
});

export const listPublicMenuItems = asyncHandler(async (req, res) => {
  const cafeId = Number(req.params.cafeId);
  if (!Number.isInteger(cafeId) || cafeId <= 0) {
    throw new AppError("cafe id must be a positive integer", 400);
  }
  const items = await getPublicMenuItems(cafeId);
  return successResponse(res, items, "Menu items fetched successfully");
});

export const listActiveCafes = asyncHandler(async (_req, res) => {
  const cafes = await getActiveCafes();
  return successResponse(res, cafes, "Active cafes fetched successfully");
});

export const listCafeOrders = asyncHandler(async (req, res) => {
  const data = await getCafeOrders(req.user, parsePagination(req.query), req.ip);
  return successResponse(res, data, "Cafe orders fetched successfully");
});

export const listCafeWaiters = asyncHandler(async (req, res) => {
  const waiters = await getCafeWaiters(req.user, req.ip);
  return successResponse(res, waiters, "Cafe waiters fetched successfully");
});

export const addCafeWaiter = asyncHandler(async (req, res) => {
  if (!req.user.cafeId) throw new AppError("Cafe manager is not assigned to a cafe", 403);
  const payload = validateWaiterCreate(req.body);
  const waiter = await createEmployee(req.user, {
    ...payload,
    department_id: null,
    roles: ["waiter"],
    cafe_id: req.user.cafeId,
  }, req.ip);
  return successResponse(res, waiter, "Waiter created successfully", 201);
});

export const listCafeFeedback = asyncHandler(async (req, res) => {
  const data = await getCafeFeedback(req.user, parsePagination(req.query), req.ip);
  return successResponse(res, data, "Cafe feedback fetched successfully");
});

export const addMenuItem = asyncHandler(async (req, res) => {
  const payload = validateMenuItemCreate(req.body);
  const item = await createMenuItem(req.user, payload, req.file, req.ip);
  return successResponse(res, item, "Menu item created successfully", 201);
});

export const editMenuItem = asyncHandler(async (req, res) => {
  const id = validateMenuItemId(req.params);
  const payload = validateMenuItemUpdate(req.body);
  const item = await updateMenuItem(req.user, id, payload, req.file, req.ip);
  return successResponse(res, item, "Menu item updated successfully");
});

export const removeMenuItem = asyncHandler(async (req, res) => {
  const id = validateMenuItemId(req.params);
  const result = await deleteMenuItem(req.user, id, req.ip);
  return successResponse(res, result, result.message);
});

export const markMenuItemAvailability = asyncHandler(async (req, res) => {
  const id = validateMenuItemId(req.params);
  const payload = validateAvailability(req.body);
  const item = await setMenuItemAvailability(req.user, id, payload.is_available, req.ip);
  return successResponse(res, item, "Menu item availability updated successfully");
});

export const cafeAnalytics = asyncHandler(async (req, res) => {
  const params = validateCafeAnalyticsQuery(req.query);
  const monthRange = params.month ? getMonthRange(params.month) : null;
  const dateRange = monthRange
    ? { monthStart: monthRange.start, monthEnd: monthRange.end }
    : null;
  const stats = await getCafeStatistics(req.user, dateRange, req.ip);
  return successResponse(res, stats, "Cafe analytics fetched successfully");
});

export const cafeOperationalReport = asyncHandler(async (req, res) => {
  const params = validateCafeReportQuery(req.query);
  const report = await getOperationalReport(req.user, params, req.ip);

  if (report.format === "json") {
    return successResponse(res, report.data, "Cafe operational report generated successfully");
  }

  return sendReportResponse(res, report);
});
