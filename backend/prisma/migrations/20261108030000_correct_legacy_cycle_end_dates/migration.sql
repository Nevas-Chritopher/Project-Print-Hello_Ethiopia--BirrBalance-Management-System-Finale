UPDATE "monthly_allocations"
SET "cycle_end_at" = NULL
WHERE "cycle_start_at" = "allocation_month"
  AND "cycle_end_at" = ("allocation_month" + INTERVAL '1 month')::date;

ALTER TABLE "monthly_allocations"
  VALIDATE CONSTRAINT "monthly_allocations_cycle_dates_valid";
