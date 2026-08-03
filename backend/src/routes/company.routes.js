import express from "express";
import {
  activateEmployee,
  addDepartment,
  addCafe,
  addCafeManager,
  addEmployee,
  allocateBalance,
  scheduleMonthlyPayment,
  deactivateEmployee,
  deleteEmployee,
  deleteCafe,
  editAllocation,
  editDepartment,
  editEmployee,
  feedback,
  financialReport,
  getEmployees,
  getDepartments,
  getCafes,
  monthlyReport,
  removeDepartment,
  resetPassword,
} from "../controllers/company.controller.js";
import { authenticate, requireRole } from "../middleware/auth.middleware.js";
import { ROLES } from "../config/constants.js";

const router = express.Router();

router.use(authenticate, requireRole(ROLES.COMPANY_MANAGER));

router.get("/employees", getEmployees);
router.post("/employees", addEmployee);
router.patch("/employees/:id", editEmployee);
router.delete("/employees/:id", deleteEmployee);
router.patch("/employees/:id/activate", activateEmployee);
router.patch("/employees/:id/deactivate", deactivateEmployee);
router.post("/employees/password-reset", resetPassword);

router.get("/cafes", getCafes);
router.post("/cafes", addCafe);
router.delete("/cafes/:id", deleteCafe);
router.post("/cafe-managers", addCafeManager);

router.post("/departments", addDepartment);
router.get("/departments", getDepartments);
router.patch("/departments/:id", editDepartment);
router.delete("/departments/:id", removeDepartment);

router.post("/balances/allocations", allocateBalance);
router.post("/balances/schedules", scheduleMonthlyPayment);
router.patch("/balances/allocations/:id", editAllocation);

router.get("/reports/monthly", monthlyReport);
router.get("/reports/financial", financialReport);
router.get("/feedback", feedback);

export default router;
