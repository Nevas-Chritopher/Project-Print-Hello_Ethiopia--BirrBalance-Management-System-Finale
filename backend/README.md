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

```bash
cp .env.example .env
```

Fill in your values in `.env` before running the server.

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
- `PORT`: HTTP port, defaults to `5000`.

## Production API Notes

- Health checks: `GET /health`, `GET /health/ready`.
- Order lifecycle: `PATCH /api/orders/:id/status`, `PATCH /api/orders/:id/cancel`, `POST /api/orders/:id/refund`.
- Offline QR ordering now requires `qr_session_id` from `POST /api/waiter/scan`; sessions expire after 3 minutes and are one-time use.
- Employee feedback: `POST /api/employee/feedback`.
- Audit logs: `GET /api/audit-logs` for company managers with `page`, `limit`, `action`, `user_id`, `from`, and `to`.
- Employee orders and notifications support `page`, `limit`, and `sort`; default limit is 20 and max is 100.

## Schema Migration Notes

Migration `20260703120000_production_order_qr_ledger` adds:

- `qr_sessions` for one-time QR replay protection.
- `transaction_direction` enum and `balance_transactions.direction`.
- Backfill that converts old negative adjustments to positive debit entries.
- Additional notification types for order status, refunds, and feedback.

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
