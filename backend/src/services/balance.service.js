import prisma from "../config/db.js";
import { getMonthRange } from "../utils/date.js";

export const getEmployeeCurrentMonthSummary = async (userId, tx = prisma) => {
  const { start, end } = getMonthRange();

  const allocation = await tx.monthly_allocations.findUnique({
    where: { user_id_allocation_month: { user_id: userId, allocation_month: start } },
  });

  if (!allocation) {
    return {
      allocated: 0,
      used: 0,
      remaining: 0,
      monthStart: start,
      monthEnd: end,
    };
  }

  const credits = await tx.balance_transactions.aggregate({
    where: {
      user_id: userId,
      created_at: { gte: start, lt: end },
      direction: "credit",
    },
    _sum: { amount: true },
  });

  const debits = await tx.balance_transactions.aggregate({
    where: {
      user_id: userId,
      created_at: { gte: start, lt: end },
      direction: "debit",
    },
    _sum: { amount: true },
  });

  const creditAmount = Number(credits._sum.amount ?? 0);
  const debitAmount = Number(debits._sum.amount ?? 0);

  return {
    allocated: Number(allocation.amount),
    used: debitAmount,
    remaining: Math.max(creditAmount - debitAmount, 0),
    monthStart: start,
    monthEnd: end,
  };
};

export const getEmployeeBalance = async (userId, tx = prisma) => {
  const summary = await getEmployeeCurrentMonthSummary(userId, tx);
  return summary.remaining;
};
