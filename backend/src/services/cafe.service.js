import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { stringify } from "csv-stringify";
import prisma from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { assertValidUploadedImage, UPLOAD_MENU_DIR } from "../middleware/upload.middleware.js";
import { writeAuditLog } from "./audit.service.js";

const COUNTABLE_ORDER_STATUSES = ["confirmed", "preparing", "ready", "completed"];

const resolveCafeId = (user) => {
  if (!user) {
    return 1; // <-- use a cafe ID that exists in your database
  }

  if (!user.cafeId) {
    throw new AppError("Cafe manager is not assigned to a cafe", 403);
  }

  return user.cafeId;
};
const formatMenuItem = (item) => ({
  id: item.id,
  cafe_id: item.cafe_id,
  name: item.name,
  description: item.description,
  price: Number(item.price),
  image_url: item.image_url,
  is_available: item.is_available,
  created_at: item.created_at,
  updated_at: item.updated_at,
});

const OPERATIONAL_REPORT_FIELDS = [
  { key: "metric", header: "Metric" },
  { key: "name", header: "Name" },
  { key: "total_orders", header: "Total Orders" },
  { key: "total_sales", header: "Total Sales" },
  { key: "quantity", header: "Quantity" },
  { key: "extra", header: "Extra" },
];

const parseMonth = (month) => {
  const value = month || new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = value.split("-").map(Number);

  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new AppError("Invalid month", 400);
  }

  const monthStart = new Date(Date.UTC(year, monthNumber - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNumber, 1));
  return {
    monthString: value,
    monthStart,
    monthEnd,
  };
};

const generateCsv = (rows) => {
  return stringify(rows, {
    header: true,
    columns: OPERATIONAL_REPORT_FIELDS.map((field) => ({
      key: field.key,
      header: field.header,
    })),
  });
};

const generateExcel = async (rows) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Cafe Report");
  sheet.columns = OPERATIONAL_REPORT_FIELDS.map((field) => ({
    header: field.header,
    key: field.key,
    width: 24,
  }));
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
};

const generatePdf = (rows, title) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text(title, { align: "center" });
    doc.moveDown(1);
    doc.fontSize(10);

    doc.text(OPERATIONAL_REPORT_FIELDS.map((field) => field.header).join(" | "), { width: 520 });
    doc.moveDown(0.5);

    for (const row of rows) {
      doc.text(OPERATIONAL_REPORT_FIELDS.map((field) => row[field.key] ?? "").join(" | "), { width: 520 });
      doc.moveDown(0.2);
    }

    doc.end();
  });
};

const getMenuItemForCafe = async (menuItemId, cafeId) => {
  const item = await prisma.menu_items.findFirst({
    where: { id: menuItemId, cafe_id: cafeId },
  });

  if (!item) {
    throw new AppError("Menu item not found", 404);
  }

  return item;
};

export const getPublicMenuItems = async (cafeId) => {
  const items = await prisma.menu_items.findMany({
    where: { cafe_id: cafeId, is_available: true },
    orderBy: [{ name: "asc" }],
  });

  return items.map(formatMenuItem);
};

const deleteImageFile = (imageUrl) => {
  if (!imageUrl) return;

  const filename = path.basename(imageUrl);
  const filePath = path.join(UPLOAD_MENU_DIR, filename);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

export const getMenuItems = async (user, ipAddress = null) => {
  const cafeId = resolveCafeId(user);

  const items = await prisma.menu_items.findMany({
    where: { cafe_id: cafeId },
    orderBy: [{ is_available: "desc" }, { name: "asc" }],
  });

  await writeAuditLog({
    userId: user?.id ?? null,
    action: "cafe.menu.list",
    entityType: "menu_items",
    description: `Listed menu items for cafe ${cafeId}`,
    ipAddress,
  });

  return items.map(formatMenuItem);
};

export const createMenuItem = async (user, payload, imageFile, ipAddress) => {
  const cafeId = resolveCafeId(user);
  assertValidUploadedImage(imageFile);

  const cafe = await prisma.cafes.findFirst({
    where: { id: cafeId, is_active: true },
  });

  if (!cafe) {
    throw new AppError("Assigned cafe is inactive or not found", 404);
  }

  const imageUrl = imageFile ? `/uploads/menu/${imageFile.filename}` : null;

  let item;
  try {
    item = await prisma.$transaction(async (tx) => {
      const created = await tx.menu_items.create({
        data: {
          cafe_id: cafeId,
          name: payload.name,
          description: payload.description,
          price: payload.price,
          is_available: payload.is_available,
          image_url: imageUrl,
        },
      });

      await writeAuditLog(
        {
          userId: user?.id ?? null,
          action: "cafe.menu.create",
          entityType: "menu_items",
          entityId: created.id,
          description: `Created menu item ${created.name}`,
          ipAddress,
        },
        tx,
      );

      return created;
    });
  } catch (error) {
    deleteImageFile(imageUrl);
    throw error;
  }

  return formatMenuItem(item);
};

export const updateMenuItem = async (user, menuItemId, payload, imageFile, ipAddress) => {
  const cafeId = resolveCafeId(user);
  const existing = await getMenuItemForCafe(menuItemId, cafeId);
  assertValidUploadedImage(imageFile);

  const updateData = { ...payload, updated_at: new Date() };
  const oldImageUrl = existing.image_url;

  if (imageFile) {
    updateData.image_url = `/uploads/menu/${imageFile.filename}`;
  }

  let item;
  try {
    item = await prisma.$transaction(async (tx) => {
      const updated = await tx.menu_items.update({
        where: { id: menuItemId },
        data: updateData,
      });

      await writeAuditLog(
        {
          userId: user?.id ?? null,
          action: "cafe.menu.update",
          entityType: "menu_items",
          entityId: menuItemId,
          description: `Updated menu item ${updated.name}`,
          ipAddress,
        },
        tx,
      );

      return updated;
    });
  } catch (error) {
    if (imageFile) deleteImageFile(updateData.image_url);
    throw error;
  }

  if (imageFile) {
    deleteImageFile(oldImageUrl);
  }

  return formatMenuItem(item);
};

export const deleteMenuItem = async (user, menuItemId, ipAddress) => {
  const cafeId = resolveCafeId(user);
  const existing = await getMenuItemForCafe(menuItemId, cafeId);

  const orderCount = await prisma.order_items.count({
    where: { menu_item_id: menuItemId },
  });

  if (orderCount > 0) {
    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.menu_items.update({
        where: { id: menuItemId },
        data: { is_available: false, updated_at: new Date() },
      });

      await writeAuditLog(
        {
          userId: user?.id ?? null,
          action: "cafe.menu.mark_unavailable",
          entityType: "menu_items",
          entityId: menuItemId,
          description: "Marked menu item unavailable because it has existing orders",
          ipAddress,
        },
        tx,
      );

      return updated;
    });

    return {
      ...formatMenuItem(item),
      deleted: false,
      message: "Item has existing orders and was marked unavailable instead of deleted",
    };
  }

  deleteImageFile(existing.image_url);

  await prisma.$transaction(async (tx) => {
    await tx.menu_items.delete({
      where: { id: menuItemId },
    });

    await writeAuditLog(
      {
        userId: user?.id ?? null,
        action: "cafe.menu.delete",
        entityType: "menu_items",
        entityId: menuItemId,
        description: `Deleted menu item ${existing.name}`,
        ipAddress,
      },
      tx,
    );
  });

  return {
    id: menuItemId,
    deleted: true,
    message: "Menu item deleted successfully",
  };
};

export const setMenuItemAvailability = async (user, menuItemId, isAvailable, ipAddress) => {
  const cafeId = resolveCafeId(user);
  await getMenuItemForCafe(menuItemId, cafeId);

  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.menu_items.update({
      where: { id: menuItemId },
      data: { is_available: isAvailable, updated_at: new Date() },
    });

    await writeAuditLog(
      {
        userId: user?.id ?? null,
        action: isAvailable ? "cafe.menu.mark_available" : "cafe.menu.mark_unavailable",
        entityType: "menu_items",
        entityId: menuItemId,
        description: `Set menu item availability to ${isAvailable}`,
        ipAddress,
      },
      tx,
    );

    return updated;
  });

  return formatMenuItem(item);
};

export const getCafeOrders = async (user, pagination, ipAddress = null) => {
  const cafeId = resolveCafeId(user);
  const where = { cafe_id: cafeId };

  const [orders, total] = await Promise.all([
    prisma.orders.findMany({
      where,
      include: {
        order_items: true,
        users_orders_employee_idTousers: {
          select: { fullname: true, employee_external_id: true },
        },
        users_orders_waiter_idTousers: {
          select: { fullname: true },
        },
      },
      orderBy: { created_at: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.orders.count({ where }),
  ]);

  await writeAuditLog({
    userId: user?.id ?? null,
    action: "cafe.orders.list",
    entityType: "orders",
    description: `Listed orders for cafe ${cafeId}`,
    ipAddress,
  });

  return {
    items: orders.map((order) => ({
      id: order.id,
      order_uuid: order.order_uuid,
      status: order.status,
      order_method: order.order_method,
      total_amount: Number(order.total_amount),
      created_at: order.created_at,
      completed_at: order.completed_at,
      employee_name: order.users_orders_employee_idTousers?.fullname ?? null,
      employee_external_id: order.users_orders_employee_idTousers?.employee_external_id ?? null,
      waiter_name: order.users_orders_waiter_idTousers?.fullname ?? null,
      items: order.order_items.map((item) => ({
        menu_item_id: item.menu_item_id,
        name: item.item_name_snapshot,
        quantity: item.quantity,
        unit_price: Number(item.unit_price_snapshot),
        subtotal: Number(item.subtotal),
      })),
    })),
    total,
    page: pagination.page,
    limit: pagination.limit,
    total_pages: Math.ceil(total / pagination.limit),
  };
};

export const getCafeWaiters = async (user, ipAddress = null) => {
  const cafeId = resolveCafeId(user);

  const staff = await prisma.cafe_staff.findMany({
    where: {
      cafe_id: cafeId,
      users: {
        user_roles: { some: { roles: { name: "waiter" } } },
      },
    },
    include: {
      users: {
        select: { id: true, fullname: true, employee_external_id: true, is_active: true },
      },
    },
    orderBy: { assigned_at: "asc" },
  });

  const waiterIds = staff.map((entry) => entry.user_id);
  const orderCounts = waiterIds.length
    ? await prisma.orders.groupBy({
        by: ["waiter_id"],
        where: { cafe_id: cafeId, waiter_id: { in: waiterIds } },
        _count: { _all: true },
      })
    : [];
  const countByWaiter = new Map(orderCounts.map((entry) => [entry.waiter_id, entry._count._all]));

  await writeAuditLog({
    userId: user?.id ?? null,
    action: "cafe.waiters.list",
    entityType: "cafe_staff",
    description: `Listed waiters for cafe ${cafeId}`,
    ipAddress,
  });

  return staff.map((entry) => ({
    id: entry.users.id,
    fullname: entry.users.fullname,
    employee_external_id: entry.users.employee_external_id,
    is_active: entry.users.is_active,
    assigned_at: entry.assigned_at,
    total_orders: countByWaiter.get(entry.user_id) ?? 0,
  }));
};

export const getCafeFeedback = async (user, pagination, ipAddress = null) => {
  const cafeId = resolveCafeId(user);
  const where = { cafe_id: cafeId };

  const [items, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      include: {
        users: {
          select: { id: true, fullname: true, employee_external_id: true },
        },
      },
      orderBy: { created_at: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.feedback.count({ where }),
  ]);

  await writeAuditLog({
    userId: user?.id ?? null,
    action: "cafe.feedback.list",
    entityType: "feedback",
    description: `Listed feedback for cafe ${cafeId}`,
    ipAddress,
  });

  return {
    items,
    total,
    page: pagination.page,
    limit: pagination.limit,
    total_pages: Math.ceil(total / pagination.limit),
  };
};

const buildCafeOrderWhere = (dateRange) => {
  const params = [];
  let whereSql = "o.cafe_id = $1 AND o.status::text = ANY($2)";

  params.push(null, COUNTABLE_ORDER_STATUSES);

  if (dateRange) {
    whereSql += " AND o.created_at >= $3 AND o.created_at < $4";
    params.push(dateRange.monthStart, dateRange.monthEnd);
  }

  return { whereSql, params };
};

const runCafeAnalyticsQuery = (cafeId, dateRange, sqlFactory) => {
  const { whereSql, params } = buildCafeOrderWhere(dateRange);
  params[0] = cafeId;
  return prisma.$queryRawUnsafe(sqlFactory(whereSql), ...params);
};

const toNumber = (value) => Number(value ?? 0);

export const getCafeStatistics = async (user, dateRange = null, ipAddress = null) => {
  const cafeId = resolveCafeId(user);

  const [
    summaryRows,
    dailyOrders,
    monthlyRevenue,
    employeeUsage,
    waiterPerformance,
    popularMenuItems,
    peakOrderingHours,
  ] = await Promise.all([
    runCafeAnalyticsQuery(
      cafeId,
      dateRange,
      (whereSql) => `
        SELECT COUNT(*)::int AS total_orders,
               COALESCE(SUM(o.total_amount), 0)::double precision AS total_sales
        FROM orders o
        WHERE ${whereSql}
      `,
    ),
    runCafeAnalyticsQuery(
      cafeId,
      dateRange,
      (whereSql) => `
        SELECT to_char(o.created_at::date, 'YYYY-MM-DD') AS date,
               COUNT(*)::int AS count
        FROM orders o
        WHERE ${whereSql}
        GROUP BY o.created_at::date
        ORDER BY o.created_at::date ASC
      `,
    ),
    runCafeAnalyticsQuery(
      cafeId,
      dateRange,
      (whereSql) => `
        SELECT to_char(date_trunc('month', o.created_at), 'YYYY-MM') AS month,
               COALESCE(SUM(o.total_amount), 0)::double precision AS revenue
        FROM orders o
        WHERE ${whereSql}
        GROUP BY date_trunc('month', o.created_at)
        ORDER BY date_trunc('month', o.created_at) ASC
      `,
    ),
    runCafeAnalyticsQuery(
      cafeId,
      dateRange,
      (whereSql) => `
        SELECT COALESCE(u.employee_external_id, o.employee_id::text) AS employee_id,
               u.fullname AS employee_name,
               COUNT(*)::int AS total_orders,
               COALESCE(SUM(o.total_amount), 0)::double precision AS total_amount
        FROM orders o
        JOIN users u ON u.id = o.employee_id
        WHERE ${whereSql}
        GROUP BY o.employee_id, u.employee_external_id, u.fullname
        ORDER BY total_amount DESC
        LIMIT 100
      `,
    ),
    runCafeAnalyticsQuery(
      cafeId,
      dateRange,
      (whereSql) => `
        SELECT o.waiter_id,
               u.fullname AS waiter_name,
               COUNT(*)::int AS total_orders,
               COALESCE(SUM(o.total_amount), 0)::double precision AS total_sales
        FROM orders o
        JOIN users u ON u.id = o.waiter_id
        WHERE ${whereSql} AND o.waiter_id IS NOT NULL
        GROUP BY o.waiter_id, u.fullname
        ORDER BY total_orders DESC
        LIMIT 100
      `,
    ),
    runCafeAnalyticsQuery(
      cafeId,
      dateRange,
      (whereSql) => `
        SELECT oi.item_name_snapshot AS name,
               SUM(oi.quantity)::int AS total_quantity
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE ${whereSql}
        GROUP BY oi.item_name_snapshot
        ORDER BY total_quantity DESC
        LIMIT 20
      `,
    ),
    runCafeAnalyticsQuery(
      cafeId,
      dateRange,
      (whereSql) => `
        SELECT to_char(date_trunc('hour', o.created_at), 'HH24:00') AS hour,
               COUNT(*)::int AS count
        FROM orders o
        WHERE ${whereSql}
        GROUP BY date_trunc('hour', o.created_at)
        ORDER BY count DESC
        LIMIT 24
      `,
    ),
  ]);

  await writeAuditLog({
    userId: user?.id ?? null,
    action: "cafe.analytics.view",
    entityType: "orders",
    description: `Viewed analytics for cafe ${cafeId}`,
    ipAddress,
  });

  const summary = summaryRows[0] ?? { total_orders: 0, total_sales: 0 };
  const normalizedPopularItems = popularMenuItems.map((entry) => ({
    name: entry.name,
    total_quantity: toNumber(entry.total_quantity),
  }));

  return {
    total_orders: toNumber(summary.total_orders),
    total_sales: toNumber(summary.total_sales),
    transaction_volume: dailyOrders,
    most_ordered_item: normalizedPopularItems[0]
      ? {
          name: normalizedPopularItems[0].name,
          total_quantity: normalizedPopularItems[0].total_quantity,
        }
      : null,
    popular_menu_items: normalizedPopularItems,
    food_consumption_trends: normalizedPopularItems.map((entry) => ({
      food_name: entry.name,
      quantity: entry.total_quantity,
    })),
    daily_orders: dailyOrders,
    monthly_revenue: monthlyRevenue.map((entry) => ({
      month: entry.month,
      revenue: toNumber(entry.revenue),
    })),
    employee_usage: employeeUsage.map((entry) => ({
      employee_id: entry.employee_id,
      employee_name: entry.employee_name,
      total_orders: toNumber(entry.total_orders),
      total_amount: toNumber(entry.total_amount),
    })),
    waiter_performance: waiterPerformance.map((entry) => ({
      waiter_id: entry.waiter_id,
      waiter_name: entry.waiter_name,
      total_orders: toNumber(entry.total_orders),
      total_sales: toNumber(entry.total_sales),
    })),
    peak_ordering_hours: peakOrderingHours,
  };
};

const buildOperationalReportRows = (stats) => {
  const rows = [
    {
      metric: "summary",
      name: "Total",
      total_orders: stats.total_orders,
      total_sales: stats.total_sales,
      quantity: null,
      extra: "All countable orders",
    },
  ];

  if (stats.most_ordered_item) {
    rows.push({
      metric: "most_ordered_food",
      name: stats.most_ordered_item.name,
      total_orders: null,
      total_sales: null,
      quantity: stats.most_ordered_item.total_quantity,
      extra: "Top food by quantity",
    });
  }

  for (const waiter of stats.waiter_performance) {
    rows.push({
      metric: "waiter_performance",
      name: waiter.waiter_name,
      total_orders: waiter.total_orders,
      total_sales: waiter.total_sales,
      quantity: null,
      extra: `Waiter ID ${waiter.waiter_id}`,
    });
  }

  for (const employee of stats.employee_usage) {
    rows.push({
      metric: "employee_usage",
      name: employee.employee_name,
      total_orders: employee.total_orders,
      total_sales: employee.total_amount,
      quantity: null,
      extra: `Employee ID ${employee.employee_id}`,
    });
  }

  for (const hour of stats.peak_ordering_hours) {
    rows.push({
      metric: "peak_ordering_hour",
      name: hour.hour,
      total_orders: hour.count,
      total_sales: null,
      quantity: null,
      extra: "UTC hour",
    });
  }

  return rows;
};

export const getOperationalReport = async (user, params, ipAddress = null) => {
  const cafeId = resolveCafeId(user);
  const { monthStart, monthEnd, monthString } = parseMonth(params.month);
  const stats = await getCafeStatistics({ ...user, cafeId }, { monthStart, monthEnd }, ipAddress);

  const rows = buildOperationalReportRows(stats);

  await writeAuditLog({
    userId: user?.id ?? null,
    action: "cafe.report.operational",
    entityType: "orders",
    description: `Generated ${params.format} operational report for cafe ${cafeId} and ${monthString}`,
    ipAddress,
  });

  if (params.format === "csv") {
    return {
      format: "csv",
      data: generateCsv(rows),
      fileName: `cafe-operational-report-${monthString}.csv`,
    };
  }

  if (params.format === "xlsx") {
    return {
      format: "xlsx",
      data: await generateExcel(rows),
      fileName: `cafe-operational-report-${monthString}.xlsx`,
    };
  }

  if (params.format === "pdf") {
    return {
      format: "pdf",
      data: await generatePdf(rows, `Cafe Operational Report - ${monthString}`),
      fileName: `cafe-operational-report-${monthString}.pdf`,
    };
  }

  return {
    format: "json",
    data: {
      month: monthString,
      metrics: rows,
    },
  };
};
