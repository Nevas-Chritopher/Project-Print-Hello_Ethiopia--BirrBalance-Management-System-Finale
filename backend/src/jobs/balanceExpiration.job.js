import cron from "node-cron";
import prisma from "../config/db.js";
import { getCurrentMonthRange, gregorianToEthiopian, getEthiopianMonthRange } from "../utils/date.js";

const expirePreviousMonthBalances = async () => {
  const { start: currentMonthStart } = getCurrentMonthRange();

  const allocations = await prisma.monthly_allocations.findMany({
    where: {
      allocation_month: { lt: currentMonthStart },
    },
  });

  for (const allocation of allocations) {
    const ethiopianMonth = gregorianToEthiopian(allocation.allocation_month);
    const { start: monthStart, end: monthEnd } = getEthiopianMonthRange(ethiopianMonth);

    const existingExpiration = await prisma.balance_transactions.findFirst({
      where: {
        allocation_id: allocation.id,
        transaction_type: "expiration",
      },
    });

    if (existingExpiration) continue;

    const credits = await prisma.balance_transactions.aggregate({
      where: {
        allocation_id: allocation.id,
        direction: "credit",
      },
      _sum: { amount: true },
    });

    const debits = await prisma.balance_transactions.aggregate({
      where: {
        user_id: allocation.user_id,
        created_at: { gte: monthStart, lt: monthEnd },
        direction: "debit",
      },
      _sum: { amount: true },
    });

    const remaining = Number(credits._sum.amount ?? 0) - Number(debits._sum.amount ?? 0);
    if (remaining <= 0) continue;

    await prisma.balance_transactions.create({
      data: {
        user_id: allocation.user_id,
        allocation_id: allocation.id,
        amount: remaining,
        direction: "debit",
        transaction_type: "expiration",
        reference_note: "Unused monthly meal balance expired",
      },
    });
  }
};

cron.schedule("15 0 1 * *", () => {
  expirePreviousMonthBalances().catch((error) => {
    console.error("Balance expiration job failed:", error);
  });
});

export { expirePreviousMonthBalances };
