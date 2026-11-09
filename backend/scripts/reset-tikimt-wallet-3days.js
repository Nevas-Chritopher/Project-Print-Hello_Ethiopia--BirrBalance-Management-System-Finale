import prisma from "../src/config/db.js";
import { fileURLToPath } from "node:url";
import { getCurrentMonthRange, getEthiopianMonthRange } from "../src/utils/date.js";
import { getEmployeeBalances, getSpendableAllocations } from "../src/services/balance.service.js";
import { MAX_EXPIRED_BALANCE_RESTORATION_ETB } from "../src/utils/restoration.js";

const parseArgs = (argv) => {
  const options = { days: 3, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--days") options.days = Number(argv[index + 1] ?? options.days);
    if (arg === "--apply") options.apply = true;
  }
  return options;
};

const toMoney = (value) => Number(Number(value || 0).toFixed(2));

export const getTikimtGraceResetAmount = ({
  originalExpiredAmount,
  remainingUnusedAmount,
  maxAmount = MAX_EXPIRED_BALANCE_RESTORATION_ETB,
}) => {
  const originalAmount = Number(originalExpiredAmount ?? remainingUnusedAmount ?? 0) || 0;
  const limit = Number(maxAmount) || MAX_EXPIRED_BALANCE_RESTORATION_ETB;
  return Math.max(0, Math.min(limit, originalAmount));
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const now = new Date();
  const currentMonth = getCurrentMonthRange();
  const monthRange = getEthiopianMonthRange(currentMonth.month);
  const days = Math.max(1, Number(options.days) || 3);
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const activeEmployees = await prisma.users.findMany({
    where: { is_active: true, user_roles: { some: { roles: { name: "employee" } } } },
    select: { id: true },
  });
  const employeeIds = activeEmployees.map(({ id }) => id);
  const currentBalances = await getEmployeeBalances(employeeIds, prisma, now);

  const tikimtRestorations = await prisma.expired_balance_restorations.findMany({
    where: {
      original_expiration: {
        monthly_allocations: { allocation_month: monthRange.start },
      },
    },
    select: { id: true, original_expiration_transaction_id: true },
  });
  const tikimtRestorationIds = new Set(tikimtRestorations.map(({ id }) => id));
  const existingExpirationIds = new Set(
    tikimtRestorations.map(({ original_expiration_transaction_id }) => original_expiration_transaction_id),
  );

  const walletClears = [];
  let preservedTikimtBalance = 0;
  for (const employeeId of employeeIds) {
    const sources = await getSpendableAllocations(employeeId, prisma, now);
    for (const source of sources) {
      if (source.remaining <= 0) continue;
      if (source.restoration_id !== null && tikimtRestorationIds.has(source.restoration_id)) {
        preservedTikimtBalance += source.remaining;
        continue;
      }

      walletClears.push({
        employee_id: employeeId,
        allocation_id: source.allocation.id,
        restoration_id: source.restoration_id,
        amount: toMoney(source.remaining),
        reference_note: `Non-Tikimt wallet source cleared before Tikimt balance reconciliation`,
      });
    }
  }

  const pendingExpirations = await prisma.balance_transactions.findMany({
    where: {
      transaction_type: "expiration",
      direction: "debit",
      restoration_id: null,
      monthly_allocations: { allocation_month: monthRange.start },
      users: {
        is_active: true,
        user_roles: { some: { roles: { name: "employee" } } },
      },
    },
    orderBy: { created_at: "asc" },
    select: {
      id: true,
      user_id: true,
      allocation_id: true,
      amount: true,
      users: { select: { department_id: true } },
    },
  });

  const restorationPlan = pendingExpirations
    .map((expiration) => ({
      employee_id: expiration.user_id,
      allocation_id: expiration.allocation_id,
      amount: getTikimtGraceResetAmount({ originalExpiredAmount: expiration.amount }),
      expires_at: expiresAt,
      original_expiration_transaction_id: expiration.id,
      department_id: expiration.users?.department_id ?? null,
    }))
    .filter(({ amount }) => amount > 0);
  const targetExpirationIds = restorationPlan.map(({ original_expiration_transaction_id }) => original_expiration_transaction_id);

  const summary = {
    month: currentMonth.month,
    month_start: monthRange.start.toISOString(),
    days,
    expires_at: expiresAt.toISOString(),
    wallet_clear_count: walletClears.length,
    total_wallet_cleared: toMoney(walletClears.reduce((sum, item) => sum + item.amount, 0)),
    displayed_wallet_total_before_reset: toMoney([...currentBalances.values()].reduce((sum, amount) => sum + amount, 0)),
    tikimt_restorations_found: tikimtRestorations.length,
    tikimt_remaining_to_preserve: toMoney(preservedTikimtBalance),
    missing_tikimt_restorations: restorationPlan.filter(
      (item) => !existingExpirationIds.has(item.original_expiration_transaction_id),
    ).length,
    sample_wallet_clears: walletClears.slice(0, 10),
    sample_tikimt_restorations: restorationPlan.slice(0, 10),
  };

  if (!options.apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  for (const clear of walletClears) {
    await prisma.balance_transactions.create({
      data: {
        user_id: clear.employee_id,
        allocation_id: clear.allocation_id,
        restoration_id: clear.restoration_id,
        amount: clear.amount,
        direction: "debit",
        transaction_type: "adjustment",
        reference_note: clear.reference_note,
      },
    });
  }

  await prisma.expired_balance_restorations.updateMany({
    where: {
      status: "active",
      id: { notIn: tikimtRestorations.length ? [...tikimtRestorationIds] : [-1] },
    },
    data: { status: "expired" },
  });

  for (const item of restorationPlan) {
    const existing = await prisma.expired_balance_restorations.findUnique({
      where: { original_expiration_transaction_id: item.original_expiration_transaction_id },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    const restoration = await prisma.expired_balance_restorations.create({
      data: {
        allocation_id: item.allocation_id,
        employee_id: item.employee_id,
        department_id: item.department_id,
        manager_id: 1,
        original_expiration_transaction_id: item.original_expiration_transaction_id,
        original_expired_amount: item.amount,
        restored_amount: item.amount,
        expires_at: item.expires_at,
        status: "active",
      },
    });

    await prisma.balance_transactions.create({
      data: {
        user_id: item.employee_id,
        allocation_id: item.allocation_id,
        amount: item.amount,
        direction: "credit",
        transaction_type: "restoration",
        restoration_id: restoration.id,
        reference_note: `Tikimt expired balance restored for ${days} days`,
      },
    });
  }

  console.log(JSON.stringify({ ...summary, applied: true }, null, 2));
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
