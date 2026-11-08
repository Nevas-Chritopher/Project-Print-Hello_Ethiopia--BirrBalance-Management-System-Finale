import prisma from "../config/db.js";
import { getAddisAbabaDateParts, getMonthRange, getEthiopianMonthRange, gregorianToEthiopian } from "../utils/date.js";

const ETHIOPIAN_MONTH_NAMES = ["Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit", "Megabit", "Miazia", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume"];
const formatEthiopianDate = (date) => {
  const { year, month, day } = gregorianToEthiopian(date);
  return `${day} ${ETHIOPIAN_MONTH_NAMES[month - 1]} ${year}`;
};

export const getAllocationBalance = async (allocationId, tx = prisma) => {
  const transactions = await tx.balance_transactions.findMany({
    where: { allocation_id: allocationId },
    select: { amount: true, direction: true },
  });
  // Aggregate cannot apply a sign in Prisma; keep this allocation-scoped so a
  // restored historical cycle can never borrow from a different cycle.
  return Number(transactions.reduce((sum, transaction) => sum + (transaction.direction === "credit" ? Number(transaction.amount) : -Number(transaction.amount)), 0).toFixed(2));
};

const toCents = (amount) => Math.round(Number(amount) * 100);
export const calculateTransactionBalance = (transactions) => Number((transactions.reduce(
  (sum, transaction) => sum + (transaction.direction === "credit" ? toCents(transaction.amount) : -toCents(transaction.amount)),
  0,
) / 100).toFixed(2));

export const getSpendableAllocations = async (userId, tx = prisma, now = new Date()) => {
  const addisDate = getAddisAbabaDateParts(now);
  const businessDate = Date.UTC(addisDate.year, addisDate.month - 1, addisDate.day);
  const { start: currentMonthStart } = getMonthRange();
  const allocations = await tx.monthly_allocations.findMany({
    where: {
      user_id: userId,
      OR: [
        { cycle_end_at: { gt: new Date(businessDate) } },
        { cycle_end_at: null, allocation_month: { gte: currentMonthStart } },
        { expired_balance_restorations: { some: { status: "active", expires_at: { gt: now } } } },
      ],
    },
    include: {
      expired_balance_restorations: {
        where: { status: "active", expires_at: { gt: now } },
        select: { id: true, expires_at: true },
      },
    },
    orderBy: { cycle_start_at: "desc" },
  });

  if (!allocations.length) return [];

  const transactions = await tx.balance_transactions.findMany({
    where: { allocation_id: { in: allocations.map((allocation) => allocation.id) } },
    select: { allocation_id: true, restoration_id: true, amount: true, direction: true },
  });
  const transactionsByAllocation = new Map();
  for (const transaction of transactions) {
    const bucket = transactionsByAllocation.get(transaction.allocation_id) ?? [];
    bucket.push(transaction);
    transactionsByAllocation.set(transaction.allocation_id, bucket);
  }

  const sources = [];
  for (const allocation of allocations) {
    const defaultCycle = getEthiopianMonthRange(gregorianToEthiopian(allocation.allocation_month));
    const cycleStart = allocation.cycle_start_at ?? defaultCycle.start;
    const cycleEnd = allocation.cycle_end_at ?? defaultCycle.end;
    const inOriginalCycle = cycleStart.getTime() <= businessDate && cycleEnd.getTime() > businessDate;
    const allocationTransactions = transactionsByAllocation.get(allocation.id) ?? [];

    if (inOriginalCycle) {
      const regularBalance = Math.round(calculateTransactionBalance(
        allocationTransactions.filter((transaction) => transaction.restoration_id === null),
      ) * 100);
      if (regularBalance > 0) {
        sources.push({
          allocation,
          restoration_id: null,
          remaining: regularBalance / 100,
          expires_at: cycleEnd,
        });
      }
    }

    for (const restoration of allocation.expired_balance_restorations) {
      const restorationBalance = Math.round(calculateTransactionBalance(
        allocationTransactions.filter((transaction) => transaction.restoration_id === restoration.id),
      ) * 100);
      if (restorationBalance > 0) {
        sources.push({
          allocation,
          restoration_id: restoration.id,
          remaining: restorationBalance / 100,
          expires_at: restoration.expires_at,
        });
      }
    }
  }

  return sources.sort((left, right) => left.expires_at.getTime() - right.expires_at.getTime());
};

export const getEmployeeCurrentMonthSummary = async (userId, tx = prisma) => {
  const { start, end, startAt, endAt } = getMonthRange();

  const allocation = await tx.monthly_allocations.findUnique({
    where: { user_id_allocation_month: { user_id: userId, allocation_month: start } },
  });
  const [debits, spendableSources] = await Promise.all([
    tx.balance_transactions.aggregate({
      where: { user_id: userId, created_at: { gte: startAt, lt: endAt }, direction: "debit" },
      _sum: { amount: true },
    }),
    getSpendableAllocations(userId, tx),
  ]);
  const debitAmount = Number(debits._sum.amount ?? 0);

  return {
    allocated: allocation ? Number(allocation.amount) : 0,
    used: debitAmount,
    remaining: Number(spendableSources.reduce((sum, source) => sum + source.remaining, 0).toFixed(2)),
    monthStart: start,
    monthEnd: end,
  };
};

export const getEmployeeBalance = async (userId, tx = prisma) => {
  const summary = await getEmployeeCurrentMonthSummary(userId, tx);
  return summary.remaining;
};

export const getEmployeeLedgerEntries = async (userId, tx = prisma) => {
  const allocations = await tx.monthly_allocations.findMany({
    where: { user_id: userId },
    orderBy: { allocation_month: "asc" },
    select: {
      id: true,
      allocation_month: true,
      amount: true,
      cycle_start_at: true,
      cycle_end_at: true,
      cycle_label: true,
    },
  });

  const transactions = await tx.balance_transactions.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "asc" },
    select: {
      id: true,
      amount: true,
      direction: true,
      transaction_type: true,
      reference_note: true,
      created_at: true,
      allocation_id: true,
      restoration_id: true,
    },
  });

  const orderUuids = transactions
    .map((transaction) => transaction.reference_note?.match(/Order ([a-z0-9-]+)/i)?.[1])
    .filter(Boolean);

  const orders = orderUuids.length
    ? await tx.orders.findMany({
        where: { employee_id: userId, order_uuid: { in: orderUuids } },
        select: {
          order_uuid: true,
          total_amount: true,
          created_at: true,
          cafes: { select: { name: true } },
          order_items: {
            select: {
              item_name_snapshot: true,
              quantity: true,
              unit_price_snapshot: true,
              menu_items: { select: { name: true } },
            },
          },
        },
      })
    : [];

  const ordersByUuid = new Map(orders.map((order) => [order.order_uuid, order]));
  const allocationsById = new Map(allocations.map((allocation) => [allocation.id, allocation]));

  const ledgerEntries = [];

  const allocationTransactions = new Set(
    transactions.filter((transaction) => transaction.transaction_type === "allocation").map((transaction) => transaction.allocation_id),
  );
  allocations.forEach((allocation) => {
    if (allocationTransactions.has(allocation.id)) return;
    ledgerEntries.push({
      id: `alloc-${allocation.id}`,
      date: allocation.cycle_start_at ?? allocation.allocation_month,
      type: "Credit",
      description: allocation.cycle_label || "Monthly allowance credited",
      orderId: "—",
      cafe: "—",
      amount: Number(allocation.amount),
      cycleStartDate: formatEthiopianDate(allocation.cycle_start_at ?? allocation.allocation_month),
      cycleEndDate: formatEthiopianDate(new Date((allocation.cycle_end_at ?? getEthiopianMonthRange(gregorianToEthiopian(allocation.allocation_month)).end).getTime() - 24 * 60 * 60 * 1000)),
      cycleLabel: allocation.cycle_label,
    });
  });

  transactions.forEach((transaction) => {
    const orderMatch = transaction.reference_note?.match(/Order ([a-z0-9-]+)/i)?.[1];
    const order = orderMatch ? ordersByUuid.get(orderMatch) : null;
    const normalizedType = transaction.transaction_type === "expiration"
      ? "Expiry"
      : transaction.direction === "debit"
        ? "Deduction"
        : "Credit";

    const description = order
      ? `Order from ${order.cafes?.name || "Main Corporate Cafe"}`
      : transaction.transaction_type === "allocation"
        ? "Monthly allowance credited"
        : transaction.transaction_type === "restoration"
          ? "Expired balance returned"
        : transaction.transaction_type === "adjustment"
          ? "Balance adjustment"
          : transaction.transaction_type === "refund"
            ? "Balance restored"
            : "Balance transaction";

    ledgerEntries.push({
      id: `txn-${transaction.id}`,
      date: transaction.created_at ?? new Date().toISOString(),
      type: normalizedType,
      description,
      orderId: order ? `#${order.order_uuid}` : "—",
      cafe: order?.cafes?.name || "—",
      amount: Number(transaction.amount),
      restorationId: transaction.restoration_id,
      cycleStartDate: allocationsById.has(transaction.allocation_id)
        ? formatEthiopianDate(allocationsById.get(transaction.allocation_id).cycle_start_at ?? allocationsById.get(transaction.allocation_id).allocation_month)
        : null,
      cycleEndDate: allocationsById.has(transaction.allocation_id)
        ? formatEthiopianDate(new Date((allocationsById.get(transaction.allocation_id).cycle_end_at ?? getEthiopianMonthRange(gregorianToEthiopian(allocationsById.get(transaction.allocation_id).allocation_month)).end).getTime() - 24 * 60 * 60 * 1000))
        : null,
      cycleLabel: allocationsById.get(transaction.allocation_id)?.cycle_label ?? null,
      orderDetails: order
        ? {
            items: (order.order_items || []).map((item) => ({
              name: item.item_name_snapshot || item.menu_items?.name || "Item",
              quantity: item.quantity,
              price: Number(item.unit_price_snapshot || 0),
            })),
            waiterName: "Staff",
            deliveryConfirmationTime: order.created_at ? new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
            totalAmount: Number(order.total_amount || 0),
          }
        : undefined,
      referenceNote: transaction.reference_note,
    });
  });

  ledgerEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let runningBalance = 0;
  return ledgerEntries.map((entry) => {
    if (entry.type === "Credit") {
      runningBalance += Number(entry.amount);
    } else if (entry.type === "Deduction" || entry.type === "Expiry") {
      runningBalance -= Number(entry.amount);
    }
    return {
      ...entry,
      balanceAfter: Number(runningBalance.toFixed(2)),
    };
  });
};
