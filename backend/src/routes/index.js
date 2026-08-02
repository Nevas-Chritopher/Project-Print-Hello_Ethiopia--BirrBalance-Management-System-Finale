import express from "express";
import authRoutes from "./auth.routes.js";
import employeeRoutes from "./employee.routes.js";
import waiterRoutes from "./waiter.routes.js";
import cafeRoutes from "./cafe.routes.js";
import companyRoutes from "./company.routes.js";
import notificationRoutes from "./notification.routes.js";
import orderRoutes from "./order.routes.js";
import auditRoutes from "./audit.routes.js";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/employee", employeeRoutes);
router.use("/waiter", waiterRoutes);
router.use("/orders", orderRoutes);
router.use("/cafe", cafeRoutes);
router.use("/company-manager", companyRoutes);
router.use("/notifications", notificationRoutes);
router.use("/audit-logs", auditRoutes);
router.use("/reports", (await import("./report.routes.js")).default);
export default router;
