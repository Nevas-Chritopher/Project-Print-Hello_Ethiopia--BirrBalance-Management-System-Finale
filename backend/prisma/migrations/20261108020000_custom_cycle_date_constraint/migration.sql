DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'monthly_allocations_cycle_dates_valid'
          AND conrelid = '"monthly_allocations"'::regclass
    ) THEN
        ALTER TABLE "monthly_allocations"
            ADD CONSTRAINT "monthly_allocations_cycle_dates_valid"
            CHECK ("cycle_start_at" IS NULL OR "cycle_end_at" IS NULL OR "cycle_end_at" > "cycle_start_at")
            NOT VALID;
    END IF;
END $$;
