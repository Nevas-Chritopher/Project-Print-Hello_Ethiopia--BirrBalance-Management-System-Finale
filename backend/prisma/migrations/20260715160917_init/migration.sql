-- CreateEnum
CREATE TYPE "order_method" AS ENUM ('online', 'offline_qr');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "transaction_type" AS ENUM ('allocation', 'order', 'refund', 'adjustment', 'expiration');

-- CreateEnum
CREATE TYPE "transaction_direction" AS ENUM ('credit', 'debit');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('low_balance', 'allocation', 'order_confirmed', 'order_status', 'refund', 'feedback', 'password_reset');

-- CreateEnum
CREATE TYPE "role_name" AS ENUM ('employee', 'waiter', 'cafe_manager', 'company_manager');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100),
    "entity_id" INTEGER,
    "description" TEXT,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_transactions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "allocation_id" INTEGER,
    "amount" DECIMAL(10,2) NOT NULL,
    "direction" "transaction_direction" NOT NULL DEFAULT 'credit',
    "transaction_type" "transaction_type" NOT NULL,
    "reference_note" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cafe_staff" (
    "user_id" INTEGER NOT NULL,
    "cafe_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cafe_staff_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "cafes" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "location" VARCHAR(255),
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cafes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_qr_codes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "token_hash" TEXT NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(6),

    CONSTRAINT "employee_qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "cafe_id" INTEGER,
    "rating" INTEGER,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_history" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "ip_address" VARCHAR(45),
    "device_info" TEXT,
    "login_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" SERIAL NOT NULL,
    "cafe_id" INTEGER NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "image_url" TEXT,
    "is_available" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_allocations" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "allocation_month" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "allocated_by" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "message" TEXT NOT NULL,
    "type" "notification_type" NOT NULL,
    "is_read" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_sessions" (
    "id" SERIAL NOT NULL,
    "session_hash" VARCHAR(64) NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "waiter_id" INTEGER NOT NULL,
    "cafe_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "used_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "menu_item_id" INTEGER,
    "item_name_snapshot" VARCHAR(150) NOT NULL,
    "unit_price_snapshot" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "order_uuid" UUID DEFAULT gen_random_uuid(),
    "employee_id" INTEGER NOT NULL,
    "cafe_id" INTEGER NOT NULL,
    "waiter_id" INTEGER,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "status" "order_status" DEFAULT 'pending',
    "order_method" "order_method" NOT NULL,
    "completed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "otp_code" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "used_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" "role_name" NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "employee_external_id" VARCHAR(50),
    "fullname" VARCHAR(150) NOT NULL,
    "email" VARCHAR(150),
    "phone_number" VARCHAR(20) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "department_id" INTEGER,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_audit_logs_user_created_at" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_audit_logs_entity" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_created" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_transactions_user" ON "balance_transactions"("user_id");

-- CreateIndex
CREATE INDEX "idx_balance_transactions_user_created_at" ON "balance_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_balance_transactions_user_direction_created_at" ON "balance_transactions"("user_id", "direction", "created_at");

-- CreateIndex
CREATE INDEX "idx_transactions_allocation" ON "balance_transactions"("allocation_id");

-- CreateIndex
CREATE INDEX "idx_cafe_staff_cafe" ON "cafe_staff"("cafe_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employee_qr_codes_user_id_key" ON "employee_qr_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_qr_codes_token_hash_key" ON "employee_qr_codes"("token_hash");

-- CreateIndex
CREATE INDEX "idx_feedback_cafe_created_at" ON "feedback"("cafe_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_feedback_user_created_at" ON "feedback"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_menu_items_cafe_available" ON "menu_items"("cafe_id", "is_available");

-- CreateIndex
CREATE UNIQUE INDEX "unique_menu_item_name_per_cafe" ON "menu_items"("cafe_id", "name");

-- CreateIndex
CREATE INDEX "idx_allocations_user" ON "monthly_allocations"("user_id");

-- CreateIndex
CREATE INDEX "idx_allocations_month" ON "monthly_allocations"("allocation_month");

-- CreateIndex
CREATE INDEX "idx_allocations_allocated_by_created_at" ON "monthly_allocations"("allocated_by", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_month" ON "monthly_allocations"("user_id", "allocation_month");

-- CreateIndex
CREATE INDEX "idx_notifications_user" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "idx_notifications_user_read" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "idx_notifications_user_read_created_at" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "qr_sessions_session_hash_key" ON "qr_sessions"("session_hash");

-- CreateIndex
CREATE INDEX "idx_qr_sessions_employee_expires" ON "qr_sessions"("employee_id", "expires_at");

-- CreateIndex
CREATE INDEX "idx_qr_sessions_waiter_expires" ON "qr_sessions"("waiter_id", "expires_at");

-- CreateIndex
CREATE INDEX "idx_qr_sessions_used_expires" ON "qr_sessions"("used_at", "expires_at");

-- CreateIndex
CREATE INDEX "idx_order_items_order" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "idx_order_items_menu_item" ON "order_items"("menu_item_id");

-- CreateIndex
CREATE INDEX "idx_order_items_order_menu_item" ON "order_items"("order_id", "menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_uuid_key" ON "orders"("order_uuid");

-- CreateIndex
CREATE INDEX "idx_orders_cafe" ON "orders"("cafe_id");

-- CreateIndex
CREATE INDEX "idx_orders_cafe_status_created_at" ON "orders"("cafe_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "idx_orders_created" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "idx_orders_created_at_status" ON "orders"("created_at", "status");

-- CreateIndex
CREATE INDEX "idx_orders_employee" ON "orders"("employee_id");

-- CreateIndex
CREATE INDEX "idx_orders_employee_status_created_at" ON "orders"("employee_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "idx_orders_status" ON "orders"("status");

-- CreateIndex
CREATE INDEX "idx_orders_waiter_created_at" ON "orders"("waiter_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_password_reset_tokens_user" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_password_reset_tokens_expires" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_expires" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "idx_user_roles_role" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_external_id_key" ON "users"("employee_external_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE INDEX "idx_users_department" ON "users"("department_id");

-- CreateIndex
CREATE INDEX "idx_users_active" ON "users"("is_active");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "balance_transactions" ADD CONSTRAINT "balance_transactions_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "monthly_allocations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "balance_transactions" ADD CONSTRAINT "balance_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cafe_staff" ADD CONSTRAINT "cafe_staff_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cafe_staff" ADD CONSTRAINT "cafe_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_qr_codes" ADD CONSTRAINT "employee_qr_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "monthly_allocations" ADD CONSTRAINT "monthly_allocations_allocated_by_fkey" FOREIGN KEY ("allocated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "monthly_allocations" ADD CONSTRAINT "monthly_allocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "qr_sessions" ADD CONSTRAINT "qr_sessions_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "qr_sessions" ADD CONSTRAINT "qr_sessions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "qr_sessions" ADD CONSTRAINT "qr_sessions_waiter_id_fkey" FOREIGN KEY ("waiter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cafe_id_fkey" FOREIGN KEY ("cafe_id") REFERENCES "cafes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_waiter_id_fkey" FOREIGN KEY ("waiter_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
