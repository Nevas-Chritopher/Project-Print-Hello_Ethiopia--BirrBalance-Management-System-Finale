import prisma from "../src/config/db.js";
import { getCurrentMonthRange, getEthiopianMonthRange } from "../src/utils/date.js";

const CORRECTION_NOTE = "Duplicate Tikimt restoration credit correction";
const DUPLICATE_NOTE = "Tikimt restoration reissued for 3 days";
const toMoney = (value) => Number(Number(value || 0).toFixed(2));

const main = async () => {
  const apply = process.argv.includes("--apply");
  const currentMonth = getCurrentMonthRange();
  const monthRange = getEthiopianMonthRange(currentMonth.month);
  const restorations = await prisma.expired_balance_restorations.findMany({
    where: { original_expiration: { monthly_allocations: { allocation_month: monthRange.start } } },
    select: {
      id: true,
      employee_id: true,
      allocation_id: true,
      restored_amount: true,
      transactions: {
        select: { amount: true, direction: true, transaction_type: true, reference_note: true },
      },
    },
  });

  const corrections = restorations.map((restoration) => {
    const duplicateCredits = restoration.transactions
      .filter(({ direction, reference_note }) => direction === "credit" && reference_note === DUPLICATE_NOTE)
      .reduce((sum, { amount }) => sum + Number(amount), 0);
    const alreadyCorrected = restoration.transactions
      .filter(({ direction, reference_note }) => direction === "debit" && reference_note === CORRECTION_NOTE)
      .reduce((sum, { amount }) => sum + Number(amount), 0);
    const amount = Math.max(0, toMoney(duplicateCredits - alreadyCorrected));

    return {
      restoration_id: restoration.id,
      employee_id: restoration.employee_id,
      allocation_id: restoration.allocation_id,
      amount,
    };
  }).filter(({ amount }) => amount > 0);

  const summary = {
    month: currentMonth.month,
    restoration_count: restorations.length,
    corrections_needed: corrections.length,
    total_duplicate_credit_to_reverse: toMoney(corrections.reduce((sum, item) => sum + item.amount, 0)),
    sample: corrections.slice(0, 15),
    applied: false,
  };

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  for (const correction of corrections) {
    await prisma.balance_transactions.create({
      data: {
        user_id: correction.employee_id,
        allocation_id: correction.allocation_id,
        restoration_id: correction.restoration_id,
        amount: correction.amount,
        direction: "debit",
        transaction_type: "adjustment",
        reference_note: CORRECTION_NOTE,
      },
    });
  }

  console.log(JSON.stringify({ ...summary, applied: true }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
