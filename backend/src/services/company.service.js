import prisma from "../config/db.js";
import { comparePassword, hashPassword } from "./auth.service.js";
import { writeAuditLog } from "./audit.service.js";
import { createNotification, notifyAllocation, notifyPasswordReset } from "./notification.service.js";
import { AppError } from "../utils/AppError.js";
import { getMonthRange } from "../utils/date.js";
import { buildCsv, buildPdf, buildXlsx } from "../utils/report.js";
import crypto from "crypto";
import { buildWaiterPanelUrl, generateQRToken, hashQRToken } from "./qr.service.js";

const REPORT_FIELDS = [
  { key: "employee_id", header: "Employee ID", width: 18 },
  { key: "employee_name", header: "Employee Name", width: 24 },
  { key: "department", header: "Department", width: 22 },
  { key: "total_orders", header: "Total Orders", width: 15 },
  { key: "total_amount_used", header: "Total Amount Used", width: 18 },
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
  { key: "expired_money", header: "Expired Money (ETB)", width: 23 },
  { key: "total_used", header: "Total Used Money (ETB)", width: 26 },
];

const EMPLOYEE_USAGE_FIELDS = [
  { key: "employee_id", header: "Employee ID", width: 18 },
  { key: "employee_name", header: "Employee", width: 26 },
  { key: "department", header: "Department", width: 22 },
  { key: "total_used", header: "Total Used (ETB)", width: 18 },
  { key: "expired_money", header: "Expired (ETB)", width: 18 },
  { key: "daily_meal_usage", header: "Daily / Meal Usage", width: 52 },
];

const MAX_REPORT_ROWS = 10000;
const COUNTABLE_ORDER_STATUSES = ["confirmed", "preparing", "ready", "completed"];
const ALLOWED_ROLES = ["employee", "waiter", "cafe_manager", "company_manager"];
const PRINTED_QR_TTL_MINUTES = 365 * 24 * 60;

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

  // Fetch balances in three batched queries.  The previous per-employee
  // lookup ran hundreds of queries when the overview opened, making the
  // manager portal slow and prone to database timeouts.
  const employeeIds = items.map((employee) => employee.id);
  const { start, end } = getMonthRange();
  const [allocations, transactions] = employeeIds.length ? await Promise.all([
    prisma.monthly_allocations.findMany({
      where: { user_id: { in: employeeIds }, allocation_month: start },
      select: { user_id: true, amount: true },
    }),
    prisma.balance_transactions.groupBy({
      by: ["user_id", "direction"],
      where: { user_id: { in: employeeIds }, created_at: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
  ]) : [[], []];
  const balances = new Map(allocations.map((allocation) => [allocation.user_id, { credit: 0, debit: 0 }]));
  transactions.forEach((transaction) => {
    const balance = balances.get(transaction.user_id) ?? { credit: 0, debit: 0 };
    if (transaction.direction === "credit") balance.credit = Number(transaction._sum.amount ?? 0);
    if (transaction.direction === "debit") balance.debit = Number(transaction._sum.amount ?? 0);
    balances.set(transaction.user_id, balance);
  });
  const itemsWithBalance = items.map((employee) => {
    const balance = balances.get(employee.id) ?? { credit: 0, debit: 0 };
    return { ...formatEmployee(employee), balance: Math.max(balance.credit - balance.debit, 0) };
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
    // Explicitly remove every dependent record.  Some installations were
    // created before the cascade constraints existed, so relying on database
    // cascades made waiter deletion fail with a foreign-key error.
    await tx.qr_sessions.deleteMany({ where: { OR: [{ employee_id: userId }, { waiter_id: userId }] } });
    await tx.employee_qr_codes.deleteMany({ where: { user_id: userId } });
    await tx.order_items.deleteMany({
      where: {
        orders: {
          OR: [{ employee_id: userId }, { waiter_id: userId }],
        },
      },
    });

    await tx.orders.deleteMany({
      where: {
        OR: [{ employee_id: userId }, { waiter_id: userId }],
      },
    });

    await tx.balance_transactions.deleteMany({ where: { user_id: userId } });
    await tx.monthly_allocations.deleteMany({ where: { user_id: userId } });
    await tx.feedback.deleteMany({ where: { user_id: userId } });
    await tx.notifications.deleteMany({ where: { user_id: userId } });
    await tx.login_history.deleteMany({ where: { user_id: userId } });
    await tx.password_reset_tokens.deleteMany({ where: { user_id: userId } });
    await tx.refresh_tokens.deleteMany({ where: { user_id: userId } });
    await tx.cafe_staff.deleteMany({ where: { user_id: userId } });
    await tx.user_roles.deleteMany({ where: { user_id: userId } });
    await tx.audit_logs.deleteMany({ where: { user_id: userId } });

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

export const issueAllPrintableEmployeeQrs = async (actor, ipAddress) => {
  const employees = await prisma.users.findMany({
    where: { is_active: true, user_roles: { some: { roles: { name: "employee" } } } },
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
      },
    });

    await tx.balance_transactions.create({
      data: {
        user_id: payload.user_id,
        allocation_id: allocation.id,
        amount: payload.amount,
        direction: "credit",
        transaction_type: "allocation",
        reference_note: `Monthly meal balance allocation for ${month}`,
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

    const monthEnd = new Date(Date.UTC(existing.allocation_month.getUTCFullYear(), existing.allocation_month.getUTCMonth() + 1, 1));
    const usedAggregate = await tx.balance_transactions.aggregate({
      where: {
        user_id: existing.user_id,
        created_at: { gte: existing.allocation_month, lt: monthEnd },
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
      WITH orders_for_month AS (
        SELECT o.*
        FROM orders o
        WHERE o.created_at >= $1
          AND o.created_at < $2
          AND o.status::text = ANY($3)
      ),
      order_item_summary AS (
        SELECT oi.order_id,
               string_agg(oi.item_name_snapshot || ' x' || oi.quantity::text, ', ' ORDER BY oi.id) AS food_ordered
        FROM order_items oi
        JOIN orders_for_month o ON o.id = oi.order_id
        GROUP BY oi.order_id
      ),
      employee_order_totals AS (
        SELECT o.employee_id,
               COUNT(*)::int AS total_orders,
               COALESCE(SUM(o.total_amount), 0)::double precision AS total_amount_used
        FROM orders_for_month o
        JOIN user_roles eur ON eur.user_id = o.employee_id
        JOIN roles er ON er.id = eur.role_id AND er.name = 'employee'
        GROUP BY o.employee_id
      ),
      balance_totals AS (
        SELECT bt.user_id,
               COALESCE(SUM(
                 CASE
                   WHEN bt.direction::text = 'credit' THEN bt.amount
                   WHEN bt.direction::text = 'debit' THEN -bt.amount
                   ELSE 0
                 END
               ), 0)::double precision AS remaining_balance
        FROM balance_transactions bt
        WHERE bt.created_at >= $1
          AND bt.created_at < $2
        GROUP BY bt.user_id
      )
      SELECT COALESCE(u.employee_external_id, u.id::text) AS employee_id,
             u.fullname AS employee_name,
             COALESCE(d.name, '') AS department,
             COALESCE(eot.total_orders, 0)::int AS total_orders,
             COALESCE(eot.total_amount_used, 0)::double precision AS total_amount_used,
             GREATEST(COALESCE(bt.remaining_balance, ma.amount::double precision), 0)::double precision AS remaining_balance,
             COALESCE(w.fullname, '') AS waiter_name,
             COALESCE(ois.food_ordered, '') AS food_ordered,
             COALESCE(to_char(o.created_at::date, 'YYYY-MM-DD'), '') AS date
      FROM monthly_allocations ma
      JOIN users u ON u.id = ma.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN employee_order_totals eot ON eot.employee_id = u.id
      LEFT JOIN balance_totals bt ON bt.user_id = u.id
      LEFT JOIN orders_for_month o ON o.employee_id = u.id
      LEFT JOIN users w ON w.id = o.waiter_id
      LEFT JOIN order_item_summary ois ON ois.order_id = o.id
      WHERE ma.allocation_month = $1::date
        AND EXISTS (
          SELECT 1 FROM user_roles eur
          JOIN roles er ON er.id = eur.role_id
          WHERE eur.user_id = u.id AND er.name = 'employee'
        )
      ORDER BY u.fullname ASC, o.created_at ASC NULLS LAST
      LIMIT $4
    `,
    monthRange.start,
    monthRange.end,
    COUNTABLE_ORDER_STATUSES,
    MAX_REPORT_ROWS + 1,
  );

  if (rows.length > MAX_REPORT_ROWS) {
    throw new AppError(`Report is too large. Narrow the month or export in batches of ${MAX_REPORT_ROWS} rows.`, 413);
  }

  return rows.map((row) => ({
    employee_id: row.employee_id,
    employee_name: row.employee_name,
    department: row.department,
    total_orders: Number(row.total_orders),
    total_amount_used: Number(row.total_amount_used),
    remaining_balance: Number(row.remaining_balance),
    waiter_name: row.waiter_name,
    food_ordered: row.food_ordered,
    date: row.date,
  }));
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
        SELECT c.id AS cafe_id,
               c.name AS cafe_name,
               COUNT(o.id)::int AS total_orders,
               COALESCE(SUM(o.total_amount), 0)::double precision AS total_amount
        FROM orders o
        JOIN cafes c ON c.id = o.cafe_id
        JOIN user_roles eur ON eur.user_id = o.employee_id
        JOIN roles er ON er.id = eur.role_id AND er.name = 'employee'
        WHERE o.created_at >= $1
          AND o.created_at < $2
          AND o.status::text = ANY($3)
        GROUP BY c.id, c.name
        ORDER BY total_amount DESC
      `,
      monthRange.start,
      monthRange.end,
      COUNTABLE_ORDER_STATUSES,
    ),
    prisma.$queryRawUnsafe(
      `
        SELECT d.id AS department_id,
               COALESCE(d.name, 'Unassigned') AS department_name,
               COUNT(o.id)::int AS total_orders,
               COALESCE(SUM(o.total_amount), 0)::double precision AS total_amount
        FROM orders o
        JOIN users u ON u.id = o.employee_id
        JOIN user_roles eur ON eur.user_id = u.id
        JOIN roles er ON er.id = eur.role_id AND er.name = 'employee'
        LEFT JOIN departments d ON d.id = u.department_id
        WHERE o.created_at >= $1
          AND o.created_at < $2
          AND o.status::text = ANY($3)
        GROUP BY d.id, d.name
        ORDER BY total_amount DESC
      `,
      monthRange.start,
      monthRange.end,
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
  const { start, end, month } = getMonthRange(params.month);
  const users = await prisma.users.findMany({
    where: {
      ...(params.department_id ? { department_id: params.department_id } : {}),
      user_roles: { some: { roles: { name: "employee" } } },
    },
    select: { id: true, employee_external_id: true, fullname: true, departments: { select: { id: true, name: true } } },
    orderBy: { fullname: "asc" },
  });
  const userIds = users.map((user) => user.id);
  const [orders, expirations, allocations] = await Promise.all([
    prisma.orders.findMany({
      where: { employee_id: { in: userIds }, created_at: { gte: start, lt: end }, ...(cafeId ? { cafe_id: cafeId } : {}) },
      include: { order_items: { select: { item_name_snapshot: true, quantity: true } } },
      orderBy: { created_at: "asc" },
    }),
    prisma.balance_transactions.findMany({
      where: { user_id: { in: userIds }, transaction_type: "expiration", created_at: { gte: start, lt: end } },
      select: { user_id: true, amount: true },
    }),
    prisma.monthly_allocations.findMany({
      where: { user_id: { in: userIds }, allocation_month: start },
      select: { user_id: true, amount: true },
    }),
  ]);
  const ordersByUser = new Map();
  orders.forEach((order) => ordersByUser.set(order.employee_id, [...(ordersByUser.get(order.employee_id) ?? []), order]));
  const expiredByUser = new Map();
  expirations.forEach((transaction) => expiredByUser.set(transaction.user_id, Number(expiredByUser.get(transaction.user_id) ?? 0) + Number(transaction.amount)));
  const allocatedByUser = new Map();
  allocations.forEach((allocation) => allocatedByUser.set(allocation.user_id, Number(allocation.amount)));

  const employees = users.map((user) => {
    const employeeOrders = ordersByUser.get(user.id) ?? [];
    const totalUsed = employeeOrders.reduce((sum, order) => sum + Number(order.total_amount), 0);
    return {
      employee_id: user.employee_external_id ?? String(user.id),
      employee_name: user.fullname,
      department: user.departments?.name ?? "Unassigned",
      department_id: user.departments?.id ?? null,
      total_money_given: Number((allocatedByUser.get(user.id) ?? 0).toFixed(2)),
      total_used: Number(totalUsed.toFixed(2)),
      expired_money: Number((expiredByUser.get(user.id) ?? 0).toFixed(2)),
      daily_meal_usage: employeeOrders.map((order) => `${order.created_at.toISOString().slice(0, 10)}: ${order.order_items.map((item) => `${item.item_name_snapshot} x${item.quantity}`).join(", ")} (ETB ${Number(order.total_amount).toFixed(2)})`).join("; ") || "No meals",
    };
  });
  const departmentMap = new Map();
  employees.forEach((employee) => {
    const summary = departmentMap.get(employee.department) ?? { department: employee.department, department_id: employee.department_id, employee_count: 0, total_money_given: 0, total_used: 0, expired_money: 0 };
    summary.employee_count += 1;
    summary.total_money_given += employee.total_money_given;
    summary.total_used += employee.total_used;
    summary.expired_money += employee.expired_money;
    departmentMap.set(employee.department, summary);
  });
  const departments = [...departmentMap.values()].map((department) => ({ ...department, total_money_given: Number(department.total_money_given.toFixed(2)), total_used: Number(department.total_used.toFixed(2)), expired_money: Number(department.expired_money.toFixed(2)) }));
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
