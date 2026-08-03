CREATE TABLE "monthly_payment_schedules" (
    "id" SERIAL NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payout_day" INTEGER NOT NULL,
    "department_id" INTEGER,
    "applies_to_all" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "last_processed_month" VARCHAR(7),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "monthly_payment_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "monthly_payment_schedules_payout_day_check" CHECK ("payout_day" BETWEEN 1 AND 31),
    CONSTRAINT "monthly_payment_schedules_scope_check" CHECK ("applies_to_all" OR "department_id" IS NOT NULL)
);

CREATE INDEX "monthly_payment_schedules_is_active_payout_day_idx" ON "monthly_payment_schedules"("is_active", "payout_day");
CREATE INDEX "monthly_payment_schedules_department_id_idx" ON "monthly_payment_schedules"("department_id");
ALTER TABLE "monthly_payment_schedules" ADD CONSTRAINT "monthly_payment_schedules_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
