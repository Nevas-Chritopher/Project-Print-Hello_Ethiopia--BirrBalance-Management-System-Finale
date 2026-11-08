import cron from "node-cron";
import prisma from "../config/db.js";
import { writeAuditLog } from "../services/audit.service.js";
import { calculateTransactionBalance } from "../services/balance.service.js";
import { getAddisAbabaDateParts, getCurrentMonthRange, getEthiopianMonthRange, gregorianToEthiopian } from "../utils/date.js";

const expireAllocation = async (allocation) => prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock($1)", allocation.user_id);

  const alreadyExpired = await tx.balance_transactions.findFirst({
    where: {
      allocation_id: allocation.id,
      restoration_id: null,
      transaction_type: "expiration",
      direction: "debit",
    },
  });
  if (alreadyExpired) return;

  const transactions = await tx.balance_transactions.findMany({
    where: { allocation_id: allocation.id, restoration_id: null },
    select: { amount: true, direction: true },
  });
  const remainingAmount = calculateTransactionBalance(transactions);
  if (remainingAmount <= 0) return;

  const amount = remainingAmount;
  const expiration = await tx.balance_transactions.create({
    data: {
      user_id: allocation.user_id,
      allocation_id: allocation.id,
      amount,
      direction: "debit",
      transaction_type: "expiration",
      reference_note: `Unused balance expired at the end of allocation cycle ${allocation.id}`,
    },
  });

  await tx.notifications.create({
    data: {
      user_id: allocation.user_id,
      title: "Balance expired",
      message: `Your unused meal balance of ETB ${amount.toFixed(2)} has expired.`,
      type: "allocation",
    },
  });
  await writeAuditLog({
    userId: null,
    action: "balance.expire",
    entityType: "balance_transactions",
    entityId: expiration.id,
    description: `Expired ETB ${amount.toFixed(2)} for allocation ${allocation.id}`,
  }, tx);
});

const expireRestoration = async (restorationId) => prisma.$transaction(async (tx) => {
  const restoration = await tx.expired_balance_restorations.findUnique({
    where: { id: restorationId },
    select: { id: true, employee_id: true, allocation_id: true, expires_at: true, status: true },
  });
  if (!restoration || restoration.status !== "active" || restoration.expires_at > new Date()) return;

  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock($1)", restoration.employee_id);
  const current = await tx.expired_balance_restorations.findUnique({
    where: { id: restorationId },
    select: { id: true, employee_id: true, allocation_id: true, expires_at: true, status: true },
  });
  if (!current || current.status !== "active" || current.expires_at > new Date()) return;

  const transactions = await tx.balance_transactions.findMany({
    where: { restoration_id: current.id },
    select: { amount: true, direction: true },
  });
  const remainingAmount = calculateTransactionBalance(transactions);
  let expiration = null;
  if (remainingAmount > 0) {
    expiration = await tx.balance_transactions.create({
      data: {
        user_id: current.employee_id,
        allocation_id: current.allocation_id,
        restoration_id: current.id,
        amount: remainingAmount,
        direction: "debit",
        transaction_type: "expiration",
        reference_note: `Unused restored balance expired (restoration ${current.id})`,
      },
    });
    await tx.notifications.create({
      data: {
        user_id: current.employee_id,
        title: "Restored balance expired",
        message: `Your unused restored meal balance of ETB ${remainingAmount.toFixed(2)} has expired.`,
        type: "allocation",
      },
    });
  }

  await tx.expired_balance_restorations.update({
    where: { id: current.id },
    data: { status: "expired", reexpiration_transaction_id: expiration?.id ?? null },
  });
  if (expiration) {
    await writeAuditLog({
      userId: null,
      action: "balance.restoration.expire",
      entityType: "balance_transactions",
      entityId: expiration.id,
      description: `Re-expired ETB ${remainingAmount.toFixed(2)} for restoration ${current.id}`,
    }, tx);
  }
});

export const expireBalances = async (now = new Date()) => {
  const { start: currentMonthStart } = getCurrentMonthRange();
  const addisDate = getAddisAbabaDateParts(now);
  const businessDate = new Date(Date.UTC(addisDate.year, addisDate.month - 1, addisDate.day));

  const allocations = await prisma.monthly_allocations.findMany({
    where: {
      OR: [
        { cycle_end_at: { lte: businessDate } },
        { cycle_end_at: null, allocation_month: { lt: currentMonthStart } },
      ],
    },
    select: { id: true, user_id: true, allocation_month: true, cycle_end_at: true },
  });
  for (const allocation of allocations) {
    const cycleEnd = allocation.cycle_end_at
      ?? getEthiopianMonthRange(gregorianToEthiopian(allocation.allocation_month)).end;
    if (cycleEnd.getTime() > businessDate.getTime()) continue;
    await expireAllocation(allocation);
  }

  const restorations = await prisma.expired_balance_restorations.findMany({
    where: { status: "active", expires_at: { lte: now } },
    select: { id: true },
  });
  for (const restoration of restorations) {
    await expireRestoration(restoration.id);
  }
};

export const startExpireBalancesJob = () => {
  cron.schedule("5 * * * *", () => {
    expireBalances().catch((error) => {
      console.error("Balance expiry job error:", error);
    });
  });

  expireBalances().catch((error) => {
    console.error("Initial balance expiry processing failed:", error);
  });
  console.log("Balance expiry cron job scheduled.");
};
