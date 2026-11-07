CREATE TABLE IF NOT EXISTS "monthly_allocation_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "monthly_allocation_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "monthly_allocation_settings_singleton" CHECK ("id" = 1)
);

INSERT INTO "monthly_allocation_settings" ("id", "enabled")
VALUES (1, false)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "monthly_allocation_approvals" (
    "id" SERIAL NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "employee_count" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "allocated_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "submitted_by" INTEGER,
    "approved_by" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(6),
    CONSTRAINT "monthly_allocation_approvals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "monthly_allocation_approvals_month_key" UNIQUE ("month")
);

CREATE INDEX IF NOT EXISTS "monthly_allocation_approvals_status_month_idx"
    ON "monthly_allocation_approvals" ("status", "month");
CREATE INDEX IF NOT EXISTS "monthly_allocation_approvals_submitted_by_idx"
    ON "monthly_allocation_approvals" ("submitted_by");
CREATE INDEX IF NOT EXISTS "monthly_allocation_approvals_approved_by_idx"
    ON "monthly_allocation_approvals" ("approved_by");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'monthly_allocation_approvals_submitted_by_fkey'
          AND conrelid = '"monthly_allocation_approvals"'::regclass
    ) THEN
        ALTER TABLE "monthly_allocation_approvals"
            ADD CONSTRAINT "monthly_allocation_approvals_submitted_by_fkey"
            FOREIGN KEY ("submitted_by") REFERENCES "users"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'monthly_allocation_approvals_approved_by_fkey'
          AND conrelid = '"monthly_allocation_approvals"'::regclass
    ) THEN
        ALTER TABLE "monthly_allocation_approvals"
            ADD CONSTRAINT "monthly_allocation_approvals_approved_by_fkey"
            FOREIGN KEY ("approved_by") REFERENCES "users"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION NOT VALID;
    END IF;
END $$;
