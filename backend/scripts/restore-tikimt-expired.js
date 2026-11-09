import prisma from "../src/config/db.js";
import { getEmployeeBalances, getSpendableAllocations } from "../src/services/balance.service.js";
import { getEthiopianMonthRange, gregorianToEthiopian } from "../src/utils/date.js";

const parseArgs = (argv) => {
  const options = { days: 3, month: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--days") options.days = Number(argv[index + 1] ?? options.days);
    if (arg === "--month") options.month = argv[index + 1] ?? options.month;
    if (arg === "--dry-run") options.dryRun = true;
  }
  return options;
};

const toMoney = (amount) => Number(Number(amount || 0).toFixed(2));

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const now = new Date();
  const currentEthiopian = gregorianToEthiopian(now);
  const monthKey = options.month ?? `${currentEthiopian.year}/${currentEthiopian.month}`;
  const monthRange = getEthiopianMonthRange(monthKey);
  const days = Number(options.days) || 3;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const employees = await prisma.users.findMany({
    where: {
      is_active: true,
      user_roles: { some: { roles: { name: "employee" } } },
    },
    select: {
      id: true,
      department_id: true,
      fullname: true,
    },
  });

  const manager = await prisma.users.findFirst({
    where: { user_roles: { some: { roles: { name: "company_manager" } } } },
    select: { id: true, fullname: true },
  });

  if (!manager) {
    throw new Error("No company manager found to authorize the temporary restoration.");
  }

  const balances = await getEmployeeBalances(employees.map((employee) => employee.id), prisma, now);
  const walletClearings = [];

  for (const employee of employees) {
    const walletTotal = toMoney(balances.get(employee.id) ?? 0);
    if (walletTotal <= 0) continue;
    const sources = await getSpendableAllocations(employee.id, prisma, now);
    for (const source of sources) {
      const remaining = toMoney(source.remaining);
      if (remaining <= 0) continue;
      walletClearings.push({
        employee_id: employee.id,
        allocation_id: source.allocation.id,
        amount: remaining,
        reference_note: `Wallet cleared before ${days}-day Tikimt restoration (${monthKey})`,
      });
    }
  }

  const expirations = await prisma.balance_transactions.findMany({
    where: {
      transaction_type: "expiration",
      direction: "debit",
      restoration_id: null,
      monthly_allocations: {
        allocation_month: monthRange.start,
      },
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
      created_at: true,
      users: { select: { department_id: true, fullname: true } },
      monthly_allocations: { select: { allocation_month: true, cycle_label: true } },
    },
  });

  const restorationPlan = [];
  for (const expiration of expirations) {
    const existing = await prisma.expired_balance_restorations.findUnique({
      where: { original_expiration_transaction_id: expiration.id },
      select: { id: true },
    });
    if (existing) continue;
    const amount = toMoney(expiration.amount);
    if (amount <= 0) continue;
    restorationPlan.push({
      employee_id: expiration.user_id,
      allocation_id: expiration.allocation_id,
      amount,
      expires_at: expiresAt,
      note: `Tikimt expired balance restored for ${days} days (${monthKey})`,
      restoration_label: expiration.monthly_allocations?.cycle_label || `Tikimt ${monthKey}`,
      department_id: expiration.users.department_id ?? null,
      original_expiration_transaction_id: expiration.id,
    });
  }

  if (options.dryRun) {
    console.log(JSON.stringify({
      month: monthKey,
      days,
      expires_at: expiresAt.toISOString(),
      employee_wallets_cleared: walletClearings.length,
      total_wallet_cleared: toMoney(walletClearings.reduce((sum, entry) => sum + entry.amount, 0)),
      expired_restorations_to_create: restorationPlan.length,
      total_restored: toMoney(restorationPlan.reduce((sum, entry) => sum + entry.amount, 0)),
      preview: { walletClearings: walletClearings.slice(0, 10), restorationPlan: restorationPlan.slice(0, 10) },
    }, null, 2));
    return;
  }

  const results = [];
  for (const entry of walletClearings) {
    await prisma.balance_transactions.create({
      data: {
        user_id: entry.employee_id,
        allocation_id: entry.allocation_id,
        amount: entry.amount,
        direction: "debit",
        transaction_type: "adjustment",
        reference_note: entry.reference_note,
      },
    });
    results.push({ type: "wallet_clear", employee_id: entry.employee_id, allocation_id: entry.allocation_id, amount: entry.amount });
  }

  for (const entry of restorationPlan) {
    const restoration = await prisma.expired_balance_restorations.create({
      data: {
        allocation_id: entry.allocation_id,
        employee_id: entry.employee_id,
        department_id: entry.department_id,
        manager_id: manager.id,
        original_expiration_transaction_id: entry.original_expiration_transaction_id,
        original_expired_amount: entry.amount,
        restored_amount: entry.amount,
        expires_at: entry.expires_at,
        status: "active",
      },
    });

    await prisma.balance_transactions.create({
      data: {
        user_id: entry.employee_id,
        allocation_id: entry.allocation_id,
        amount: entry.amount,
        direction: "credit",
        transaction_type: "restoration",
        restoration_id: restoration.id,
        reference_note: entry.note,
      },
    });

    await prisma.notifications.create({
      data: {
        user_id: entry.employee_id,
        type: "allocation",
        title: "Expired balance restored",
        message: `ETB ${entry.amount.toFixed(2)} was returned to your meal wallet for ${days} days before expiring again.`,
      },
    });

    results.push({ type: "restoration", employee_id: entry.employee_id, allocation_id: entry.allocation_id, amount: entry.amount, expires_at: entry.expires_at.toISOString() });
  }

  console.log(JSON.stringify({
    month: monthKey,
    days,
    expires_at: expiresAt.toISOString(),
    manager: manager.fullname,
    wallet_clear_count: walletClearings.length,
    total_wallet_cleared: toMoney(walletClearings.reduce((sum, entry) => sum + entry.amount, 0)),
    restorations_created: restorationPlan.length,
    total_restored: toMoney(restorationPlan.reduce((sum, entry) => sum + entry.amount, 0)),
    results,
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
