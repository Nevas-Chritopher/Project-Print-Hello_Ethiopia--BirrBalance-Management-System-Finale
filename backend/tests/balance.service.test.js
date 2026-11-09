import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateTransactionBalance, getEmployeeBalances, getSpendableAllocations } from "../src/services/balance.service.js";
import { getTikimtGraceResetAmount } from "../scripts/reset-tikimt-wallet-3days.js";
import { capRestorationCandidate } from "../src/utils/restoration.js";
import { getEthiopianCycleRange } from "../src/utils/date.js";

test("spendable restoration balance is allocation-scoped and reflects partial spending", async () => {
  const expiredCycle = getEthiopianCycleRange("2019/03/04");
  const now = new Date(expiredCycle.endAt.getTime() + 24 * 60 * 60 * 1000);
  const restorationExpiresAt = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const allocation = {
    id: 8,
    user_id: 21,
    allocation_month: getEthiopianCycleRange("2019/03/01").start,
    amount: 100,
    cycle_start_at: expiredCycle.start,
    cycle_end_at: expiredCycle.end,
    expired_balance_restorations: [{ id: 14, expires_at: restorationExpiresAt }],
  };
  const transactions = [
    { allocation_id: 8, restoration_id: null, amount: 100, direction: "credit" },
    { allocation_id: 8, restoration_id: null, amount: 100, direction: "debit" },
    { allocation_id: 8, restoration_id: 14, amount: 100, direction: "credit" },
    { allocation_id: 8, restoration_id: 14, amount: 35, direction: "debit" },
  ];
  const tx = {
    monthly_allocations: { findMany: async () => [allocation] },
    balance_transactions: { findMany: async () => transactions },
  };

  const [spendable] = await getSpendableAllocations(21, tx, now);
  assert.equal(spendable.allocation.id, 8);
  assert.equal(spendable.restoration_id, 14);
  assert.equal(spendable.remaining, 65);

  allocation.expired_balance_restorations = [];
  assert.deepEqual(await getSpendableAllocations(21, tx, restorationExpiresAt), []);
});

test("re-expiration only debits the unused portion of a restored tranche", () => {
  assert.equal(calculateTransactionBalance([
    { amount: 100, direction: "credit" },
    { amount: 32.45, direction: "debit" },
    { amount: 12.55, direction: "debit" },
  ]), 55);
  assert.equal(calculateTransactionBalance([
    { amount: 55, direction: "credit" },
    { amount: 55, direction: "debit" },
  ]), 0);
});

test("expired balance restoration is capped at ETB 860 per employee and allocation month", () => {
  const restored = new Map();
  const first = capRestorationCandidate({ employee_key: "21:2019-03-10", amount: 1000 }, restored);
  const second = capRestorationCandidate({ employee_key: "21:2019-03-10", amount: 100 }, restored);
  const nextMonth = capRestorationCandidate({ employee_key: "21:2019-04-10", amount: 1000 }, restored);

  assert.equal(first.amount, 860);
  assert.equal(second, null);
  assert.equal(nextMonth.amount, 860);
});

test("expired balance restoration caps multiple allocations and subtracts earlier returns", () => {
  const restored = new Map([["21:2019-03-10", 700]]);
  const firstAllocation = capRestorationCandidate({ employee_key: "21:2019-03-10", amount: 200 }, restored);
  const secondAllocation = capRestorationCandidate({ employee_key: "21:2019-03-10", amount: 100 }, restored);

  assert.equal(firstAllocation.amount, 160);
  assert.equal(secondAllocation, null);
  assert.equal(restored.get("21:2019-03-10"), 860);
});

test("batched employee balances include restored money and cap legacy restoration overages", async () => {
  const cycle = getEthiopianCycleRange("2019/03/04");
  const now = new Date(cycle.endAt.getTime() + 24 * 60 * 60 * 1000);
  const allocation = {
    id: 8,
    user_id: 21,
    allocation_month: getEthiopianCycleRange("2019/03/01").start,
    amount: 1000,
    cycle_start_at: cycle.start,
    cycle_end_at: cycle.end,
    expired_balance_restorations: [{ id: 14, expires_at: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000) }],
  };
  const tx = {
    monthly_allocations: { findMany: async () => [allocation] },
    balance_transactions: { findMany: async () => [
      { allocation_id: 8, restoration_id: 14, amount: 1000, direction: "credit" },
    ] },
  };

  const balances = await getEmployeeBalances([21], tx, now);
  assert.equal(balances.get(21), 860);
});

test("employee wallet balances are capped at ETB 860 when the spendable total exceeds the limit", async () => {
  const cycle = getEthiopianCycleRange("2019/03/04");
  const now = new Date(cycle.start.getTime() + 5 * 24 * 60 * 60 * 1000);
  const allocation = {
    id: 8,
    user_id: 21,
    allocation_month: getEthiopianCycleRange("2019/03/01").start,
    amount: 1500,
    cycle_start_at: cycle.start,
    cycle_end_at: cycle.end,
    expired_balance_restorations: [],
  };
  const tx = {
    monthly_allocations: { findMany: async () => [allocation] },
    balance_transactions: { findMany: async () => [
      { allocation_id: 8, restoration_id: null, amount: 1200, direction: "credit" },
      { allocation_id: 8, restoration_id: null, amount: 200, direction: "debit" },
    ] },
  };

  const balances = await getEmployeeBalances([21], tx, now);
  assert.equal(balances.get(21), 860);
});

test("employee wallet reflects the true remaining balance after expired money is restored and partially spent", async () => {
  const cycle = getEthiopianCycleRange("2019/03/04");
  const now = new Date(cycle.start.getTime() + 5 * 24 * 60 * 60 * 1000);
  const allocation = {
    id: 8,
    user_id: 21,
    allocation_month: getEthiopianCycleRange("2019/03/01").start,
    amount: 860,
    cycle_start_at: cycle.start,
    cycle_end_at: cycle.end,
    expired_balance_restorations: [{ id: 14, expires_at: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000) }],
  };
  const tx = {
    monthly_allocations: { findMany: async () => [allocation] },
    balance_transactions: { findMany: async () => [
      { allocation_id: 8, restoration_id: null, amount: 860, direction: "credit" },
      { allocation_id: 8, restoration_id: null, amount: 240, direction: "debit" },
      { allocation_id: 8, restoration_id: 14, amount: 180, direction: "credit" },
    ] },
  };

  const balances = await getEmployeeBalances([21], tx, now);
  assert.equal(balances.get(21), 800);
});

test("Tikimt grace reset never reissues money when the recorded unused balance is zero", () => {
  assert.equal(getTikimtGraceResetAmount({
    originalExpiredAmount: 0,
    remainingUnusedAmount: 0,
    maxAmount: 860,
  }), 0);

  assert.equal(getTikimtGraceResetAmount({
    originalExpiredAmount: 210,
    remainingUnusedAmount: 0,
    maxAmount: 860,
  }), 210);
});
