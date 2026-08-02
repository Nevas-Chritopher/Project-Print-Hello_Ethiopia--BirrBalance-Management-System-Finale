import cron from "node-cron";
import prisma from "../config/db.js";
import { writeAuditLog } from "../services/audit.service.js";

export const expireBalances = async () => {
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const allocations = await prisma.monthly_allocations.findMany({
    where: { allocation_month: { lt: currentMonthStart } },
  });

  for (const allocation of allocations) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock($1)", allocation.user_id);

      const existingExpiration = await tx.balance_transactions.findFirst({
        where: {
          allocation_id: allocation.id,
          transaction_type: "expiration",
        },
      });

      if (existingExpiration) return;

      const monthStart = allocation.allocation_month;
      const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
      const credits = await tx.balance_transactions.aggregate({
        where: {
          allocation_id: allocation.id,
          direction: "credit",
        },
        _sum: { amount: true },
      });
      const debits = await tx.balance_transactions.aggregate({
        where: {
          user_id: allocation.user_id,
          created_at: { gte: monthStart, lt: monthEnd },
          direction: "debit",
        },
        _sum: { amount: true },
      });

      const remaining = Number(credits._sum.amount ?? 0) - Number(debits._sum.amount ?? 0);
      if (remaining <= 0) return;

      const expiration = await tx.balance_transactions.create({
        data: {
          user_id: allocation.user_id,
          allocation_id: allocation.id,
          amount: Number(remaining.toFixed(2)),
          direction: "debit",
          transaction_type: "expiration",
          reference_note: "Unused monthly meal balance expired",
        },
      });

      await tx.notifications.create({
        data: {
          user_id: allocation.user_id,
          title: "Balance expired",
          message: `Your unused meal balance of ETB ${remaining.toFixed(2)} has expired.`,
          type: "allocation",
        },
      });

      await writeAuditLog(
        {
          userId: null,
          action: "balance.expire",
          entityType: "balance_transactions",
          entityId: expiration.id,
          description: `Expired ETB ${remaining.toFixed(2)} for allocation ${allocation.id}`,
        },
        tx,
      );
    });
  }
};

export const startExpireBalancesJob = () => {
  cron.schedule("15 0 1 * *", async () => {
    await expireBalances().catch((error) => {
      console.error("Balance expiry job error:", error);
    });
  });

  console.log("Balance expiry cron job scheduled.");
};
