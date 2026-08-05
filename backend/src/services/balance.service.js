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

export const getEmployeeLedgerEntries = async (userId, tx = prisma) => {
  const allocations = await tx.monthly_allocations.findMany({
    where: { user_id: userId },
    orderBy: { allocation_month: "asc" },
    select: { id: true, allocation_month: true, amount: true },
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

  const ledgerEntries = [];

  allocations.forEach((allocation) => {
    ledgerEntries.push({
      id: `alloc-${allocation.id}`,
      date: allocation.allocation_month,
      type: "Credit",
      description: "Monthly allowance credited",
      orderId: "—",
      cafe: "—",
      amount: Number(allocation.amount),
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
