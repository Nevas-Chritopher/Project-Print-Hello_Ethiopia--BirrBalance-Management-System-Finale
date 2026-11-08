import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateTransactionBalance, getSpendableAllocations } from "../src/services/balance.service.js";
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
