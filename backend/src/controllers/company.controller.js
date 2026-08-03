import { successResponse } from "../utils/response.js";
import { processMonthlyPayments } from "../jobs/monthlyPayments.job.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { parsePagination } from "../validators/common.validators.js";
import { sendReportResponse } from "../utils/report.js";
import {
  assignMonthlyBalance,
  createMonthlyPaymentSchedule,
  createDepartment,
  createCafe,
  createEmployee,
  deleteDepartment,
  removeCafe,
  generateFinancialReport,
  generateMonthlyReport,
  listEmployees,
  listDepartments,
  listFeedback,
  listCafes,
  removeEmployee,
  resetEmployeePassword,
  setEmployeeActive,
  updateDepartment,
  updateEmployee,
  updateMonthlyAllocation,
} from "../services/company.service.js";
import {
  validateAllocationCreate,
  validateAllocationUpdate,
  validateMonthlyPaymentSchedule,
  validateCompanyReportQuery,
  validateCafeCreate,
  validateCafeManagerCreate,
  validateDepartmentCreate,
  validateDepartmentUpdate,
  validateEmployeeCreate,
  validateEmployeeQuery,
  validateEmployeeUpdate,
  validateFeedbackQuery,
  validateId,
  validatePasswordReset,
} from "../validators/company.validators.js";

export const addCafe = asyncHandler(async (req, res) => {
  const cafe = await createCafe(req.user, validateCafeCreate(req.body), req.ip);
  return successResponse(res, cafe, "Cafe created successfully", 201);
});

export const getCafes = asyncHandler(async (_req, res) => {
  const cafes = await listCafes();
  return successResponse(res, cafes, "Cafes fetched successfully");
});

export const deleteCafe = asyncHandler(async (req, res) => {
  const cafe = await removeCafe(req.user, validateId(req.params, "cafe id"), req.ip);
  return successResponse(res, cafe, "Cafe deleted successfully");
});

export const addCafeManager = asyncHandler(async (req, res) => {
  const payload = validateCafeManagerCreate(req.body);
  const manager = await createEmployee(req.user, {
    ...payload,
    department_id: null,
    roles: ["cafe_manager"],
  }, req.ip);
  return successResponse(res, manager, "Cafe manager created successfully", 201);
});

export const addEmployee = asyncHandler(async (req, res) => {
  const employee = await createEmployee(req.user, validateEmployeeCreate(req.body), req.ip);
  return successResponse(res, employee, "Employee created successfully", 201);
});

export const getEmployees = asyncHandler(async (req, res) => {
  const data = await listEmployees(req.user, validateEmployeeQuery(req.query), parsePagination(req.query), req.ip);
  return successResponse(res, data, "Employees fetched successfully");
});

export const editEmployee = asyncHandler(async (req, res) => {
  const employee = await updateEmployee(
    req.user,
    validateId(req.params, "employee id"),
    validateEmployeeUpdate(req.body),
    req.ip,
  );
  return successResponse(res, employee, "Employee updated successfully");
});

export const deleteEmployee = asyncHandler(async (req, res) => {
  const employee = await removeEmployee(req.user, validateId(req.params, "employee id"), req.ip);
  return successResponse(res, employee, "Employee removed successfully");
});

export const activateEmployee = asyncHandler(async (req, res) => {
  const employee = await setEmployeeActive(req.user, validateId(req.params, "employee id"), true, req.ip);
  return successResponse(res, employee, "Employee activated successfully");
});

export const deactivateEmployee = asyncHandler(async (req, res) => {
  const employee = await setEmployeeActive(req.user, validateId(req.params, "employee id"), false, req.ip);
  return successResponse(res, employee, "Employee deactivated successfully");
});

export const addDepartment = asyncHandler(async (req, res) => {
  const department = await createDepartment(req.user, validateDepartmentCreate(req.body), req.ip);
  return successResponse(res, department, "Department created successfully", 201);
});

export const editDepartment = asyncHandler(async (req, res) => {
  const department = await updateDepartment(
    req.user,
    validateId(req.params, "department id"),
    validateDepartmentUpdate(req.body),
    req.ip,
  );
  return successResponse(res, department, "Department updated successfully");
});

export const removeDepartment = asyncHandler(async (req, res) => {
  const department = await deleteDepartment(req.user, validateId(req.params, "department id"), req.ip);
  return successResponse(res, department, "Department deleted successfully");
});

export const getDepartments = asyncHandler(async (req, res) => {
  const departments = await listDepartments(req.user, req.ip);
  return successResponse(res, departments, "Departments fetched successfully");
});

export const allocateBalance = asyncHandler(async (req, res) => {
  const allocation = await assignMonthlyBalance(req.user, validateAllocationCreate(req.body), req.ip);
  return successResponse(res, allocation, "Monthly balance allocated successfully", 201);
});

export const scheduleMonthlyPayment = asyncHandler(async (req, res) => {
  const schedule = await createMonthlyPaymentSchedule(req.user, validateMonthlyPaymentSchedule(req.body), req.ip);
  if (schedule.payout_day === new Date().getUTCDate()) {
    await processMonthlyPayments();
  }
  return successResponse(res, schedule, "Monthly payment schedule created successfully", 201);
});

export const editAllocation = asyncHandler(async (req, res) => {
  const allocation = await updateMonthlyAllocation(
    req.user,
    validateId(req.params, "allocation id"),
    validateAllocationUpdate(req.body),
    req.ip,
  );
  return successResponse(res, allocation, "Monthly allocation updated successfully");
});

export const monthlyReport = asyncHandler(async (req, res) => {
  const report = await generateMonthlyReport(req.user, validateCompanyReportQuery(req.query), req.ip);

  if (report.format === "json") {
    return successResponse(res, report.data, "Monthly report generated successfully");
  }

  return sendReportResponse(res, report);
});

export const financialReport = asyncHandler(async (req, res) => {
  const report = await generateFinancialReport(req.user, validateCompanyReportQuery(req.query), req.ip);

  if (report.format === "json") {
    return successResponse(res, report.data, "Financial report generated successfully");
  }

  return sendReportResponse(res, report);
});

export const feedback = asyncHandler(async (req, res) => {
  const data = await listFeedback(req.user, validateFeedbackQuery(req.query), parsePagination(req.query), req.ip);
  return successResponse(res, data, "Feedback fetched successfully");
});

export const resetPassword = asyncHandler(async (req, res) => {
  const result = await resetEmployeePassword(req.user, validatePasswordReset(req.body), req.ip);
  return successResponse(res, result, "Password reset successfully");
});
