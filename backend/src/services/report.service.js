import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { stringify } from "csv-stringify/sync";
import prisma from "../config/db.js";

const getReportData = async (month, year) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const orders = await prisma.orders.findMany({
    where: {
      created_at: {
        gte: startDate,
        lt: endDate,
      },
    },
    include: {
      users_orders_employee_idTousers: {
        select: {
          fullname: true,
          employee_external_id: true,
          departments: { select: { name: true } },
        },
      },
      users_orders_waiter_idTousers: {
        select: { fullname: true },
      },
      order_items: {
        include: {
          menu_items: { select: { name: true } },
        },
      },
    },
    orderBy: { created_at: "asc" },
  });

  return orders.map((order) => ({
    employee_id: order.users_orders_employee_idTousers.employee_external_id,
    employee_name: order.users_orders_employee_idTousers.fullname,
    department:
      order.users_orders_employee_idTousers.departments?.name || "N/A",
    waiter_name: order.users_orders_waiter_idTousers?.fullname || "Online",
    food_ordered: order.order_items
      .map((i) => `${i.menu_items?.name} x${i.quantity}`)
      .join(", "),
    total_amount: Number(order.total_amount),
    date: order.created_at.toISOString().split("T")[0],
  }));
};

export const generateXLSX = async (month, year) => {
  const data = await getReportData(month, year);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Monthly Report");

  sheet.columns = [
    { header: "Employee ID", key: "employee_id", width: 15 },
    { header: "Employee Name", key: "employee_name", width: 25 },
    { header: "Department", key: "department", width: 20 },
    { header: "Waiter Name", key: "waiter_name", width: 20 },
    { header: "Food Ordered", key: "food_ordered", width: 40 },
    { header: "Total Amount", key: "total_amount", width: 15 },
    { header: "Date", key: "date", width: 15 },
  ];

  sheet.getRow(1).font = { bold: true };
  data.forEach((row) => sheet.addRow(row));

  return await workbook.xlsx.writeBuffer();
};

export const generateCSV = async (month, year) => {
  const data = await getReportData(month, year);

  const rows = data.map((row) => [
    row.employee_id,
    row.employee_name,
    row.department,
    row.waiter_name,
    row.food_ordered,
    row.total_amount,
    row.date,
  ]);

  return stringify([
    [
      "Employee ID",
      "Employee Name",
      "Department",
      "Waiter Name",
      "Food Ordered",
      "Total Amount",
      "Date",
    ],
    ...rows,
  ]);
};

export const generatePDF = async (month, year) => {
  const data = await getReportData(month, year);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30 });
    const buffers = [];

    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    doc
      .fontSize(16)
      .text(`Monthly Report — ${month}/${year}`, { align: "center" });
    doc.moveDown();

    data.forEach((row, i) => {
      doc
        .fontSize(10)
        .text(
          `${i + 1}. ${row.employee_name} (${row.employee_id}) | ${row.department} | ${row.food_ordered} | ${row.total_amount} ETB | ${row.date} | Waiter: ${row.waiter_name}`,
        );
      doc.moveDown(0.5);
    });

    doc.end();
  });
};
