import prisma from "../src/config/db.js";
import { getEmployeeBalances, getSpendableAllocations } from "../src/services/balance.service.js";

const main = async () => {
  const now = new Date();
  const employees = await prisma.users.findMany({
    where: { is_active: true, user_roles: { some: { roles: { name: "employee" } } } },
    select: { id: true },
  });
  const ids = employees.map(({ id }) => id);
  const balances = await getEmployeeBalances(ids, prisma, now);
  const report = [];

  for (const employeeId of ids) {
    if (balances.get(employeeId) !== 860) continue;
    const sources = await getSpendableAllocations(employeeId, prisma, now);
    report.push({
      employee_id: employeeId,
      balance: balances.get(employeeId),
      spendable_source_total: Number(sources.reduce((sum, source) => sum + source.remaining, 0).toFixed(2)),
      sources: sources.map((source) => ({
        allocation_id: source.allocation.id,
        allocation_month: source.allocation.allocation_month.toISOString().slice(0, 10),
        restoration_id: source.restoration_id,
        remaining: source.remaining,
        expiration: source.expires_at.toISOString(),
      })),
    });
  }
  console.log(JSON.stringify({ audited_at: now.toISOString(), displayed_860_count: report.length, employees: report.slice(0, 20) }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
