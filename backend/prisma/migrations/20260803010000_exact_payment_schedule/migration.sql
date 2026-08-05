-- A payment schedule is for the exact date selected by the company manager.
-- Keep payout_day temporarily so rows created by the previous version remain valid.
ALTER TABLE "monthly_payment_schedules"
  ADD COLUMN "payment_date" DATE;

CREATE INDEX "monthly_payment_schedules_active_payment_date_idx"
  ON "monthly_payment_schedules"("is_active", "payment_date");
