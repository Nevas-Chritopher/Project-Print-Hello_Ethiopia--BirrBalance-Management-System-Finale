-- Legacy Gregorian October 2026 allocations were stored at 2026-10-01.
-- Tikimt 2019 starts on 2026-10-11. Move the allocation anchor so all related
-- ledger usage, expirations, and restorations appear in the Ethiopian report.
-- Transactions and restoration rows remain linked by allocation_id.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "monthly_allocations" AS legacy
    JOIN "monthly_allocations" AS tikimt
      ON tikimt."user_id" = legacy."user_id"
     AND tikimt."allocation_month" = DATE '2026-10-11'
    WHERE legacy."allocation_month" = DATE '2026-10-01'
  ) THEN
    RAISE EXCEPTION 'Cannot map legacy October 2026 allocations: one or more employees already have a Tikimt 2019 allocation';
  END IF;
END $$;

UPDATE "monthly_allocations"
SET "allocation_month" = DATE '2026-10-11'
WHERE "allocation_month" = DATE '2026-10-01';
