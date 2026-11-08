ALTER TABLE "balance_transactions"
  ADD COLUMN IF NOT EXISTS "restoration_id" INTEGER;

CREATE INDEX IF NOT EXISTS "idx_balance_transactions_restoration"
  ON "balance_transactions" ("restoration_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'balance_transactions_restoration_id_fkey'
          AND conrelid = '"balance_transactions"'::regclass
    ) THEN
        ALTER TABLE "balance_transactions"
            ADD CONSTRAINT "balance_transactions_restoration_id_fkey"
            FOREIGN KEY ("restoration_id") REFERENCES "expired_balance_restorations"("id")
            ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
    END IF;
END $$;
