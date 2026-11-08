ALTER TABLE "monthly_allocations"
  ADD COLUMN IF NOT EXISTS "cycle_start_at" DATE,
  ADD COLUMN IF NOT EXISTS "cycle_end_at" DATE,
  ADD COLUMN IF NOT EXISTS "cycle_label" VARCHAR(150);

ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'restoration';

CREATE INDEX IF NOT EXISTS "idx_allocations_cycle_dates"
  ON "monthly_allocations" ("cycle_start_at", "cycle_end_at");

CREATE TABLE IF NOT EXISTS "expired_balance_restorations" (
  "id" SERIAL PRIMARY KEY,
  "allocation_id" INTEGER NOT NULL REFERENCES "monthly_allocations"("id") ON DELETE RESTRICT,
  "employee_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "department_id" INTEGER REFERENCES "departments"("id") ON DELETE SET NULL,
  "manager_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "original_expiration_transaction_id" INTEGER NOT NULL UNIQUE REFERENCES "balance_transactions"("id") ON DELETE RESTRICT,
  "reexpiration_transaction_id" INTEGER UNIQUE REFERENCES "balance_transactions"("id") ON DELETE SET NULL,
  "original_expired_amount" DECIMAL(10,2) NOT NULL,
  "restored_amount" DECIMAL(10,2) NOT NULL,
  "restored_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(6) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restoration_positive_amounts" CHECK ("original_expired_amount" > 0 AND "restored_amount" > 0),
  CONSTRAINT "restoration_status_valid" CHECK ("status" IN ('active', 'expired'))
);

CREATE INDEX IF NOT EXISTS "idx_restorations_department_status" ON "expired_balance_restorations" ("department_id", "status");
CREATE INDEX IF NOT EXISTS "idx_restorations_expiry_status" ON "expired_balance_restorations" ("expires_at", "status");
CREATE INDEX IF NOT EXISTS "idx_restorations_allocation" ON "expired_balance_restorations" ("allocation_id");
