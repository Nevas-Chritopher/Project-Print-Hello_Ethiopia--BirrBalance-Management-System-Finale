# ESROM BirrBalance — Backend API

> For the full project overview (architecture, all portals, tech stack, data flows), see the [root README](../README.md).

Backend REST API for the ESROM BirrBalance Management System. This system manages employee meal balances, cafeteria transactions, and financial reporting between a company and its partnered cafés.

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **ORM:** Prisma
- **Database:** PostgreSQL
- **Authentication:** JWT (JSON Web Tokens)
- **Password Hashing:** bcrypt
- **QR Encryption:** AES (crypto)
- **File Uploads:** Multer
- **Reports:** ExcelJS, PDFKit, csv-stringify
- **Scheduler:** node-cron

## System Users

| Role            | Description                                   |
| --------------- | --------------------------------------------- |
| Employee        | Views balance, places orders, leaves comments |
| Waiter          | Scans QR codes and processes offline orders   |
| Café Manager    | Manages menus, images, and café statistics    |
| Company Manager | Manages employees, allocations, and reports   |

## Core Features

- JWT-based authentication with role guards
- Encrypted QR code generation per employee
- Online and offline (QR-assisted) ordering
- Monthly balance allocation and automatic expiry
- Ethiopian working-day allowance previews with restricted-day calendar markers
- Optional automatic monthly allowance calculation with manager approval before crediting
- Manager-authorized return of expired wallet balances with per-restoration expiration
- Custom Ethiopian allocation cycle dates with cycle-scoped ledger entries and reports
- Real-time password verification for offline orders
- Audit logging for every system action
- Notifications for low balance and new allocations
- Monthly reports exported as XLSX, PDF, and CSV
- Menu management with image uploads
- Employee comments and feedback system

## Project Structure

```
src/
├── config/        → DB connection, env validation, constants
├── middleware/    → Auth, role guard, audit logger
├── routes/        → One file per portal
├── controllers/   → Request handlers
├── services/      → Business logic
├── jobs/          → Cron jobs (balance expiry, allocation)
├── validators/    → Input validation
└── utils/         → Helpers (encryption, response, order ID)
```

## Getting Started

### Prerequisites

- Node.js v18+
- MySQL
- Git

### Installation

```bash
git https://github.com/eyoba146/esrom-birr-backend.git
cd esrom-birr-backend
npm install
```

### Environment Setup

Create a local `.env` from the example, then set `DATABASE_URL` to your PostgreSQL
connection string. Keep `.env` out of version control; do not use example credentials
for a shared or production database.

```powershell
Copy-Item .env.example .env
```

Set the required `JWT_SECRET` and `AES_SECRET` values in `.env` as well. Prisma CLI
commands read this file from the `backend/` directory.

### Change the QR Code Destination

When the computer's IP address changes, edit `WAITER_PANEL_URL` in
`backend/.env` (not the QR service source code). Set the host to the computer's
current IPv4 address from `ipconfig`, keeping the frontend port and path:

```env
WAITER_PANEL_URL=http://<computer-LAN-IP>:3000/waiter/panel
```

For example, replace `<computer-LAN-IP>` with the IPv4 address of the Wi-Fi or
Ethernet adapter that QR-scanning devices can reach. Restart the backend after
changing this value, then generate and print the QR codes again; previously
printed QR codes keep their old URL.

### Run in Development

```bash
npm run dev
```

### Run Migrations

```bash
npm run prisma:migrate
npm run prisma:generate
```

### Required Environment Variables

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: JWT signing secret, 32+ characters in production.
- `JWT_EXPIRES_IN`: Access token lifetime, defaults to `15m`.
- `REFRESH_TOKEN_EXPIRES_IN`: Refresh token lifetime, defaults to `30d`.
- `AES_SECRET`: QR encryption secret, 32+ characters in production.
- `CORS_ORIGIN`: Comma-separated allowed origins.
- `WAITER_PANEL_URL`: Absolute waiter-panel URL encoded into employee QR codes (for example, `http://<computer-LAN-IP>:3000/waiter/panel`). It must be reachable from devices that scan the QR code; set it explicitly in production.
- `PORT`: HTTP port, defaults to `5000`.

## Production API Notes

- Health checks: `GET /health`, `GET /health/ready`.
- Order lifecycle: `PATCH /api/orders/:id/status`, `PATCH /api/orders/:id/cancel`, `POST /api/orders/:id/refund`.
- Offline QR ordering now requires `qr_session_id` from `POST /api/waiter/scan`; sessions expire after 3 minutes and are one-time use.
- Employee feedback: `POST /api/employee/feedback`.
- Audit logs: `GET /api/audit-logs` for company managers with `page`, `limit`, `action`, `user_id`, `from`, and `to`.
- Employee orders and notifications support `page`, `limit`, and `sort`; default limit is 20 and max is 100.
- `GET /api/company-manager/balances/allowance-preview?month=2019-02` returns Ethiopian calendar days and the ETB 40-per-working-day allowance calculation. Weekends and confirmed public holidays are excluded.
- `PATCH /api/company-manager/balances/automatic-allocation` accepts `{ "enabled": true }` to prepare monthly approval requests automatically. Requests do not credit balances until a manager approves them with `POST /api/company-manager/balances/automatic-allocation/approvals/:id/approve`.
- Managers can also request a calculation for a month with `POST /api/company-manager/balances/automatic-allocation/approvals` and `{ "month": "2019-02" }`.
- Company managers can return expired balances to a department with `POST /api/company-manager/balances/restore-expired` and `{ "department_id": 1, "manager_password": "...", "additional_days": 5 }`. The password is verified against the manager's bcrypt hash and is not included in audit records.
- Allocation requests may include `ethiopian_cycle_start` (`YYYY/MM/DD`) and `cycle_label`. The start date must be in the requested Ethiopian reporting month; the cycle ends on that date in the following Ethiopian month. Omitting it retains the first-of-month cycle.
- Expired and restored balances are ledger tranches linked to their original allocation. The hourly expiry job also runs once at startup, and reports are recalculated from those transactions under the original allocation month.

## Schema Migration Notes

Migration `20260703120000_production_order_qr_ledger` adds:

- `qr_sessions` for one-time QR replay protection.
- `transaction_direction` enum and `balance_transactions.direction`.
- Backfill that converts old negative adjustments to positive debit entries.
- Additional notification types for order status, refunds, and feedback.

Migration `20261106000000_automatic_monthly_allocation_approval` adds the persisted optional monthly-allocation setting and manager approval queue. Migration `20261106010000_repair_monthly_allocation_tables` safely ensures those tables and their user references exist for databases where the earlier migration was not applied or the tables are missing. Both migrations are additive and preserve existing records. Apply migrations before starting the updated backend:

- `20261108000000_restorations_and_custom_cycles` adds custom allocation cycle dates and expired-balance restoration history.
- `20261108010000_restoration_tranche_tracking` links ledger entries to individual restored tranches so partial spending, refunds, and re-expiration remain allocation-scoped.
- `20261108020000_custom_cycle_date_constraint` prevents invalid cycle date ranges.
- `20261108030000_correct_legacy_cycle_end_dates` makes legacy monthly allocations use their Ethiopian calendar boundary fallback rather than a Gregorian month-end approximation.

```bash
npm run prisma:migrate
npm run prisma:generate
```

Deploy with:

```bash
npm run prisma:migrate
npm run prisma:generate
npm test
```

## API Test Artifacts

- Node API tests: `tests/api.test.js`.
- Postman collection: `docs/ESROM-BirrBalance.postman_collection.json`.

## Branching Strategy

| Branch              | Purpose                                 |
| ------------------- | --------------------------------------- |
| `main`              | Production-ready code only              |
| `dev`               | Integration branch — all PRs merge here |
| `feat/name/feature` | Individual feature branches             |

Never push directly to `main` or `dev`. Open a Pull Request.

## Team

- Eyob — Auth, QR flow, waiter portal, reports, employee portal, balance expiry
- Selam — Schema setup, café manager portal, company manager portal, notifications

## Status

In development.
