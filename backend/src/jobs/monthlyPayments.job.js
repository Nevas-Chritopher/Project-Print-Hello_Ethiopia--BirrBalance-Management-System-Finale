import cron from "node-cron";
import prisma from "../config/db.js";
import { assignMonthlyBalance } from "../services/company.service.js";

export const processMonthlyPayments = async () => {
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = today.getUTCDate();
  const schedules = await prisma.monthly_payment_schedules.findMany({
    where: {
      is_active: true,
      last_processed_month: { not: month },
      // payout_day keeps schedules created before payment_date was introduced working.
      OR: [{ payment_date: today }, { payment_date: null, payout_day: day }],
    },
  });

  for (const schedule of schedules) {
    const employees = await prisma.users.findMany({
      where: {
        is_active: true,
        ...(schedule.applies_to_all ? {} : { department_id: schedule.department_id }),
        user_roles: { some: { roles: { name: "employee" } } },
      },
      select: { id: true },
    });

    for (const employee of employees) {
      try {
        await assignMonthlyBalance({ id: schedule.created_by ?? null }, {
          user_id: employee.id,
          amount: Number(schedule.amount),
          month,
        }, null);
      } catch (error) {
        if (error?.statusCode !== 409) console.error("Monthly payment allocation failed:", error);
      }
    }

    await prisma.monthly_payment_schedules.update({
      where: { id: schedule.id },
      data: { last_processed_month: month, updated_at: new Date() },
    });
  }
};

export const startMonthlyPaymentsJob = () => {
  cron.schedule("5 0 * * *", () => {
    processMonthlyPayments().catch((error) => console.error("Monthly payment job failed:", error));
  });
  // Catch up a payment due today when the server starts after midnight.
  processMonthlyPayments().catch((error) => console.error("Initial monthly payment processing failed:", error));
  console.log("Monthly payment cron job scheduled.");
};
