import prisma from "../config/db.js";
import { comparePassword, hashPassword } from "./auth.service.js";
import { writeAuditLog } from "./audit.service.js";
import { createNotification, notifyAllocation, notifyPasswordReset } from "./notification.service.js";
import { AppError } from "../utils/AppError.js";
import {
  DAILY_ALLOWANCE_ETB,
  getCurrentEthiopianDate,
  getEthiopianMonthCalendar,
  getMonthRange,
  getEthiopianMonthRange,
  gregorianToEthiopian,
  getEthiopianCycleRange,
} from "../utils/date.js";
import { buildCsv, buildPdf, buildXlsx } from "../utils/report.js";
import crypto from "crypto";
import { buildWaiterPanelUrl, generateQRToken, hashQRToken } from "./qr.service.js";
import { capRestorationCandidate } from "../utils/restoration.js";
import { getEmployeeBalances } from "./balance.service.js";

const REPORT_FIELDS = [
  { key: "employee_id", header: "Employee ID", width: 18 },
  { key: "employee_name", header: "Employee Name", width: 24 },
  { key: "department", header: "Department", width: 22 },
  { key: "cycle_label", header: "Allocation Cycle", width: 24 },
  { key: "cycle_start_date", header: "Cycle Start (Ethiopian)", width: 22 },
  { key: "cycle_end_date", header: "Cycle End (Ethiopian)", width: 22 },
  { key: "original_allocated", header: "Originally Allocated (ETB)", width: 24 },
  { key: "net_adjustments", header: "Net Adjustments (ETB)", width: 22 },
  { key: "total_orders", header: "Total Orders", width: 15 },
  { key: "total_amount_used", header: "Total Amount Used", width: 18 },
  { key: "initially_used", header: "Initially Used (ETB)", width: 20 },
  { key: "initially_expired", header: "Initially Expired (ETB)", width: 22 },
  { key: "returned_restored", header: "Returned / Restored (ETB)", width: 25 },
  { key: "used_after_restoration", header: "Used After Restoration (ETB)", width: 28 },
  { key: "reexpired", header: "Re-expired (ETB)", width: 18 },
  { key: "final_balance", header: "Final Cycle Balance (ETB)", width: 24 },
  { key: "remaining_balance", header: "Remaining Balance", width: 18 },
  { key: "waiter_name", header: "Waiter Name", width: 22 },
  { key: "food_ordered", header: "Food Ordered", width: 28 },
  { key: "date", header: "Date", width: 18 },
];

const FINANCIAL_REPORT_FIELDS = [
  { key: "type", header: "Type", width: 18 },
  { key: "name", header: "Name", width: 28 },
  { key: "total_orders", header: "Total Orders", width: 16 },
  { key: "total_amount", header: "Total Amount", width: 18 },
];

const DEPARTMENT_USAGE_FIELDS = [
  { key: "department", header: "Department", width: 26 },
  { key: "employee_count", header: "Number of Employees", width: 22 },
  { key: "total_money_given", header: "Total Money Given (ETB)", width: 26 },
  { key: "net_adjustments", header: "Net Adjustments (ETB)", width: 22 },
  { key: "initially_used", header: "Initially Used (ETB)", width: 22 },
  { key: "returned_restored", header: "Returned / Restored (ETB)", width: 26 },
  { key: "used_after_restoration", header: "Used After Restoration (ETB)", width: 28 },
  { key: "initially_expired", header: "Initially Expired (ETB)", width: 24 },
  { key: "reexpired", header: "Re-expired (ETB)", width: 20 },
  { key: "final_balance", header: "Final Cycle Balance (ETB)", width: 26 },
  { key: "expired_money", header: "Expired Money (ETB)", width: 23 },
  { key: "total_used", header: "Total Used Money (ETB)", width: 26 },
];

const EMPLOYEE_USAGE_FIELDS = [
  { key: "employee_id", header: "Employee ID", width: 18 },
  { key: "employee_name", header: "Employee", width: 26 },
  { key: "department", header: "Department", width: 22 },
  { key: "cycle_label", header: "Allocation Cycle", width: 24 },
  { key: "cycle_start_date", header: "Cycle Start (Ethiopian)", width: 22 },
  { key: "cycle_end_date", header: "Cycle End (Ethiopian)", width: 22 },
  { key: "original_allocated", header: "Originally Allocated (ETB)", width: 24 },
  { key: "net_adjustments", header: "Net Adjustments (ETB)", width: 22 },
  { key: "initially_used", header: "Initially Used (ETB)", width: 22 },
  { key: "initially_expired", header: "Initially Expired (ETB)", width: 24 },
  { key: "returned_restored", header: "Returned / Restored (ETB)", width: 26 },
  { key: "used_after_restoration", header: "Used After Restoration (ETB)", width: 28 },
  { key: "reexpired", header: "Re-expired (ETB)", width: 20 },
  { key: "final_balance", header: "Final Cycle Balance (ETB)", width: 26 },
  { key: "total_used", header: "Total Used (ETB)", width: 18 },
  { key: "expired_money", header: "Expired (ETB)", width: 18 },
  { key: "daily_meal_usage", header: "Daily / Meal Usage", width: 52 },
];

const MAX_REPORT_ROWS = 10000;
const COUNTABLE_ORDER_STATUSES = ["confirmed", "preparing", "ready", "completed"];
const ALLOWED_ROLES = ["employee", "waiter", "cafe_manager", "company_manager"];
const PRINTED_QR_TTL_MINUTES = 365 * 24 * 60;
const ETHIOPIAN_MONTH_NAMES = ["Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit", "Megabit", "Miazia", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume"];

const formatEthiopianDate = (date) => {
  const ethiopian = gregorianToEthiopian(date);
  return `${ethiopian.day} ${ETHIOPIAN_MONTH_NAMES[ethiopian.month - 1]} ${ethiopian.year}`;
};

const getAllocationCycleDates = (allocation) => {
  const defaultCycle = getEthiopianMonthRange(gregorianToEthiopian(allocation.allocation_month));
  return {
    start: allocation.cycle_start_at ?? defaultCycle.start,
    end: allocation.cycle_end_at ?? defaultCycle.end,
  };
};

// Some deployed databases still have the legacy NOT NULL phone constraint.
// Imports intentionally do not require a phone number, so give those records
// a stable, unique internal placeholder until a real number is added.
const fallbackPhoneNumber = (employeeExternalId) => {
  const digits = crypto.createHash("sha256").update(String(employeeExternalId)).digest("hex").replace(/[^0-9]/g, "").padEnd(9, "0").slice(0, 9);
  return `+251${digits}`;
};

const getUserOrThrow = async (userId, tx = prisma) => {
  const user = await tx.users.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("Employee not found", 404);
  return user;
};

const ensureDepartmentExists = async (departmentId, tx = prisma) => {
  if (!departmentId) return;
  const department = await tx.departments.findUnique({ where: { id: departmentId } });
  if (!department) throw new AppError("Department not found", 404);
};

const normalizeEmployeeExternalId = (employeeExternalId) => {
  if (!employeeExternalId || typeof employeeExternalId !== 'string') return employeeExternalId;
  return employeeExternalId.trim().toUpperCase();
};

export const normalizeDepartmentName = (name) => {
  if (!name || typeof name !== "string") return "";
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
};

export const departmentNamesMatch = (left, right) => {
  return normalizeDepartmentName(left) === normalizeDepartmentName(right);
};

const ensureRoles = async (roles, tx) => {
  const uniqueRoles = [...new Set(roles)];
  const invalid = uniqueRoles.filter((role) => !ALLOWED_ROLES.includes(role));
  if (invalid.length) {
    throw new AppError(`Invalid role: ${invalid.join(", ")}`, 400);
  }

  const dbRoles = await tx.roles.findMany({ where: { name: { in: uniqueRoles } } });
  const found = new Set(dbRoles.map((role) => role.name));
  const missing = uniqueRoles.filter((role) => !found.has(role));

  if (missing.length) {
    await tx.roles.createMany({
      data: missing.map((name) => ({ name })),
      skipDuplicates: true,
    });
  }

  return tx.roles.findMany({ where: { name: { in: uniqueRoles } } });
};

const syncUserRoles = async (userId, roles, tx) => {
  const dbRoles = await ensureRoles(roles, tx);

  await tx.user_roles.deleteMany({ where: { user_id: userId } });
  await tx.user_roles.createMany({
    data: dbRoles.map((role) => ({ user_id: userId, role_id: role.id })),
    skipDuplicates: true,
  });
};

const syncCafeAssignment = async (userId, cafeId, tx) => {
  await tx.cafe_staff.deleteMany({ where: { user_id: userId } });

  if (cafeId) {
    const cafe = await tx.cafes.findFirst({ where: { id: cafeId, is_active: true } });
    if (!cafe) throw new AppError("Cafe not found or inactive", 404);
    await tx.cafe_staff.create({ data: { user_id: userId, cafe_id: cafeId } });
  }
};

const assertCafeAssignmentMatchesRoles = (roles, cafeId) => {
  if ((roles.includes("waiter") || roles.includes("cafe_manager")) && !cafeId) {
    throw new AppError("waiter and cafe_manager users must be assigned to a cafe", 400);
  }
};

const employeeSelect = {
  id: true,
  employee_external_id: true,
  fullname: true,
  email: true,
  phone_number: true,
  department_id: true,
  is_active: true,
  created_at: true,
  departments: { select: { id: true, name: true } },
  cafe_staff: { select: { cafe_id: true } },
  user_roles: { include: { roles: true } },
};

const formatEmployee = (employee) => ({
  id: employee.id,
  employee_external_id: employee.employee_external_id,
  fullname: employee.fullname,
  email: employee.email,
  phone_number: employee.phone_number,
  department: employee.departments,
  cafe_id: employee.cafe_staff?.cafe_id ?? null,
  is_active: employee.is_active,
  roles: employee.user_roles?.map((userRole) => userRole.roles.name) ?? [],
  created_at: employee.created_at,
  balance: employee.balance ?? 0,
});

export const createEmployee = async (actor, payload, ipAddress) => {
  const passwordHash = await hashPassword(payload.password);
  const normalizedEmployeeId = normalizeEmployeeExternalId(payload.employee_external_id);
  assertCafeAssignmentMatchesRoles(payload.roles, payload.cafe_id);
  const phoneNumber = payload.phone_number ?? fallbackPhoneNumber(normalizedEmployeeId);

  return prisma.$transaction(async (tx) => {
    await ensureDepartmentExists(payload.department_id, tx);

    const employee = await tx.users.create({
      data: {
        employee_external_id: normalizedEmployeeId,
        fullname: payload.fullname,
        email: payload.email ?? null,
        phone_number: phoneNumber,
        password_hash: passwordHash,
        department_id: payload.department_id,
      },
      select: employeeSelect,
    });

    await syncUserRoles(employee.id, payload.roles, tx);
    await syncCafeAssignment(employee.id, payload.cafe_id, tx);

    await writeAuditLog(
      {
        userId: actor.id,
        action: "company.employee.create",
        entityType: "users",
        entityId: employee.id,
        description: `Created employee ${employee.fullname}`,
        ipAddress,
      },
      tx,
    );

    const created = await tx.users.findUnique({ where: { id: employee.id }, select: employeeSelect });
    return formatEmployee(created);
  },{ timeout: 30000 });
};

export const createCompanyManager = async (actor, payload, ipAddress) => {
  return createEmployee(actor, { ...payload, department_id: null, cafe_id: null, roles: ["company_manager"] }, ipAddress);
};

export const changeCompanyManagerPassword = async (actor, payload, ipAddress) => {
  const manager = await prisma.users.findUnique({ where: { id: actor.id }, select: { password_hash: true } });
  if (!manager || !(await comparePassword(payload.old_password, manager.password_hash))) {
    throw new AppError("Current password is incorrect", 401);
  }
  await prisma.$transaction(async (tx) => {
    await tx.users.update({ where: { id: actor.id }, data: { password_hash: await hashPassword(payload.new_password), updated_at: new Date() } });
    await writeAuditLog({ userId: actor.id, action: "company_manager.password.change", entityType: "users", entityId: actor.id, description: "Changed own password", ipAddress }, tx);
  });
  return { changed: true };
};

export const createCafe = async (actor, payload, ipAddress) => {
  const cafe = await prisma.cafes.create({ data: payload });
  await writeAuditLog({
    userId: actor.id,
    action: "company.cafe.create",
    entityType: "cafes",
    entityId: cafe.id,
    description: `Created cafe ${cafe.name}`,
    ipAddress,
  });
  return cafe;
};

export const removeCafe = async (actor, cafeId, ipAddress) => {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.cafes.findUnique({ where: { id: cafeId } });
    if (!existing) throw new AppError("Cafe not found", 404);
    // Keep completed orders and financial history intact while removing the cafe
    // from all active manager/employee views.
    const cafe = await tx.cafes.update({
      where: { id: cafeId },
      data: { is_active: false },
    });
    await writeAuditLog({
      userId: actor.id,
      action: "company.cafe.delete",
      entityType: "cafes",
      entityId: cafe.id,
      description: `Deleted cafe ${cafe.name}`,
      ipAddress,
    }, tx);
    return cafe;
  });
};

export const listCafes = async () => prisma.cafes.findMany({
  where: { is_active: true },
  orderBy: { name: "asc" },
  select: { id: true, name: true, location: true, is_active: true, created_at: true },
});

export const listEmployees = async (actor, filters, pagination, ipAddress) => {
  const where = {
    ...(filters.department_id ? { department_id: filters.department_id } : {}),
    ...(filters.is_active !== undefined ? { is_active: filters.is_active } : {}),
    ...(filters.search
      ? {
          OR: [
            { fullname: { contains: filters.search, mode: "insensitive" } },
            { employee_external_id: { contains: filters.search, mode: "insensitive" } },
            { phone_number: { contains: filters.search, mode: "insensitive" } },
            { email: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(filters.role
      ? {
          user_roles: {
            some: {
              roles: { name: filters.role },
            },
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.users.findMany({
      where,
      select: employeeSelect,
      orderBy: { fullname: "asc" },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.users.count({ where }),
  ]);

  // Keep the manager list in sync with employee spendable balances, including
  // active restored funds from older allocation cycles, using batched queries.
  const employeeIds = items.map((employee) => employee.id);
  const balances = await getEmployeeBalances(employeeIds);
  const itemsWithBalance = items.map((employee) => {
    return { ...formatEmployee(employee), balance: balances.get(employee.id) ?? 0 };
  });

  await writeAuditLog({
    userId: actor.id,
    action: "company.employee.list",
    entityType: "users",
    description: "Listed employees",
    ipAddress,
  });

  return {
    items: itemsWithBalance,
    total,
    page: pagination.page,
    limit: pagination.limit,
    total_pages: Math.ceil(total / pagination.limit),
  };
};

export const updateEmployee = async (actor, userId, payload, ipAddress) => {
  const existingUser = await prisma.users.findUnique({
    where: { id: userId },
    include: { cafe_staff: true, user_roles: { include: { roles: true } } },
  });
  if (!existingUser) throw new AppError("Employee not found", 404);

  if (payload.employee_external_id) {
    payload.employee_external_id = normalizeEmployeeExternalId(payload.employee_external_id);
  }

  const { roles, cafe_id: cafeId, password, ...userData } = payload;
  const effectiveRoles = roles ?? existingUser.user_roles.map((userRole) => userRole.roles.name);
  const effectiveCafeId = payload.cafe_id !== undefined ? cafeId : existingUser.cafe_staff?.cafe_id;
  assertCafeAssignmentMatchesRoles(effectiveRoles, effectiveCafeId);
  if (password) {
    if (effectiveRoles.includes("employee") && !/^\d{6}$/.test(password)) {
      throw new AppError("Employee password must be exactly a 6-digit number", 400);
    }
    if (!effectiveRoles.includes("employee") && (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password))) {
      throw new AppError("Manager and waiter passwords must be at least 8 characters and include uppercase, lowercase, and number", 400);
    }
  }

  return prisma.$transaction(async (tx) => {
    await ensureDepartmentExists(userData.department_id, tx);
    if (roles) await syncUserRoles(userId, roles, tx);
    if (payload.cafe_id !== undefined) await syncCafeAssignment(userId, cafeId, tx);

    const employee = await tx.users.update({
      where: { id: userId },
      data: { ...userData, ...(password ? { password_hash: await hashPassword(password) } : {}), updated_at: new Date() },
      select: employeeSelect,
    });

    await writeAuditLog(
      {
        userId: actor.id,
        action: "company.employee.update",
        entityType: "users",
        entityId: userId,
        description: `Updated employee ${employee.fullname}`,
        ipAddress,
      },
      tx,
    );

    return formatEmployee(employee);
  });
};

export const removeEmployee = async (actor, userId, ipAddress) => {
  const existing = await getUserOrThrow(userId);

  return prisma.$transaction(async (tx) => {
    await removeEmployeesAndRelatedRecords(tx, [userId]);

    const employee = await tx.users.delete({
      where: { id: userId },
      select: employeeSelect,
    });

    await writeAuditLog(
      {
        userId: actor.id,
        action: "company.employee.remove",
        entityType: "users",
        entityId: userId,
        description: `Permanently removed employee ${existing.fullname}`,
        ipAddress,
      },
      tx,
    );

    return formatEmployee(employee);
  });
};

// Explicitly remove every dependent record. Some installations were created
// before the cascade constraints existed, so relying on database cascades can
// leave account deletion vulnerable to foreign-key errors.
const removeEmployeesAndRelatedRecords = async (tx, userIds) => {
  if (!userIds.length) return;

  const usersWhere = { in: userIds };
  const ordersWhere = {
    OR: [{ employee_id: usersWhere }, { waiter_id: usersWhere }],
  };

  await tx.qr_sessions.deleteMany({
    where: { OR: [{ employee_id: usersWhere }, { waiter_id: usersWhere }] },
  });
  await tx.employee_qr_codes.deleteMany({ where: { user_id: usersWhere } });
  await tx.order_items.deleteMany({ where: { orders: ordersWhere } });
  await tx.orders.deleteMany({ where: ordersWhere });
  await tx.balance_transactions.deleteMany({ where: { user_id: usersWhere } });
  await tx.monthly_allocations.deleteMany({ where: { user_id: usersWhere } });
  await tx.feedback.deleteMany({ where: { user_id: usersWhere } });
  await tx.notifications.deleteMany({ where: { user_id: usersWhere } });
  await tx.login_history.deleteMany({ where: { user_id: usersWhere } });
  await tx.password_reset_tokens.deleteMany({ where: { user_id: usersWhere } });
  await tx.refresh_tokens.deleteMany({ where: { user_id: usersWhere } });
  await tx.cafe_staff.deleteMany({ where: { user_id: usersWhere } });
  await tx.user_roles.deleteMany({ where: { user_id: usersWhere } });
  await tx.audit_logs.deleteMany({ where: { user_id: usersWhere } });
};

export const removeAllEmployees = async (actor, ipAddress) => {
  return prisma.$transaction(async (tx) => {
    // Never allow this convenience action to remove the manager currently
    // operating the portal, even if their account has multiple roles.
    const employees = await tx.users.findMany({
      where: {
        id: { not: actor.id },
        user_roles: { some: { roles: { name: "employee" } } },
      },
      select: { id: true },
    });
    const employeeIds = employees.map((employee) => employee.id);

    await removeEmployeesAndRelatedRecords(tx, employeeIds);
    const { count } = await tx.users.deleteMany({ where: { id: { in: employeeIds } } });

    await writeAuditLog(
      {
        userId: actor.id,
        action: "company.employee.remove_all",
        entityType: "users",
        description: `Permanently removed ${count} employee account(s)`,
        ipAddress,
      },
      tx,
    );

    return { deleted: count };
  }, { timeout: 30000 });
};

export const setEmployeeActive = async (actor, userId, isActive, ipAddress) => {
  return updateEmployee(actor, userId, { is_active: isActive }, ipAddress);
};

const issueEmployeeQrCode = async (actor, employee, ipAddress, tx) => {
  const { token, expiresAt } = generateQRToken(employee.id, PRINTED_QR_TTL_MINUTES);
  const qr = await tx.employee_qr_codes.upsert({
    where: { user_id: employee.id },
    create: { user_id: employee.id, token_hash: hashQRToken(token), is_active: true, expires_at: expiresAt },
    update: { token_hash: hashQRToken(token), is_active: true, expires_at: expiresAt },
  });
  await writeAuditLog({
    userId: actor.id,
    action: "employee.qr.print_issue",
    entityType: "employee_qr_codes",
    entityId: qr.id,
    description: `Issued printable QR code for ${employee.fullname}`,
    ipAddress,
  }, tx);
  return {
    id: employee.id,
    employee_external_id: employee.employee_external_id,
    fullname: employee.fullname,
    department: employee.departments?.name ?? null,
    qr_token: buildWaiterPanelUrl(employee.id),
    expires_at: expiresAt,
  };
};

export const issuePrintableEmployeeQr = async (actor, employeeId, ipAddress) => {
  const employee = await prisma.users.findFirst({
    where: { id: employeeId, is_active: true, user_roles: { some: { roles: { name: "employee" } } } },
    select: { id: true, employee_external_id: true, fullname: true, departments: { select: { name: true } } },
  });
  if (!employee) throw new AppError("Active employee not found", 404);
  return prisma.$transaction((tx) => issueEmployeeQrCode(actor, employee, ipAddress, tx));
};

export const issueAllPrintableEmployeeQrs = async (actor, ipAddress, departmentId) => {
  const employees = await prisma.users.findMany({
    where: {
      is_active: true,
      user_roles: { some: { roles: { name: "employee" } } },
      ...(departmentId === undefined ? {} : { department_id: departmentId }),
    },
    select: { id: true, employee_external_id: true, fullname: true, departments: { select: { name: true } } },
    orderBy: { fullname: "asc" },
  });
  return prisma.$transaction(async (tx) => Promise.all(employees.map((employee) => issueEmployeeQrCode(actor, employee, ipAddress, tx))), { timeout: 30000 });
};

export const createDepartment = async (actor, payload, ipAddress) => {
  return prisma.$transaction(async (tx) => {
    const departmentName = String(payload.name ?? "").trim();
    if (!departmentName) throw new AppError("Department name is required", 400);

    const existing = await tx.departments.findFirst({
      where: { name: { equals: departmentName, mode: "insensitive" } },
    });
    if (existing) {
      throw new AppError(`Department "${departmentName}" already exists`, 409);
    }

    const department = await tx.departments.create({ data: { ...payload, name: departmentName } });
    await writeAuditLog(
      {
        userId: actor.id,
        action: "company.department.create",
        entityType: "departments",
        entityId: department.id,
        description: `Created department ${department.name}`,
        ipAddress,
      },
      tx,
    );
    return department;
  });
};

export const updateDepartment = async (actor, departmentId, payload, ipAddress) => {
  return prisma.$transaction(async (tx) => {
    const nextName = payload.name !== undefined ? String(payload.name ?? "").trim() : undefined;
    if (nextName !== undefined && !nextName) throw new AppError("Department name is required", 400);

    if (nextName) {
      const existing = await tx.departments.findFirst({
        where: {
          name: { equals: nextName, mode: "insensitive" },
          id: { not: departmentId },
        },
      });
      if (existing) {
        throw new AppError(`Department "${nextName}" already exists`, 409);
      }
    }

    const department = await tx.departments.update({ where: { id: departmentId }, data: nextName ? { ...payload, name: nextName } : payload });
    await writeAuditLog(
      {
        userId: actor.id,
        action: "company.department.update",
        entityType: "departments",
        entityId: department.id,
        description: `Updated department ${department.name}`,
        ipAddress,
      },
      tx,
    );
    return department;
  });
};

export const deleteDepartment = async (actor, departmentId, ipAddress) => {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.departments.findUnique({ where: { id: departmentId } });
    if (!existing) throw new AppError("Department not found", 404);
    await tx.users.updateMany({ where: { department_id: departmentId }, data: { department_id: null, updated_at: new Date() } });
    const department = await tx.departments.delete({ where: { id: departmentId } });
    await writeAuditLog(
      {
        userId: actor.id,
        action: "company.department.delete",
        entityType: "departments",
        entityId: department.id,
        description: `Deleted department ${department.name}`,
        ipAddress,
      },
      tx,
    );
    return department;
  });
};

export const listDepartments = async (actor, ipAddress) => {
  const departments = await prisma.departments.findMany({ orderBy: { name: "asc" } });
  await writeAuditLog({
    userId: actor.id,
    action: "company.department.list",
    entityType: "departments",
    description: "Listed departments",
    ipAddress,
  });
  return departments;
};

export const assignMonthlyBalance = async (actor, payload, ipAddress) => {
  const { start, month } = getMonthRange(payload.month);
  const cycle = payload.cycle ?? getEthiopianCycleRange({
    ...gregorianToEthiopian(start),
  });
  const employee = await prisma.users.findFirst({
    where: { id: payload.user_id, user_roles: { some: { roles: { name: "employee" } } } },
    select: { id: true },
  });
  if (!employee) throw new AppError("Balance can only be allocated to an employee", 400);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.monthly_allocations.findUnique({
      where: { user_id_allocation_month: { user_id: payload.user_id, allocation_month: start } },
    });

    if (existing) {
      throw new AppError(`Monthly allocation already exists for ${month}`, 409);
    }

    const allocation = await tx.monthly_allocations.create({
      data: {
        user_id: payload.user_id,
        allocation_month: start,
        amount: payload.amount,
        allocated_by: actor.id,
        cycle_start_at: cycle.start,
        cycle_end_at: cycle.end,
        cycle_label: payload.cycle_label ?? null,
      },
    });

    await tx.balance_transactions.create({
      data: {
        user_id: payload.user_id,
        allocation_id: allocation.id,
        amount: payload.amount,
        direction: "credit",
        transaction_type: "allocation",
        reference_note: `Meal balance allocation for ${payload.cycle_label || month}; cycle ${cycle.start.toISOString().slice(0, 10)} to ${cycle.end.toISOString().slice(0, 10)}`,
      },
    });

    await notifyAllocation(payload.user_id, payload.amount, actor, ipAddress, tx);
    await writeAuditLog(
      {
        userId: actor.id,
        action: "company.balance.allocate",
        entityType: "monthly_allocations",
        entityId: allocation.id,
        description: `Allocated ETB ${payload.amount} for ${month}`,
        ipAddress,
      },
      tx,
    );

    return allocation;
  });
};

export const assignGroupMonthlyBalance = async (actor, payload, ipAddress) => {
  const employees = await prisma.users.findMany({
    where: {
      is_active: true,
      ...(payload.applies_to_all ? {} : { department_id: payload.department_id }),
      user_roles: { some: { roles: { name: "employee" } } },
    },
    select: { id: true },
  });

  const results = await Promise.allSettled(employees.map((employee) => assignMonthlyBalance(actor, {
    user_id: employee.id,
    amount: payload.amount,
    month: payload.month,
    cycle: payload.cycle,
    cycle_label: payload.cycle_label,
  }, ipAddress)));
  const allocated = results.filter((result) => result.status === "fulfilled").length;
  const skipped = results.length - allocated;

  await writeAuditLog({
    userId: actor.id,
    action: "company.balance.group_allocate",
    entityType: "monthly_allocations",
    description: `Allocated ETB ${payload.amount} to ${allocated} employee(s); ${skipped} skipped`,
    ipAddress,
  });
  return { allocated, skipped, total: employees.length };
};

export const previewExpiredBalancesForDepartment = async (actor, { department_id, all_departments, month }, ipAddress) => {
  const allDepartments = department_id === undefined || all_departments === true;
  if (!actor?.roles?.includes("company_manager")) {
    throw new AppError("You are not authorized to preview expired balances", 403);
  }
  const manager = await prisma.users.findUnique({ where: { id: actor.id }, select: { department_id: true } });
  if (manager?.department_id && (allDepartments || manager.department_id !== department_id)) {
    throw new AppError("You are not authorized to preview balances for this department", 403);
  }

  const department = allDepartments ? null : await prisma.departments.findUnique({ where: { id: department_id } });
  if (!allDepartments && !department) throw new AppError("Department not found", 404);

  const allocationMonth = getMonthRange(month).start;
  const employeeWhere = {
    ...(allDepartments ? {} : { department_id }),
    user_roles: { some: { roles: { name: "employee" } } },
  };
  const employeeIds = (await prisma.users.findMany({ where: employeeWhere, select: { id: true } })).map((user) => user.id);
  const monthAllocations = employeeIds.length
    ? await prisma.monthly_allocations.findMany({
      where: { user_id: { in: employeeIds }, allocation_month: allocationMonth },
      select: { id: true },
    })
    : [];
  const monthAllocationIds = monthAllocations.map((allocation) => allocation.id);
  const monthLedger = monthAllocationIds.length
    ? await prisma.balance_transactions.findMany({
      where: {
        allocation_id: { in: monthAllocationIds },
        OR: [
          { transaction_type: "expiration", direction: "debit" },
          { transaction_type: "restoration", direction: "credit" },
        ],
      },
      select: { user_id: true, amount: true, transaction_type: true, restoration_id: true },
    })
    : [];
  const gross_expired_amount = Number(monthLedger
    .filter((entry) => entry.transaction_type === "expiration")
    .reduce((sum, entry) => sum + Number(entry.amount), 0).toFixed(2));
  const previously_restored_amount = Number(monthLedger
    .filter((entry) => entry.transaction_type === "restoration")
    .reduce((sum, entry) => sum + Number(entry.amount), 0).toFixed(2));
  const previously_restored_count = new Set(monthLedger
    .filter((entry) => entry.transaction_type === "restoration" && entry.restoration_id !== null)
    .map((entry) => entry.restoration_id)).size;
  const restoredByEmployee = new Map();
  for (const entry of monthLedger) {
    if (entry.transaction_type !== "restoration") continue;
    const key = String(entry.user_id);
    restoredByEmployee.set(key, (restoredByEmployee.get(key) ?? 0) + Number(entry.amount));
  }

  const expirations = await prisma.balance_transactions.findMany({
    where: {
      transaction_type: "expiration",
      direction: "debit",
      allocation_id: { in: monthAllocationIds },
      users: {
        user_roles: { some: { roles: { name: "employee" } } },
      },
      expired_balance_restorations_original_expiration: null,
      expired_balance_restorations_reexpiration: null,
      restoration_id: null,
    },
    include: {
      monthly_allocations: true,
      users: {
        select: {
          id: true,
          employee_external_id: true,
          fullname: true,
          departments: { select: { name: true } },
        },
      },
    },
    orderBy: { created_at: "asc" },
  });
  const monthExpirations = expirations.filter((expiration) => expiration.allocation_id && expiration.monthly_allocations);
  const allocationIds = [...new Set(monthExpirations.map((expiration) => expiration.allocation_id))];
  const balanceTransactions = allocationIds.length
    ? await prisma.balance_transactions.findMany({
      where: { allocation_id: { in: allocationIds } },
      select: { allocation_id: true, amount: true, direction: true },
    })
    : [];
  const balanceByAllocation = new Map();
  for (const transaction of balanceTransactions) {
    const balance = balanceByAllocation.get(transaction.allocation_id) ?? 0;
    balanceByAllocation.set(
      transaction.allocation_id,
      balance + (transaction.direction === "credit" ? Number(transaction.amount) : -Number(transaction.amount)),
    );
  }

  const uncappedCandidates = monthExpirations
    .filter((expiration) => (balanceByAllocation.get(expiration.allocation_id) ?? 0) <= 0.00001)
    .map((expiration) => ({
      employee_key: String(expiration.user_id),
      employee_id: expiration.users.employee_external_id ?? String(expiration.user_id),
      employee_name: expiration.users.fullname,
      department: expiration.users.departments?.name ?? "Unassigned",
      allocation_id: expiration.allocation_id,
      cycle_label: expiration.monthly_allocations.cycle_label || "Monthly Allocation Cycle",
      expired_at: expiration.created_at,
      amount: Number(Number(expiration.amount).toFixed(2)),
    }));
  const candidates = uncappedCandidates
    .map((candidate) => capRestorationCandidate(candidate, restoredByEmployee))
    .filter(Boolean)
    .map(({ employee_key: _employeeKey, ...candidate }) => candidate);
  const total_eligible = Number(candidates.reduce((sum, candidate) => sum + candidate.amount, 0).toFixed(2));

  await writeAuditLog({
    userId: actor.id,
    action: "company.balance.expired.preview",
    entityType: "expired_balance_restorations",
    description: `Previewed eligible expired balances for ${department?.name ?? "all departments"}, Ethiopian allocation month ${month}: ETB ${total_eligible.toFixed(2)} across ${candidates.length} allocation(s)`,
    ipAddress,
  });

  return {
    department: department ? { id: department.id, name: department.name } : { id: null, name: "All departments" },
    month,
    gross_expired_amount,
    previously_restored_amount,
    previously_restored_count,
    eligible_count: candidates.length,
    total_eligible,
    candidates,
  };
};

export const restoreExpiredBalancesForDepartment = async (actor, payload, ipAddress) => {
  const allDepartments = payload.all_departments === true || payload.department_id === undefined;
  const isManager = actor?.roles?.includes("company_manager");
  if (!isManager) throw new AppError("You are not authorized to restore expired balances", 403);
  if (actor.department_id && (allDepartments || actor.department_id !== payload.department_id)) {
    throw new AppError("You are not authorized to restore balances for this department", 403);
  }

  const manager = await prisma.users.findUnique({
    where: { id: actor.id },
    select: {
      password_hash: true,
      department_id: true,
      user_roles: { include: { roles: { select: { name: true } } } },
    },
  });
  const stillManager = manager?.user_roles.some((userRole) => userRole.roles.name === "company_manager");
  if (manager?.department_id && (allDepartments || manager.department_id !== payload.department_id)) {
    throw new AppError("You are not authorized to restore balances for this department", 403);
  }
  const hasBcryptHash = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(manager?.password_hash ?? "");
  if (!stillManager || !hasBcryptHash
    || !(await comparePassword(payload.manager_password, manager.password_hash))) {
    throw new AppError("Manager password is incorrect", 401);
  }

  const department = allDepartments ? null : await prisma.departments.findUnique({ where: { id: payload.department_id } });
  if (!allDepartments && !department) throw new AppError("Department not found", 404);
  const departmentName = department?.name ?? "all departments";

  const allocationMonth = payload.month ? getMonthRange(payload.month).start : undefined;
  const expiresAt = new Date(Date.now() + payload.additional_days * 24 * 60 * 60 * 1000);
  return prisma.$transaction(async (tx) => {
    // Serialize return batches across scopes, then recheck each source after its
    // employee lock. The unique original-expiration key is the final idempotency guard.
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock($1)", 0);
    if (!allDepartments) await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock($1)", -payload.department_id);
    const expirations = await tx.balance_transactions.findMany({
      where: {
        transaction_type: "expiration",
        direction: "debit",
        users: {
          ...(allDepartments ? {} : { department_id: payload.department_id }),
          user_roles: { some: { roles: { name: "employee" } } },
        },
        ...(allocationMonth ? { monthly_allocations: { allocation_month: allocationMonth } } : {}),
        expired_balance_restorations_original_expiration: null,
        expired_balance_restorations_reexpiration: null,
        restoration_id: null,
      },
      include: { monthly_allocations: true, users: { select: { department_id: true } } },
      orderBy: { created_at: "asc" },
    });

    const details = [];
    const employeeIds = [...new Set(expirations.map((expiration) => expiration.user_id))];
    const previousRestorations = employeeIds.length
      ? await tx.balance_transactions.findMany({
        where: {
          user_id: { in: employeeIds },
          transaction_type: "restoration",
          direction: "credit",
          ...(allocationMonth ? { monthly_allocations: { allocation_month: allocationMonth } } : {}),
        },
        select: {
          user_id: true,
          amount: true,
          monthly_allocations: { select: { allocation_month: true } },
        },
      })
      : [];
    const restoredByEmployeeMonth = new Map();
    for (const previousRestoration of previousRestorations) {
      const monthKey = previousRestoration.monthly_allocations?.allocation_month?.toISOString().slice(0, 10);
      if (!monthKey) continue;
      const key = `${previousRestoration.user_id}:${monthKey}`;
      restoredByEmployeeMonth.set(key, (restoredByEmployeeMonth.get(key) ?? 0) + Number(previousRestoration.amount));
    }

    for (const expiration of expirations) {
      if (!expiration.allocation_id || !expiration.monthly_allocations) continue;
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock($1)", expiration.user_id);
      const alreadyRestored = await tx.expired_balance_restorations.findUnique({
        where: { original_expiration_transaction_id: expiration.id },
        select: { id: true },
      });
      if (alreadyRestored) continue;
      const balanceTransactions = await tx.balance_transactions.findMany({
        where: { allocation_id: expiration.allocation_id },
        select: { amount: true, direction: true },
      });
      // A historical expiry is eligible only while nothing from this cycle has
      // subsequently been returned; this also protects legacy data.
      const currentBalance = balanceTransactions.reduce((sum, entry) => sum + (entry.direction === "credit" ? Number(entry.amount) : -Number(entry.amount)), 0);
      if (currentBalance > 0.00001) continue;

      const allocationMonthKey = expiration.monthly_allocations.allocation_month.toISOString().slice(0, 10);
      const restorationKey = `${expiration.user_id}:${allocationMonthKey}`;
      const cappedRestoration = capRestorationCandidate({
        employee_key: restorationKey,
        amount: Number(expiration.amount),
      }, restoredByEmployeeMonth);
      if (!cappedRestoration) continue;
      const restoredAmount = cappedRestoration.amount;
      const restoration = await tx.expired_balance_restorations.create({
        data: {
          allocation_id: expiration.allocation_id,
          employee_id: expiration.user_id,
          department_id: allDepartments ? null : payload.department_id,
          manager_id: actor.id,
          original_expiration_transaction_id: expiration.id,
          original_expired_amount: Number(expiration.amount),
          restored_amount: restoredAmount,
          expires_at: expiresAt,
        },
      });
      const credit = await tx.balance_transactions.create({
        data: {
          user_id: expiration.user_id,
          allocation_id: expiration.allocation_id,
          amount: restoredAmount,
          direction: "credit",
          transaction_type: "restoration",
          restoration_id: restoration.id,
          reference_note: `Expired balance restored (restoration ${restoration.id}); expires ${expiresAt.toISOString()}`,
        },
      });
      await tx.notifications.create({
        data: {
          user_id: expiration.user_id,
          type: "allocation",
          title: "Expired balance restored",
          message: `ETB ${restoredAmount.toFixed(2)} was returned to your meal wallet until ${expiresAt.toLocaleDateString("en-CA")}.`,
        },
      });
      details.push({ employee_id: expiration.user_id, allocation_id: expiration.allocation_id, restored_amount: restoredAmount, restoration_id: restoration.id, transaction_id: credit.id });
      await writeAuditLog({
        userId: actor.id,
        action: "company.balance.expired.restore.employee",
        entityType: "expired_balance_restorations",
        entityId: restoration.id,
        description: `Restored ETB ${restoredAmount.toFixed(2)} for employee ${expiration.user_id} in ${departmentName} from allocation ${expiration.allocation_id}; expires ${expiresAt.toISOString()} after ${payload.additional_days} additional day(s)`,
        ipAddress,
      }, tx);
    }

    const totalRestored = Number(details.reduce((sum, detail) => sum + detail.restored_amount, 0).toFixed(2));
    await writeAuditLog({
      userId: actor.id,
      action: "company.balance.expired.restore",
      entityType: "expired_balance_restorations",
      description: `Restored ETB ${totalRestored.toFixed(2)} for ${details.length} employee(s) in ${departmentName}${payload.month ? ` for Ethiopian allocation month ${payload.month}` : " across all eligible months"}; ${payload.additional_days} additional day(s), expires ${expiresAt.toISOString()}`,
      ipAddress,
    }, tx);
    return {
      department: department ? { id: department.id, name: department.name } : { id: null, name: "All departments" },
      month: payload.month ?? null,
      expires_at: expiresAt,
      additional_days: payload.additional_days,
      restored_count: new Set(details.map((detail) => detail.employee_id)).size,
      restored_allocation_count: details.length,
      total_restored: totalRestored,
      details,
    };
  }, { timeout: 120000 });
};

export const getMonthlyAllowancePreview = async (month) => {
  const calendar = getEthiopianMonthCalendar(month);
  const workingDays = calendar.days.filter((day) => day.working_day).length;
  const employeeCount = await prisma.users.count({
    where: {
      is_active: true,
      user_roles: { some: { roles: { name: "employee" } } },
    },
  });
  const amount = workingDays * DAILY_ALLOWANCE_ETB;

  return {
    ...calendar,
    daily_allowance: DAILY_ALLOWANCE_ETB,
    working_days: workingDays,
    monthly_allowance: amount,
    active_employee_count: employeeCount,
    total_budget: amount * employeeCount,
  };
};

const createMonthlyAllocationApproval = async (month, submittedBy = null) => {
  const preview = await getMonthlyAllowancePreview(month);
  const existing = await prisma.monthly_allocation_approvals.findUnique({
    where: { month: preview.month },
  });

  if (existing) {
    if (existing.status !== "pending") return existing;
    return prisma.monthly_allocation_approvals.update({
      where: { id: existing.id },
      data: {
        amount: preview.monthly_allowance,
        employee_count: preview.active_employee_count,
      },
    });
  }

  return prisma.monthly_allocation_approvals.create({
    data: {
      month: preview.month,
      amount: preview.monthly_allowance,
      employee_count: preview.active_employee_count,
      submitted_by: submittedBy,
    },
  });
};

export const getAutomaticMonthlyAllocationStatus = async () => {
  const settings = await prisma.monthly_allocation_settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, enabled: false },
  });
  const approvals = await prisma.monthly_allocation_approvals.findMany({
    orderBy: { month: "desc" },
    take: 12,
  });
  return { enabled: settings.enabled, approvals };
};

export const updateAutomaticMonthlyAllocationSetting = async (actor, payload, ipAddress) => {
  const settings = await prisma.monthly_allocation_settings.upsert({
    where: { id: 1 },
    update: { enabled: payload.enabled, updated_at: new Date() },
    create: { id: 1, enabled: payload.enabled },
  });

  if (settings.enabled) {
    const current = getCurrentEthiopianDate();
    await createMonthlyAllocationApproval(`${current.year}-${String(current.month).padStart(2, "0")}`, actor.id);
  }

  await writeAuditLog({
    userId: actor.id,
    action: "company.balance.automatic_allocation.setting",
    entityType: "monthly_allocation_settings",
    description: `Automatic monthly allocation ${settings.enabled ? "enabled" : "disabled"}`,
    ipAddress,
  });
  return getAutomaticMonthlyAllocationStatus();
};

export const createMonthlyAllocationApprovalRequest = async (actor, month, ipAddress) => {
  const approval = await createMonthlyAllocationApproval(month, actor.id);
  if (approval.status !== "pending") {
    throw new AppError("This month already has a processed allocation request", 409);
  }
  await writeAuditLog({
    userId: actor.id,
    action: "company.balance.automatic_allocation.request",
    entityType: "monthly_allocation_approvals",
    entityId: approval.id,
    description: `Prepared ETB ${approval.amount} for manager approval for ${approval.month}`,
    ipAddress,
  });
  return approval;
};

export const approveMonthlyAllocationRequest = async (actor, approvalId, ipAddress) => {
  const approval = await prisma.monthly_allocation_approvals.findUnique({ where: { id: approvalId } });
  if (!approval) throw new AppError("Monthly allocation approval not found", 404);
  if (approval.status !== "pending") throw new AppError("This monthly allocation is not pending approval", 409);

  const reservation = await prisma.monthly_allocation_approvals.updateMany({
    where: { id: approvalId, status: "pending" },
    data: { status: "processing" },
  });
  if (reservation.count !== 1) {
    throw new AppError("This monthly allocation is already being processed", 409);
  }

  try {
    const result = await assignGroupMonthlyBalance(actor, {
      amount: Number(approval.amount),
      month: approval.month,
      applies_to_all: true,
      department_id: null,
    }, ipAddress);
    return await prisma.monthly_allocation_approvals.update({
      where: { id: approvalId },
      data: {
        status: "approved",
        allocated_count: result.allocated,
        skipped_count: result.skipped,
        approved_by: actor.id,
        approved_at: new Date(),
      },
    });
  } catch (error) {
    await prisma.monthly_allocation_approvals.updateMany({
      where: { id: approvalId, status: "processing" },
      data: { status: "pending" },
    });
    throw error;
  }
};

export const prepareAutomaticMonthlyAllocationApproval = async () => {
  const settings = await prisma.monthly_allocation_settings.findUnique({
    where: { id: 1 },
    select: { enabled: true },
  });
  if (!settings?.enabled) return null;

  const current = getCurrentEthiopianDate();
  const month = `${current.year}-${String(current.month).padStart(2, "0")}`;
  const existing = await prisma.monthly_allocation_approvals.findUnique({ where: { month } });
  if (existing) return existing;
  return createMonthlyAllocationApproval(month);
};

export const createMonthlyPaymentSchedule = async (actor, payload, ipAddress) => {
  if (payload.department_id) await ensureDepartmentExists(payload.department_id);
  const activationKeyHash = crypto.createHash("sha256").update(payload.activation_key).digest("hex");
  const schedule = await prisma.monthly_payment_schedules.create({
    data: {
      amount: payload.amount,
      payment_date: payload.payment_date,
      payout_day: payload.payout_day,
      department_id: payload.department_id,
      applies_to_all: payload.applies_to_all,
      is_active: false,
      activation_key_hash: activationKeyHash,
      created_by: actor.id,
    },
  });
  await writeAuditLog({
    userId: actor.id,
    action: "company.balance.schedule.create",
    entityType: "monthly_payment_schedules",
    entityId: schedule.id,
    description: `Scheduled ETB ${payload.amount} for ${payload.payment_date.toISOString().slice(0, 10)}`,
    ipAddress,
  });
  return schedule;
};

export const activateMonthlyPaymentSchedule = async (actor, scheduleId, payload, ipAddress) => {
  const schedule = await prisma.monthly_payment_schedules.findUnique({ where: { id: scheduleId } });
  if (!schedule) throw new AppError("Payment schedule not found", 404);
  const keyHash = crypto.createHash("sha256").update(payload.activation_key).digest("hex");
  if (schedule.activation_key_hash !== keyHash) throw new AppError("Invalid activation key", 403);

  const activated = await prisma.monthly_payment_schedules.update({
    where: { id: scheduleId },
    data: { is_active: true, activated_at: new Date(), updated_at: new Date() },
  });
  await writeAuditLog({
    userId: actor.id,
    action: "company.balance.schedule.activate",
    entityType: "monthly_payment_schedules",
    entityId: scheduleId,
    description: "Activated scheduled payment",
    ipAddress,
  });
  return activated;
};

export const updateMonthlyAllocation = async (actor, allocationId, payload, ipAddress) => {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.monthly_allocations.findUnique({ where: { id: allocationId } });
    if (!existing) throw new AppError("Allocation not found", 404);

    if (await tx.expired_balance_restorations.count({ where: { allocation_id: allocationId } })) {
      throw new AppError("An allocation with restored funds cannot be edited", 409);
    }

    const cycleRange = getEthiopianCycleRange(
      gregorianToEthiopian(existing.cycle_start_at ?? existing.allocation_month),
    );
    const usedAggregate = await tx.balance_transactions.aggregate({
      where: {
        allocation_id: allocationId,
        restoration_id: null,
        created_at: { gte: cycleRange.startAt, lt: cycleRange.endAt },
        direction: "debit",
        transaction_type: { in: ["order", "expiration"] },
      },
      _sum: { amount: true },
    });
    const usedAmount = Number(usedAggregate._sum.amount ?? 0);

    if (Number(payload.amount) < usedAmount) {
      throw new AppError("Allocation cannot be reduced below the amount already used this month", 409);
    }

    const difference = Number(payload.amount) - Number(existing.amount);
    const updated = await tx.monthly_allocations.update({
      where: { id: allocationId },
      data: { amount: payload.amount, updated_at: new Date() },
    });

    if (difference !== 0) {
      await tx.balance_transactions.create({
        data: {
          user_id: existing.user_id,
          allocation_id: allocationId,
          amount: Math.abs(difference),
          direction: difference > 0 ? "credit" : "debit",
          transaction_type: "adjustment",
          reference_note: difference > 0 ? "Monthly allocation increase" : "Monthly allocation decrease",
        },
      });
    }

    await createNotification(
      {
        userId: existing.user_id,
        type: "allocation",
        title: "Meal balance updated",
        message: `Your monthly meal balance was updated to ETB ${Number(payload.amount).toFixed(2)}.`,
      },
      actor,
      ipAddress,
      tx,
    );

    await writeAuditLog(
      {
        userId: actor.id,
        action: "company.balance.update",
        entityType: "monthly_allocations",
        entityId: allocationId,
        description: `Updated allocation from ETB ${existing.amount} to ETB ${payload.amount}`,
        ipAddress,
      },
      tx,
    );

    return updated;
  });
};

const buildMonthlyReportRows = async (monthRange) => {
  const rows = await prisma.$queryRawUnsafe(
    `
      WITH allocation_order_totals AS (
        SELECT ma.id AS allocation_id,
               o.id AS order_id,
               SUM(bt.amount)::double precision AS cycle_amount
        FROM monthly_allocations ma
        JOIN balance_transactions bt
          ON bt.allocation_id = ma.id
         AND bt.transaction_type::text = 'order'
         AND bt.direction::text = 'debit'
        JOIN orders o
          ON bt.reference_note LIKE '%' || 'Order ' || o.order_uuid::text || '%'
        WHERE ma.allocation_month = $1::date
          AND o.status::text = ANY($2)
        GROUP BY ma.id, o.id
      ),
      orders_for_month AS (
        SELECT aot.allocation_id, aot.cycle_amount, o.*
        FROM allocation_order_totals aot
        JOIN orders o ON o.id = aot.order_id
      ),
      order_item_summary AS (
        SELECT o.allocation_id,
               oi.order_id,
               string_agg(oi.item_name_snapshot || ' x' || oi.quantity::text, ', ' ORDER BY oi.id) AS food_ordered
        FROM order_items oi
        JOIN orders_for_month o ON o.id = oi.order_id
        GROUP BY o.allocation_id, oi.order_id
      ),
      employee_order_totals AS (
        SELECT o.allocation_id,
               COUNT(*)::int AS total_orders,
               COALESCE(SUM(o.cycle_amount), 0)::double precision AS total_amount_used
        FROM orders_for_month o
        GROUP BY o.allocation_id
      ),
      allocation_totals AS (
        SELECT bt.allocation_id,
               SUM(bt.amount)::double precision AS original_allocated
        FROM balance_transactions bt
        WHERE bt.transaction_type::text = 'allocation'
          AND bt.direction::text = 'credit'
        GROUP BY bt.allocation_id
      ),
      balance_totals AS (
        SELECT bt.allocation_id,
               COALESCE(SUM(
                 CASE
                   WHEN bt.direction::text = 'credit' THEN bt.amount
                   WHEN bt.direction::text = 'debit' THEN -bt.amount
                   ELSE 0
                 END
               ), 0)::double precision AS remaining_balance,
               COALESCE(SUM(CASE
                 WHEN bt.transaction_type::text = 'order' AND bt.direction::text = 'debit' AND bt.restoration_id IS NULL THEN bt.amount
                 WHEN bt.transaction_type::text = 'refund' AND bt.direction::text = 'credit' AND bt.restoration_id IS NULL THEN -bt.amount
                 ELSE 0
               END), 0)::double precision AS initially_used,
               COALESCE(SUM(CASE
                 WHEN bt.transaction_type::text = 'expiration' AND bt.direction::text = 'debit' AND bt.restoration_id IS NULL THEN bt.amount
                 ELSE 0
               END), 0)::double precision AS initially_expired,
               COALESCE(SUM(CASE
                 WHEN bt.transaction_type::text = 'restoration' AND bt.direction::text = 'credit' THEN bt.amount
                 ELSE 0
               END), 0)::double precision AS returned_restored,
               COALESCE(SUM(CASE
                 WHEN bt.transaction_type::text = 'order' AND bt.direction::text = 'debit' AND bt.restoration_id IS NOT NULL THEN bt.amount
                 WHEN bt.transaction_type::text = 'refund' AND bt.direction::text = 'credit' AND bt.restoration_id IS NOT NULL THEN -bt.amount
                 ELSE 0
               END), 0)::double precision AS used_after_restoration,
               COALESCE(SUM(CASE
                 WHEN bt.transaction_type::text = 'expiration' AND bt.direction::text = 'debit' AND bt.restoration_id IS NOT NULL THEN bt.amount
                 ELSE 0
               END), 0)::double precision AS reexpired,
               COALESCE(SUM(CASE
                 WHEN bt.transaction_type::text = 'adjustment' AND bt.direction::text = 'credit' THEN bt.amount
                 WHEN bt.transaction_type::text = 'adjustment' AND bt.direction::text = 'debit' THEN -bt.amount
                 ELSE 0
               END), 0)::double precision AS net_adjustments
        FROM balance_transactions bt
        JOIN monthly_allocations ma ON ma.id = bt.allocation_id
        WHERE ma.allocation_month = $1::date
        GROUP BY bt.allocation_id
      )
      SELECT COALESCE(u.employee_external_id, u.id::text) AS employee_id,
             u.fullname AS employee_name,
             COALESCE(d.name, '') AS department,
             COALESCE(ma.cycle_label, '') AS cycle_label,
             ma.allocation_month,
             ma.cycle_start_at,
             ma.cycle_end_at,
             COALESCE(at.original_allocated, ma.amount::double precision) AS original_allocated,
             COALESCE(eot.total_orders, 0)::int AS total_orders,
             COALESCE(eot.total_amount_used, 0)::double precision AS total_amount_used,
             COALESCE(bt.initially_used, 0)::double precision AS initially_used,
             COALESCE(bt.initially_expired, 0)::double precision AS initially_expired,
             COALESCE(bt.returned_restored, 0)::double precision AS returned_restored,
             COALESCE(bt.used_after_restoration, 0)::double precision AS used_after_restoration,
             COALESCE(bt.reexpired, 0)::double precision AS reexpired,
             COALESCE(bt.net_adjustments, 0)::double precision AS net_adjustments,
             GREATEST(COALESCE(bt.remaining_balance, ma.amount::double precision), 0)::double precision AS remaining_balance,
             COALESCE(w.fullname, '') AS waiter_name,
             COALESCE(ois.food_ordered, '') AS food_ordered,
             COALESCE(to_char(o.created_at::date, 'YYYY-MM-DD'), '') AS date
      FROM monthly_allocations ma
      JOIN users u ON u.id = ma.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN employee_order_totals eot ON eot.allocation_id = ma.id
      LEFT JOIN allocation_totals at ON at.allocation_id = ma.id
      LEFT JOIN balance_totals bt ON bt.allocation_id = ma.id
      LEFT JOIN orders_for_month o ON o.allocation_id = ma.id
      LEFT JOIN users w ON w.id = o.waiter_id
      LEFT JOIN order_item_summary ois ON ois.allocation_id = ma.id AND ois.order_id = o.id
      WHERE ma.allocation_month = $1::date
        AND EXISTS (
          SELECT 1 FROM user_roles eur
          JOIN roles er ON er.id = eur.role_id
          WHERE eur.user_id = u.id AND er.name = 'employee'
        )
      ORDER BY u.fullname ASC, o.created_at ASC NULLS LAST
      LIMIT $3
    `,
    monthRange.start,
    COUNTABLE_ORDER_STATUSES,
    MAX_REPORT_ROWS + 1,
  );

  if (rows.length > MAX_REPORT_ROWS) {
    throw new AppError(`Report is too large. Narrow the month or export in batches of ${MAX_REPORT_ROWS} rows.`, 413);
  }

  return rows.map((row) => {
    const cycle = getAllocationCycleDates(row);
    const cycleLastDay = new Date(cycle.end.getTime() - 24 * 60 * 60 * 1000);
    return {
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      department: row.department,
      cycle_label: row.cycle_label || "Monthly Allocation Cycle",
      cycle_start_date: formatEthiopianDate(cycle.start),
      cycle_end_date: formatEthiopianDate(cycleLastDay),
      original_allocated: Number(row.original_allocated),
      net_adjustments: Number(row.net_adjustments),
      total_orders: Number(row.total_orders),
      total_amount_used: Number(row.total_amount_used),
      initially_used: Number(row.initially_used),
      initially_expired: Number(row.initially_expired),
      returned_restored: Number(row.returned_restored),
      used_after_restoration: Number(row.used_after_restoration),
      reexpired: Number(row.reexpired),
      final_balance: Number(row.remaining_balance),
      remaining_balance: Number(row.remaining_balance),
      waiter_name: row.waiter_name,
      food_ordered: row.food_ordered,
      date: row.date,
    };
  });
};

export const generateMonthlyReport = async (actor, params, ipAddress) => {
  const monthRange = getMonthRange(params.month);
  const rows = await buildMonthlyReportRows(monthRange);

  await writeAuditLog({
    userId: actor.id,
    action: "company.report.monthly",
    entityType: "orders",
    description: `Generated ${params.format} monthly report for ${monthRange.month}`,
    ipAddress,
  });

  if (params.format === "csv") {
    return { format: "csv", data: buildCsv(rows, REPORT_FIELDS), fileName: `company-monthly-report-${monthRange.month}.csv` };
  }

  if (params.format === "xlsx") {
    return { format: "xlsx", data: await buildXlsx(rows, REPORT_FIELDS, "Monthly Report"), fileName: `company-monthly-report-${monthRange.month}.xlsx` };
  }

  if (params.format === "pdf") {
    return { format: "pdf", data: await buildPdf(rows, REPORT_FIELDS, `Company Monthly Report - ${monthRange.month}`), fileName: `company-monthly-report-${monthRange.month}.pdf` };
  }

  return { format: "json", data: { month: monthRange.month, rows } };
};

export const getFinancialReport = async (params) => {
  const monthRange = getMonthRange(params.month);
  const [cafe_spending, department_spending] = await Promise.all([
    prisma.$queryRawUnsafe(
      `
        WITH allocation_order_totals AS (
          SELECT ma.id AS allocation_id,
                 o.id AS order_id,
                 SUM(bt.amount)::double precision AS cycle_amount
          FROM monthly_allocations ma
          JOIN balance_transactions bt
            ON bt.allocation_id = ma.id
           AND bt.transaction_type::text = 'order'
           AND bt.direction::text = 'debit'
          JOIN orders o
            ON bt.reference_note LIKE '%' || 'Order ' || o.order_uuid::text || '%'
          WHERE ma.allocation_month = $1::date
            AND o.status::text = ANY($2)
          GROUP BY ma.id, o.id
        )
        SELECT c.id AS cafe_id,
               c.name AS cafe_name,
               COUNT(DISTINCT o.id)::int AS total_orders,
               COALESCE(SUM(aot.cycle_amount), 0)::double precision AS total_amount
        FROM orders o
        JOIN allocation_order_totals aot ON aot.order_id = o.id
        JOIN cafes c ON c.id = o.cafe_id
        JOIN monthly_allocations ma ON ma.id = aot.allocation_id
        JOIN user_roles eur ON eur.user_id = ma.user_id
        JOIN roles er ON er.id = eur.role_id AND er.name = 'employee'
        GROUP BY c.id, c.name
        ORDER BY total_amount DESC
      `,
      monthRange.start,
      COUNTABLE_ORDER_STATUSES,
    ),
    prisma.$queryRawUnsafe(
      `
        WITH allocation_order_totals AS (
          SELECT ma.id AS allocation_id,
                 o.id AS order_id,
                 SUM(bt.amount)::double precision AS cycle_amount
          FROM monthly_allocations ma
          JOIN balance_transactions bt
            ON bt.allocation_id = ma.id
           AND bt.transaction_type::text = 'order'
           AND bt.direction::text = 'debit'
          JOIN orders o
            ON bt.reference_note LIKE '%' || 'Order ' || o.order_uuid::text || '%'
          WHERE ma.allocation_month = $1::date
            AND o.status::text = ANY($2)
          GROUP BY ma.id, o.id
        )
        SELECT d.id AS department_id,
               COALESCE(d.name, 'Unassigned') AS department_name,
               COUNT(DISTINCT o.id)::int AS total_orders,
               COALESCE(SUM(aot.cycle_amount), 0)::double precision AS total_amount
        FROM orders o
        JOIN allocation_order_totals aot ON aot.order_id = o.id
        JOIN monthly_allocations ma ON ma.id = aot.allocation_id
        JOIN users u ON u.id = ma.user_id
        JOIN user_roles eur ON eur.user_id = u.id
        JOIN roles er ON er.id = eur.role_id AND er.name = 'employee'
        LEFT JOIN departments d ON d.id = u.department_id
        GROUP BY d.id, d.name
        ORDER BY total_amount DESC
      `,
      monthRange.start,
      COUNTABLE_ORDER_STATUSES,
    ),
  ]);

  const normalizedCafeSpending = cafe_spending.map((row) => ({
    cafe_id: row.cafe_id,
    cafe_name: row.cafe_name,
    total_orders: Number(row.total_orders),
    total_amount: Number(row.total_amount),
  }));

  const normalizedDepartmentSpending = department_spending.map((row) => ({
    department_id: row.department_id,
    department_name: row.department_name,
    total_orders: Number(row.total_orders),
    total_amount: Number(row.total_amount),
  }));

  return {
    month: monthRange.month,
    total_company_obligation: Number(normalizedCafeSpending.reduce((sum, row) => sum + row.total_amount, 0).toFixed(2)),
    cafe_spending: normalizedCafeSpending,
    department_spending: normalizedDepartmentSpending,
  };
};

export const generateFinancialReport = async (actor, params, ipAddress) => {
  const data = await getFinancialReport(params);
  const rows = [
    ...data.cafe_spending.map((row) => ({
      type: "cafe",
      name: row.cafe_name,
      total_orders: row.total_orders,
      total_amount: row.total_amount,
    })),
    ...data.department_spending.map((row) => ({
      type: "department",
      name: row.department_name,
      total_orders: row.total_orders,
      total_amount: row.total_amount,
    })),
    {
      type: "summary",
      name: "Total Company Obligation",
      total_orders: data.cafe_spending.reduce((sum, row) => sum + row.total_orders, 0),
      total_amount: data.total_company_obligation,
    },
  ];

  await writeAuditLog({
    userId: actor.id,
    action: "company.report.financial",
    entityType: "orders",
    description: `Generated ${params.format} financial report for ${data.month}`,
    ipAddress,
  });

  if (params.format === "csv") {
    return { format: "csv", data: buildCsv(rows, FINANCIAL_REPORT_FIELDS), fileName: `company-financial-report-${data.month}.csv` };
  }

  if (params.format === "xlsx") {
    return { format: "xlsx", data: await buildXlsx(rows, FINANCIAL_REPORT_FIELDS, "Financial Report"), fileName: `company-financial-report-${data.month}.xlsx` };
  }

  if (params.format === "pdf") {
    return { format: "pdf", data: await buildPdf(rows, FINANCIAL_REPORT_FIELDS, `Company Financial Report - ${data.month}`), fileName: `company-financial-report-${data.month}.pdf` };
  }

  return { format: "json", data };
};

export const generateDepartmentUsageReport = async (actor, params, ipAddress, cafeId = null) => {
  const { start, month } = getMonthRange(params.month);
  const users = await prisma.users.findMany({
    where: {
      ...(params.department_id ? { department_id: params.department_id } : {}),
      user_roles: { some: { roles: { name: "employee" } } },
    },
    select: { id: true, employee_external_id: true, fullname: true, departments: { select: { id: true, name: true } } },
    orderBy: { fullname: "asc" },
  });
  const userIds = users.map((user) => user.id);
  const allocations = userIds.length
    ? await prisma.monthly_allocations.findMany({
      where: { user_id: { in: userIds }, allocation_month: start },
      select: {
        id: true,
        user_id: true,
        allocation_month: true,
        amount: true,
        cycle_start_at: true,
        cycle_end_at: true,
        cycle_label: true,
      },
    })
    : [];
  const allocationIds = allocations.map((allocation) => allocation.id);
  const transactions = allocationIds.length
    ? await prisma.balance_transactions.findMany({
      where: { allocation_id: { in: allocationIds } },
      select: {
        id: true,
        user_id: true,
        allocation_id: true,
        amount: true,
        direction: true,
        transaction_type: true,
        restoration_id: true,
        reference_note: true,
      },
    })
    : [];
  const orderUuids = [...new Set(transactions
    .filter((transaction) => transaction.transaction_type === "order")
    .map((transaction) => transaction.reference_note?.match(/Order ([a-z0-9-]+)/i)?.[1])
    .filter(Boolean))];
  const orders = orderUuids.length
    ? await prisma.orders.findMany({
      where: { order_uuid: { in: orderUuids }, ...(cafeId ? { cafe_id: cafeId } : {}) },
      include: { order_items: { select: { item_name_snapshot: true, quantity: true } } },
      orderBy: { created_at: "asc" },
    })
    : [];
  const restorations = allocationIds.length
    ? await prisma.expired_balance_restorations.findMany({
      where: { allocation_id: { in: allocationIds } },
      select: { allocation_id: true, restored_amount: true },
    })
    : [];
  const orderByUuid = new Map(orders.map((order) => [order.order_uuid, order]));
  const transactionsByAllocation = new Map();
  for (const transaction of transactions) {
    const bucket = transactionsByAllocation.get(transaction.allocation_id) ?? [];
    bucket.push(transaction);
    transactionsByAllocation.set(transaction.allocation_id, bucket);
  }
  const restorationsByAllocation = new Map();
  for (const restoration of restorations) {
    restorationsByAllocation.set(
      restoration.allocation_id,
      Number(((restorationsByAllocation.get(restoration.allocation_id) ?? 0) + Number(restoration.restored_amount)).toFixed(2)),
    );
  }
  const allocationByUser = new Map(allocations.map((allocation) => [allocation.user_id, allocation]));
  const employees = users.map((user) => {
    const allocation = allocationByUser.get(user.id);
    const allocationTransactions = allocation ? transactionsByAllocation.get(allocation.id) ?? [] : [];
    const netAmount = (items) => Number(items.reduce(
      (sum, transaction) => sum + (transaction.direction === "credit" ? Number(transaction.amount) : -Number(transaction.amount)),
      0,
    ).toFixed(2));
    const initiallyUsed = netAmount(allocationTransactions.filter((transaction) => transaction.restoration_id === null
      && ((transaction.transaction_type === "order" && transaction.direction === "debit")
        || (transaction.transaction_type === "refund" && transaction.direction === "credit"))));
    const usedAfterRestoration = netAmount(allocationTransactions.filter((transaction) => transaction.restoration_id !== null
      && ((transaction.transaction_type === "order" && transaction.direction === "debit")
        || (transaction.transaction_type === "refund" && transaction.direction === "credit"))));
    const expirationAmount = (items) => Number(items.reduce((sum, transaction) => sum + Number(transaction.amount), 0).toFixed(2));
    const initiallyExpired = expirationAmount(allocationTransactions.filter((transaction) => transaction.transaction_type === "expiration"
      && transaction.direction === "debit" && transaction.restoration_id === null));
    const reexpired = expirationAmount(allocationTransactions.filter((transaction) => transaction.transaction_type === "expiration"
      && transaction.direction === "debit" && transaction.restoration_id !== null));
    const originalAllocated = allocationTransactions
      .filter((transaction) => transaction.transaction_type === "allocation" && transaction.direction === "credit")
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const netAdjustments = netAmount(allocationTransactions.filter((transaction) => transaction.transaction_type === "adjustment"));
    const returnedRestored = Number(restorationsByAllocation.get(allocation?.id) ?? 0);
    const finalBalance = allocation ? Math.max(netAmount(allocationTransactions), 0) : 0;
    const cycle = allocation ? getAllocationCycleDates(allocation) : null;
    const allocationOrderUuids = [...new Set(allocationTransactions
      .filter((transaction) => transaction.transaction_type === "order")
      .map((transaction) => transaction.reference_note?.match(/Order ([a-z0-9-]+)/i)?.[1])
      .filter(Boolean))];
    const employeeOrders = allocationOrderUuids.map((uuid) => orderByUuid.get(uuid)).filter(Boolean);

    return {
      employee_id: user.employee_external_id ?? String(user.id),
      employee_name: user.fullname,
      department: user.departments?.name ?? "Unassigned",
      department_id: user.departments?.id ?? null,
      cycle_label: allocation?.cycle_label || (allocation ? "Monthly Allocation Cycle" : ""),
      cycle_start_date: cycle ? formatEthiopianDate(cycle.start) : "",
      cycle_end_date: cycle ? formatEthiopianDate(new Date(cycle.end.getTime() - 24 * 60 * 60 * 1000)) : "",
      original_allocated: Number((originalAllocated || Number(allocation?.amount ?? 0)).toFixed(2)),
      total_money_given: Number((originalAllocated || Number(allocation?.amount ?? 0)).toFixed(2)),
      net_adjustments: netAdjustments,
      total_used: Number((initiallyUsed + usedAfterRestoration).toFixed(2)),
      initially_used: initiallyUsed,
      initially_expired: initiallyExpired,
      returned_restored: returnedRestored,
      used_after_restoration: usedAfterRestoration,
      reexpired,
      final_balance: finalBalance,
      remaining_balance: finalBalance,
      expired_money: Number((initiallyExpired + reexpired).toFixed(2)),
      daily_meal_usage: employeeOrders.map((order) => `${order.created_at.toISOString().slice(0, 10)}: ${order.order_items.map((item) => `${item.item_name_snapshot} x${item.quantity}`).join(", ")} (ETB ${Number(order.total_amount).toFixed(2)})`).join("; ") || "No meals",
    };
  });
  const departmentMap = new Map();
  employees.forEach((employee) => {
    const summary = departmentMap.get(employee.department) ?? {
      department: employee.department,
      department_id: employee.department_id,
      employee_count: 0,
      total_money_given: 0,
      net_adjustments: 0,
      total_used: 0,
      initially_used: 0,
      initially_expired: 0,
      returned_restored: 0,
      used_after_restoration: 0,
      reexpired: 0,
      final_balance: 0,
      expired_money: 0,
    };
    summary.employee_count += 1;
    summary.total_money_given += employee.total_money_given;
    summary.net_adjustments += employee.net_adjustments;
    summary.total_used += employee.total_used;
    summary.initially_used += employee.initially_used;
    summary.initially_expired += employee.initially_expired;
    summary.returned_restored += employee.returned_restored;
    summary.used_after_restoration += employee.used_after_restoration;
    summary.reexpired += employee.reexpired;
    summary.final_balance += employee.final_balance;
    summary.expired_money += employee.expired_money;
    departmentMap.set(employee.department, summary);
  });
  const departments = [...departmentMap.values()].map((department) => ({
    ...department,
    total_money_given: Number(department.total_money_given.toFixed(2)),
    net_adjustments: Number(department.net_adjustments.toFixed(2)),
    total_used: Number(department.total_used.toFixed(2)),
    initially_used: Number(department.initially_used.toFixed(2)),
    initially_expired: Number(department.initially_expired.toFixed(2)),
    returned_restored: Number(department.returned_restored.toFixed(2)),
    used_after_restoration: Number(department.used_after_restoration.toFixed(2)),
    reexpired: Number(department.reexpired.toFixed(2)),
    final_balance: Number(department.final_balance.toFixed(2)),
    expired_money: Number(department.expired_money.toFixed(2)),
  }));
  await writeAuditLog({ userId: actor.id, action: "report.department_usage", entityType: "reports", description: `Generated department usage report for ${month}`, ipAddress });

  if (params.format === "json") return { format: "json", data: { month, departments, employees } };
  const rows = params.department_id ? employees : departments;
  const fields = params.department_id ? EMPLOYEE_USAGE_FIELDS : DEPARTMENT_USAGE_FIELDS;
  const fileBase = params.department_id ? `employee-usage-${month}` : `department-usage-${month}`;
  if (params.format === "csv") return { format: "csv", data: buildCsv(rows, fields), fileName: `${fileBase}.csv` };
  if (params.format === "xlsx") return { format: "xlsx", data: await buildXlsx(rows, fields, "Usage Report"), fileName: `${fileBase}.xlsx` };
  return { format: "pdf", data: await buildPdf(rows, fields, "Department Usage Report"), fileName: `${fileBase}.pdf` };
};

export const listFeedback = async (actor, filters, pagination, ipAddress) => {
  const monthRange = filters.month ? getMonthRange(filters.month) : null;
  const where = {
    ...(filters.cafe_id ? { cafe_id: filters.cafe_id } : {}),
    ...(filters.employee_id ? { user_id: filters.employee_id } : {}),
    ...(filters.search ? { comment: { contains: filters.search, mode: "insensitive" } } : {}),
    ...(monthRange ? { created_at: { gte: monthRange.start, lt: monthRange.end } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      include: {
        users: { select: { id: true, employee_external_id: true, fullname: true } },
        cafes: { select: { id: true, name: true } },
      },
      orderBy: { created_at: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.feedback.count({ where }),
  ]);

  await writeAuditLog({
    userId: actor.id,
    action: "company.feedback.list",
    entityType: "feedback",
    description: "Listed feedback",
    ipAddress,
  });

  return { items, total, page: pagination.page, limit: pagination.limit, total_pages: Math.ceil(total / pagination.limit) };
};

export const resetEmployeePassword = async (actor, payload, ipAddress) => {
  const user = await getUserOrThrow(payload.user_id);
  const roles = await prisma.user_roles.findMany({ where: { user_id: user.id }, include: { roles: true } });
  const isEmployee = roles.some((role) => role.roles.name === "employee");
  if (isEmployee && !/^\d{6}$/.test(payload.new_password)) {
    throw new AppError("Employee password must be exactly a 6-digit number", 400);
  }
  if (!isEmployee && (payload.new_password.length < 8 || !/[a-z]/.test(payload.new_password) || !/[A-Z]/.test(payload.new_password) || !/[0-9]/.test(payload.new_password))) {
    throw new AppError("Manager and waiter passwords must be at least 8 characters and include uppercase, lowercase, and number", 400);
  }
  const passwordHash = await hashPassword(payload.new_password);

  return prisma.$transaction(async (tx) => {
    await tx.users.update({
      where: { id: payload.user_id },
      data: { password_hash: passwordHash, updated_at: new Date() },
    });

    await notifyPasswordReset(payload.user_id, actor, ipAddress, tx);
    await writeAuditLog(
      {
        userId: actor.id,
        action: "company.employee.password_reset",
        entityType: "users",
        entityId: payload.user_id,
        description: "Reset employee password",
        ipAddress,
      },
      tx,
    );

    return { user_id: payload.user_id, reset: true };
  });
};
