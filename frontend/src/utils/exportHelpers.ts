import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// Export JSON data to Excel (.xlsx)
export function exportToExcel(data: any[], fileName: string, sheetName: string = 'Sheet1') {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

// Special Excel export formatted according to Monthly Report spec
export function exportMonthlyReportToExcel(reportData: any[], fileName: string) {
  // Map raw keys to the exact columns in the requested order
  const formattedData = reportData.map(item => {
    const remainingBalance = item.remainingBalance !== undefined ? item.remainingBalance : (item.balance !== undefined ? item.balance : 0);
    const amountUsed = item.amountUsed !== undefined ? item.amountUsed : (item.amount !== undefined ? item.amount : 0);
    const monthlyAllowance = item.monthlyAllowance || 1000;

    return {
      'Employee ID': item.employeeId,
      'Employee Name': item.employeeName,
      'Department': item.department,
      'Monthly Birr Allowance': Number(monthlyAllowance),
      'ETB Used': Number(amountUsed),
      'Remaining ETB': Number(remainingBalance),
      'Meal Details': item.foodOrdered || item.itemsDescription || 'Lunch Meal',
      'Date': item.date ? new Date(item.date).toLocaleDateString() : new Date().toLocaleDateString()
    };
  });

  const ws = XLSX.utils.json_to_sheet(formattedData);

  // Set dynamic column widths (fit-to-width)
  const colKeys = Object.keys(formattedData[0] || {});
  ws['!cols'] = colKeys.map(key => {
    const maxLen = Math.max(
      key.length,
      ...formattedData.map(row => {
        const val = row[key as keyof typeof row];
        return val !== undefined && val !== null ? val.toString().length : 0;
      })
    );
    return { wch: maxLen + 3 };
  });

  // Apply cell formatting (numeric formatting for Birr/ETB columns)
  // Columns: D (Monthly Birr Allowance), E (ETB Used), F (Remaining ETB)
  Object.keys(ws).forEach(cellRef => {
    if (cellRef.startsWith('!')) return;
    const colLetter = cellRef.match(/[A-Z]+/)?.[0];
    if (colLetter === 'D' || colLetter === 'E' || colLetter === 'F') {
      const cell = ws[cellRef];
      if (cell && cell.v !== undefined && !isNaN(Number(cell.v))) {
        cell.t = 'n';
        cell.z = '"ETB " #,##0.00';
      }
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reconciliation Report');
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

// Export JSON data to CSV
export function exportToCSV(data: any[], fileName: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${fileName}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function getFileNameFromContentDisposition(contentDisposition?: string | null, fallback: string = 'download') {
  if (!contentDisposition) return fallback;
  const match = /filename\*=UTF-8''([^;]+)|filename\s*=\s*"?([^";]+)"?/i.exec(contentDisposition);
  const fileName = match ? decodeURIComponent(match[1] || match[2] || '') : fallback;
  return fileName || fallback;
}

// Alias for backward compatibility
export const getFileNameFromDisposition = getFileNameFromContentDisposition;

export function downloadBlobFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Export to PDF using jsPDF and jspdf-autotable
export function exportToPDF(headers: string[], body: any[][], title: string, fileName: string) {
  const doc = new jsPDF('p', 'pt', 'a4');
  
  // Custom font size and styling
  doc.setFontSize(20);
  doc.setTextColor(10, 22, 40); // Dark Navy #0A1628
  doc.text(title, 40, 40);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // Subtle Text #64748B
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 40, 55);
  doc.text(`Hello_Ethiopia BirrBalance Management System`, 40, 70);
  
  // Draw divider line
  doc.setDrawColor(226, 232, 240);
  doc.line(40, 80, 550, 80);

  // AutoTable rendering
  (doc as any).autoTable({
    startY: 95,
    head: [headers],
    body: body,
    theme: 'striped',
    headStyles: {
      fillColor: [10, 22, 40], // Dark Navy
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold'
    },
    bodyStyles: {
      fontSize: 9
    },
    margin: { left: 40, right: 40 }
  });

  doc.save(`${fileName}.pdf`);
}
