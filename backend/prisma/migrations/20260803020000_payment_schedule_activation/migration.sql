ALTER TABLE monthly_payment_schedules
  ADD COLUMN IF NOT EXISTS activation_key_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP(6);
