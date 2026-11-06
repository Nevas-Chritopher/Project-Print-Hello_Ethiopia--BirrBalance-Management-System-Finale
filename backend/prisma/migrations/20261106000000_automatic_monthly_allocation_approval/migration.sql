CREATE TABLE IF NOT EXISTS monthly_allocation_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT monthly_allocation_settings_singleton CHECK (id = 1)
);

INSERT INTO monthly_allocation_settings (id, enabled)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS monthly_allocation_approvals (
  id SERIAL PRIMARY KEY,
  month VARCHAR(7) NOT NULL UNIQUE,
  amount DECIMAL(10, 2) NOT NULL,
  employee_count INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  allocated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  submitted_by INTEGER,
  approved_by INTEGER,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP(6)
);

CREATE INDEX IF NOT EXISTS idx_monthly_allocation_approvals_status_month
  ON monthly_allocation_approvals (status, month);
