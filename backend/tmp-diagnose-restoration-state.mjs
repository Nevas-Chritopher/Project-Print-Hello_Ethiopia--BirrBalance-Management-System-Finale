import "dotenv/config";
import prisma from "./src/config/db.js";
import { getSpendableAllocations } from "./src/services/balance.service.js";
const paths = [
  "http://localhost:5000/health",
  "http://localhost:5000/api/company-manager/balances/restore-expired/preview?department_id=all&month=2019-02",
  "http://localhost:3000/api/company-manager/balances/restore-expired/preview?department_id=all&month=2019-02",
];
try {
  const probes = [];
  for (const url of paths) {
    try {
      const response = await fetch(url);
      probes.push({ url: new URL(url).origin + new URL(url).pathname, status: response.status, body: (await response.text()).slice(0, 240) });
    } catch (error) { probes.push({ url, error: error.message }); }
  }
  const dbClock = await prisma.$queryRaw`SELECT NOW()::text AS database_now`;
  const restorationStats = await prisma.$queryRaw`
    WITH tranche AS (
      SELECT r.id, r.employee_id, r.status, r.expires_at,
             COALESCE(SUM(CASE WHEN bt.direction::text='credit' THEN bt.amount WHEN bt.direction::text='debit' THEN -bt.amount ELSE 0 END),0) AS remaining
      FROM expired_balance_restorations r
      LEFT JOIN balance_transactions bt ON bt.restoration_id = r.id
      JOIN monthly_allocations ma ON ma.id = r.allocation_id
      WHERE ma.allocation_month = DATE '2026-10-11'
      GROUP BY r.id
    )
    SELECT COUNT(*)::int AS restoration_count,
           COUNT(*) FILTER (WHERE status='active')::int AS active_status_count,
           COUNT(*) FILTER (WHERE status='active' AND expires_at > NOW())::int AS active_unexpired_count,
           COUNT(*) FILTER (WHERE status='active' AND expires_at <= NOW())::int AS active_past_expiry_count,
           COUNT(*) FILTER (WHERE status='active' AND expires_at > NOW() AND remaining > 0.00001)::int AS active_spendable_tranche_count,
           COALESCE(SUM(remaining) FILTER (WHERE status='active' AND expires_at > NOW()),0)::numeric(14,2) AS active_unexpired_balance
    FROM tranche`;
  const selected = [];
  for (const employeeId of ["6", "27"]) {
    const user = await prisma.users.findUnique({ where: { employee_external_id: employeeId }, select: { id: true } });
    const sources = await getSpendableAllocations(user.id);
    selected.push({ employeeId, balance: Number(sources.reduce((sum, source) => sum + source.remaining, 0).toFixed(2)), sources: sources.map((source) => ({ month: source.allocation.allocation_month.toISOString().slice(0,10), restorationId: source.restoration_id, remaining: source.remaining, expiresAt: source.expires_at.toISOString() })) });
  }
  console.log(JSON.stringify({runtime: {nodeNow: new Date().toISOString(), dbClock}, probes, restorationStats, selectedEmployees: selected}));
} finally { await prisma.$disconnect(); }
