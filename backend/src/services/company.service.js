import prisma from "../config/db.js";
import { hashPassword } from "./auth.service.js";
import { writeAuditLog } from "./audit.service.js";
import { createNotification, notifyAllocation, notifyPasswordReset } from "./notification.service.js";
import { getEmployeeCurrentMonthSummary } from "./balance.service.js";
import { AppError } from "../utils/AppError.js";
import { getMonthRange } from "../utils/date.js";
import { buildCsv, buildPdf, buildXlsx } from "../utils/report.js";

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

const MAX_REPORT_ROWS = 10000;
const COUNTABLE_ORDER_STATUSES = ["confirmed", "preparing", "ready", "completed"];
const ALLOWED_ROLES = ["employee", "waiter", "cafe_manager", "company_manager"];

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

const ensureRoles = async (roles, tx) => {
  const invalid = roles.filter((role) => !ALLOWED_ROLES.includes(role));
  if (invalid.length) {
    throw new AppError(`Invalid role: ${invalid.join(", ")}`, 400);
  }

  const dbRoles = await tx.roles.findMany({ where: { name: { in: roles } } });
  const found = new Set(dbRoles.map((role) => role.name));
  const missing = roles.filter((role) => !found.has(role));

  if (missing.length) {
    throw new AppError(`Missing roles in database: ${missing.join(", ")}`, 500);
  }

  return dbRoles;
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
  assertCafeAssignmentMatchesRoles(payload.roles, payload.cafe_id);

  return prisma.$transaction(async (tx) => {
    await ensureDepartmentExists(payload.department_id, tx);

    const employee = await tx.users.create({
      data: {
        employee_external_id: payload.employee_external_id,
        fullname: payload.fullname,
        email: payload.email,
        phone_number: payload.phone_number,
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
    const cafe = await tx.cafes.delete({ where: { id: cafeId } });
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

  const itemsWithBalance = await Promise.all(items.map(async (employee) => {
    const summary = await getEmployeeCurrentMonthSummary(employee.id);
    return {
      ...formatEmployee(employee),
      balance: Number(summary.remaining ?? 0),
    };
  }));

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

  const { roles, cafe_id: cafeId, ...userData } = payload;
  const effectiveRoles = roles ?? existingUser.user_roles.map((userRole) => userRole.roles.name);
  const effectiveCafeId = payload.cafe_id !== undefined ? cafeId : existingUser.cafe_staff?.cafe_id;
  assertCafeAssignmentMatchesRoles(effectiveRoles, effectiveCafeId);

  return prisma.$transaction(async (tx) => {
    await ensureDepartmentExists(userData.department_id, tx);
    if (roles) await syncUserRoles(userId, roles, tx);
    if (payload.cafe_id !== undefined) await syncCafeAssignment(userId, cafeId, tx);

    const employee = await tx.users.update({
      where: { id: userId },
      data: { ...userData, updated_at: new Date() },
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
    await tx.feedback.deleteMany({ where: { user_id: userId } });
    await tx.login_history.deleteMany({ where: { user_id: userId } });
    await tx.password_reset_tokens.deleteMany({ where: { user_id: userId } });
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

export const createDepartment = async (actor, payload, ipAddress) => {
  return prisma.$transaction(async (tx) => {
    const department = await tx.departments.create({ data: payload });
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
    const department = await tx.departments.update({ where: { id: departmentId }, data: payload });
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
  const employeeCount = await prisma.users.count({ where: { department_id: departmentId } });
  if (employeeCount > 0) {
    throw new AppError("Cannot delete department with assigned employees", 409);
  }

  return prisma.$transaction(async (tx) => {
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

export const createMonthlyPaymentSchedule = async (actor, payload, ipAddress) => {
  if (payload.department_id) await ensureDepartmentExists(payload.department_id);
  const schedule = await prisma.monthly_payment_schedules.create({
    data: { ...payload, created_by: actor.id },
  });
  await writeAuditLog({
    userId: actor.id,
    action: "company.balance.schedule.create",
    entityType: "monthly_payment_schedules",
    entityId: schedule.id,
    description: `Scheduled ETB ${payload.amount} on day ${payload.payout_day} each month`,
    ipAddress,
  });
  return schedule;
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
  await getUserOrThrow(payload.user_id);
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
