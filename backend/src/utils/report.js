import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { stringify as stringifyStream } from "csv-stringify";

export const buildCsv = (rows, fields) => {
  return stringifyStream(rows, {
    header: true,
    columns: fields.map((field) => ({ key: field.key, header: field.header })),
  });
};

export const buildXlsx = async (rows, fields, sheetName) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = fields.map((field) => ({
    header: field.header,
    key: field.key,
    width: field.width || 24,
  }));
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };

  return workbook.xlsx.writeBuffer();
};

export const buildPdf = (rows, fields, title) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(15).text(title, { align: "center" });
    doc.moveDown();
    doc.fontSize(8);
    doc.text(fields.map((field) => field.header).join(" | "));
    doc.moveDown(0.5);

    for (const row of rows) {
      doc.text(fields.map((field) => row[field.key] ?? "").join(" | "));
      doc.moveDown(0.25);
    }

    doc.end();
  });
};

export const formatReportResponse = (report) => {
  if (report.format === "csv") {
    return {
      contentType: "text/csv",
      disposition: `attachment; filename="${report.fileName}"`,
    };
  }

  if (report.format === "xlsx") {
    return {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: `attachment; filename="${report.fileName}"`,
    };
  }

  return {
    contentType: "application/pdf",
    disposition: `attachment; filename="${report.fileName}"`,
  };
};

export const sendReportResponse = (res, report) => {
  const headers = formatReportResponse(report);
  res.setHeader("Content-Type", headers.contentType);
  res.setHeader("Content-Disposition", headers.disposition);

  if (typeof report.data?.pipe === "function") {
    return report.data.pipe(res);
  }

  return res.send(report.data);
};
