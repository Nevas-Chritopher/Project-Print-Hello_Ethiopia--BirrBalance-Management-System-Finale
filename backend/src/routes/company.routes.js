import express from "express";
import {
  activateEmployee,
  addDepartment,
  addCafe,
  addCafeManager,
  addCompanyManager,
  addEmployee,
  changeOwnPassword,
  allocateBalance,
  allocateGroupBalance,
  activatePaymentSchedule,
  scheduleMonthlyPayment,
  deactivateEmployee,
  deleteEmployee,
  deleteCafe,
  editAllocation,
  editDepartment,
  editEmployee,
  feedback,
  financialReport,
  departmentUsageReport,
  getEmployees,
  getDepartments,
  getCafes,
  monthlyReport,
  removeDepartment,
  resetPassword,
  generateEmployeeQr,
  generateAllEmployeeQrs,
} from "../controllers/company.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { ROLES } from "../config/constants.js";

const router = express.Router();

router.use(authenticate, requireRole(ROLES.COMPANY_MANAGER));

router.get("/employees", getEmployees);
router.post("/employees", addEmployee);
router.post("/admins", addCompanyManager);
router.patch("/profile/password", changeOwnPassword);
router.patch("/employees/:id", editEmployee);
router.delete("/employees/:id", deleteEmployee);
router.patch("/employees/:id/activate", activateEmployee);
router.patch("/employees/:id/deactivate", deactivateEmployee);
router.post("/employees/password-reset", resetPassword);
router.post("/employees/:id/qr", generateEmployeeQr);
router.post("/employees/qr-codes", generateAllEmployeeQrs);

router.get("/cafes", getCafes);
router.post("/cafes", addCafe);
router.delete("/cafes/:id", deleteCafe);
router.post("/cafe-managers", addCafeManager);

router.post("/departments", addDepartment);
router.get("/departments", getDepartments);
router.patch("/departments/:id", editDepartment);
router.delete("/departments/:id", removeDepartment);

router.post("/balances/allocations", allocateBalance);
router.post("/balances/group-allocations", allocateGroupBalance);
router.post("/balances/schedules", scheduleMonthlyPayment);
router.post("/balances/schedules/:id/activate", activatePaymentSchedule);
router.patch("/balances/allocations/:id", editAllocation);

router.get("/reports/monthly", monthlyReport);
router.get("/reports/financial", financialReport);
router.get("/reports/department-usage", departmentUsageReport);
router.get("/feedback", feedback);

export default router;
