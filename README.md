# ESROM BirrBalance Management System

**ESROM BirrBalance** is a **Progressive Web Application (PWA)** for managing **employee meal balances** (in Ethiopian Birr — ETB), **cafeteria ordering**, and **financial reporting** between a **company** and its **partner cafés**.

It replaces manual meal vouchers or cash handling with a digital balance ledger: the company allocates monthly meal credits to employees; employees spend them at partnered cafés via online orders or in-person QR scanning at the counter.

---

## Table of Contents

- [High-Level Architecture](#high-level-architecture)
- [Real-Time Communication](#real-time-communication)
- [Technology Stack](#technology-stack)
- [User Roles & Portals](#user-roles--portals)
- [Core Features](#core-features)
- [Database Schema](#database-schema)
- [Project Structure](#project-structure)
- [API Route Map](#api-route-map)
- [Data Flow Examples](#data-flow-examples)
- [Security Features](#security-features)
- [Getting Started](#getting-started)
- [CI/CD](#cicd)
- [Environment Variables](#environment-variables)
- [Team & Status](#team--status)

---

## High-Level Architecture

The project is a **monorepo** with two main parts:

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React SPA + PWA)                  │
│  Port 3000 — Vite dev server / Express production server        │
│  Role-based portals: Employee | Waiter | Café | Company Manager │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP REST (/api/*)
                             │ (proxied to backend in dev)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (Express REST API)                  │
│  Port 5000 — JWT auth, business logic, file uploads, cron jobs  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Prisma ORM
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              PostgreSQL (hosted on Supabase)                    │
│  Users, balances, orders, menus, audit logs, notifications    │
└─────────────────────────────────────────────────────────────────┘
```

### Architectural Style

| Layer | Pattern |
|-------|---------|
| **API** | REST over HTTP |
| **Auth** | Stateless JWT access tokens + rotating refresh tokens |
| **Data** | Relational PostgreSQL with Prisma ORM |
| **Frontend** | Single-page app (SPA) with client-side routing |
| **Real-time updates** | HTTP polling (~7 seconds for notifications) |
| **Offline** | Service Worker cache + localStorage queue for waiter orders |

---

## Real-Time Communication

This project does **not** use WebSockets, Socket.IO, or Server-Sent Events (SSE).

Instead:

- **REST API calls** (`fetch`) for all client–server communication
- **Polling** — the frontend polls `/api/notifications` and `/api/notifications/unread-count` every **7 seconds** when logged in
- **Offline sync** — when the waiter portal comes back online, queued orders are batch-synced via `POST /api/waiter/sync-orders`

---

## Technology Stack

### Backend (`/backend`)

| Category | Technology |
|----------|------------|
| **Runtime** | Node.js (ES modules) |
| **Framework** | Express.js 5 |
| **ORM** | Prisma 7 (`@prisma/adapter-pg`) |
| **Database** | PostgreSQL (Supabase with connection pooling) |
| **Authentication** | JWT (`jsonwebtoken`) + bcrypt password hashing |
| **Refresh tokens** | Hashed, stored in DB, rotated on use |
| **QR security** | AES encryption (`crypto-js`) + SHA-256 session hashing |
| **File uploads** | Multer (menu item images) |
| **Reports** | ExcelJS, PDFKit, csv-stringify |
| **Scheduled jobs** | node-cron (monthly balance expiry) |
| **Security** | Helmet, CORS, express-rate-limit, input sanitization |
| **Dev tooling** | tsx, dotenvx |

### Frontend (`/frontend`)

| Category | Technology |
|----------|------------|
| **UI framework** | React 19 + TypeScript |
| **Build tool** | Vite 6 |
| **Styling** | Tailwind CSS 4 |
| **Routing** | React Router DOM 7 |
| **Charts** | Recharts |
| **Icons / animation** | Lucide React, Motion |
| **i18n** | i18next + react-i18next (English & Amharic) |
| **QR** | `qrcode.react` (display), `html5-qrcode` (camera scan) |
| **Export** | jsPDF, xlsx, client-side CSV |
| **Dev server** | Express + Vite middleware + `http-proxy-middleware` → backend |
| **PWA** | Service Worker (`public/sw.js`) — network-first with cache fallback |
| **Theme** | Light/dark mode via React Context |

### Infrastructure

- Backend default: `http://localhost:5000`
- Frontend default: `http://localhost:3000` (proxies `/api` → backend)
- Database: PostgreSQL on **Supabase**
- Health endpoints: `GET /health`, `GET /health/ready`

---

## User Roles & Portals

The system has **4 role-based portals**, each with its own UI and API routes:

| Role | Frontend route | Backend API prefix | Responsibilities |
|------|----------------|-------------------|------------------|
| **Employee** | `/employee/*` | `/api/employee/*` | View balance, browse menus, place online orders, submit feedback, view transaction history, display QR code |
| **Waiter** | `/waiter/panel` | `/api/waiter/*` | Scan employee QR codes, verify password for offline orders, process in-café orders, sync offline queue |
| **Café Manager** | `/cafe/*` | `/api/cafe/*` | Manage menu items & images, view/update orders, manage waiters, analytics, operational reports, read feedback |
| **Company Manager** | `/manager/*` | `/api/company-manager/*` | Manage employees & departments, allocate monthly balances, view audit logs, financial/monthly reports, feedback reviews |

Access is enforced by **JWT authentication** + **role guards** on both frontend (`ProtectedRoute`) and backend (`requireRole` middleware).

---

## Core Features

### 1. Authentication & Security

- Login with employee ID + password
- JWT access tokens (default ~15 min) + refresh tokens (~30 days)
- Token refresh with single-flight deduplication (prevents race conditions)
- Password reset via OTP
- Login history tracking
- Full **audit logging** for system actions (`audit_logs` table)

### 2. Monthly Meal Balance System

- Company managers allocate a fixed ETB amount per employee per month
- Balance tracked via a **double-entry-style ledger** (`balance_transactions` with `credit` / `debit` direction)
- Transaction types: `allocation`, `order`, `refund`, `adjustment`, `expiration`
- **Automatic expiry** — unused balance from prior months expires via a cron job (runs 1st of each month at 00:15 UTC)
- Low-balance notifications

### 3. Ordering (Online & Offline)

**Online (employee portal):**

- Browse partnered cafés and menus
- Add items to cart and place orders
- Order debits employee balance atomically

**Offline / in-café (waiter portal):**

1. Waiter scans employee's encrypted QR code (`POST /api/waiter/scan`)
2. System creates a **one-time QR session** (expires in 3 minutes, single use — replay protection)
3. Employee enters password for verification
4. Waiter builds order from café menu
5. Order submitted with `qr_session_id` — balance debited

**Order lifecycle:** `pending` → `confirmed` → `preparing` → `ready` → `completed` (or `cancelled` / `refunded`)

### 4. QR Code System

- Each employee gets an **AES-encrypted QR token** (10-minute TTL)
- Token contains employee ID, nonce, and expiry
- **QR sessions** prevent replay attacks for offline ordering
- Camera-based scanning via `html5-qrcode` in the waiter UI

### 5. Café Management

- CRUD for menu items with image uploads
- Toggle item availability
- Order status management
- Waiter assignment
- Café analytics and operational reports

### 6. Notifications

- In-app notifications stored in DB
- Types: `low_balance`, `allocation`, `order_confirmed`, `order_status`, `refund`, `feedback`, `password_reset`
- Frontend polls every 7 seconds; mark read / clear all supported

### 7. Reporting & Exports

- **Company manager:** monthly reconciliation, financial reports
- **Café manager:** operational reports
- Export formats: **JSON, CSV, XLSX, PDF**

### 8. Feedback System

- Employees submit ratings/comments on cafés
- Company managers review feedback in the manager portal

### 9. Progressive Web App (PWA)

- Service Worker caches static assets
- Network-first strategy for API calls (authenticated APIs are not cached)
- Camera permission requested for QR scanning
- Offline queue for waiter orders with auto-sync when connectivity returns

### 10. Internationalization & UX

- **English** and **Amharic** (`en.json`, `am.json`)
- Light/dark theme toggle
- Responsive layout with mobile sidebar
- Dashboard charts (Recharts) for managers and cafés

---

## Database Schema

Key models:

```
users ──┬── user_roles ── roles
        ├── monthly_allocations
        ├── balance_transactions
        ├── orders ── order_items ── menu_items
        ├── employee_qr_codes
        ├── notifications
        ├── feedback
        ├── login_history
        ├── refresh_tokens
        └── audit_logs

cafes ──┬── menu_items
        ├── orders
        ├── cafe_staff
        ├── qr_sessions
        └── feedback

departments ── users
qr_sessions (one-time offline order sessions)
password_reset_tokens
```

**Enums:** `order_method` (online | offline_qr), `order_status`, `transaction_type`, `transaction_direction`, `notification_type`, `role_name`

---

## Project Structure

```
ESROM-BirrBalance-Management-System/
├── backend/
│   ├── server.js              # Entry point, starts cron jobs
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema
│   │   └── migrations/        # SQL migrations
│   ├── src/
│   │   ├── config/            # DB, env, constants
│   │   ├── middleware/        # Auth, roles, upload, error handling
│   │   ├── routes/            # One router per domain
│   │   ├── controllers/       # HTTP request handlers
│   │   ├── services/          # Business logic
│   │   ├── jobs/              # Cron (balance expiry)
│   │   ├── validators/        # Input validation
│   │   └── utils/             # Helpers (reports, encryption, responses)
│   └── tests/api.test.js      # Node native test runner
│
└── frontend/
    ├── server.ts              # Dev/prod Express server + API proxy
    ├── src/
    │   ├── App.tsx            # Routes & role-based layout
    │   ├── context/           # Auth, API client, cart, offline queue
    │   ├── pages/             # Login, Employee, Waiter, Café, Manager portals
    │   ├── components/        # Layout, charts
    │   ├── i18n/              # en.json, am.json
    │   └── utils/             # Formatting, export helpers
    └── public/sw.js           # Service Worker
```

---

## API Route Map

| Prefix | Domain |
|--------|--------|
| `/api/auth` | Login, logout, refresh, password reset |
| `/api/employee` | Profile, balance, orders, cafes, feedback, QR |
| `/api/waiter` | QR scan, employee lookup, offline orders, sync |
| `/api/orders` | Order status, cancel, refund |
| `/api/cafe` | Menu, orders, waiters, analytics, reports |
| `/api/company-manager` | Employees, departments, allocations |
| `/api/notifications` | List, unread count, mark read |
| `/api/audit-logs` | Audit trail (company managers) |
| `/api/reports` | Report generation |

See [backend/README.md](./backend/README.md) for detailed API notes and [backend/docs/ESROM-BirrBalance.postman_collection.json](./backend/docs/ESROM-BirrBalance.postman_collection.json) for the Postman collection.

---

## Data Flow Examples

### Online Order Flow

```
Employee → Browse menu → Add to cart → POST /api/employee/orders
    → Backend validates balance → Creates order + debits ledger
    → Notification sent → Employee sees updated balance
```

### Offline QR Order Flow

```
Employee shows QR → Waiter scans → POST /api/waiter/scan (creates qr_session)
    → Employee enters password → Waiter builds order
    → POST /api/waiter/order (with qr_session_id)
    → Session consumed (one-time) → Balance debited → Order created
```

### Notification Flow (Polling)

```
Backend creates notification in DB
    → Frontend polls GET /api/notifications every 7s
    → UI updates badge count and notification list
```

---

## Security Features

- JWT bearer authentication on protected routes
- Role-based access control (RBAC)
- bcrypt password hashing
- AES-encrypted QR tokens with expiry
- One-time QR sessions (3 min TTL, SHA-256 hashed)
- Refresh token rotation
- Rate limiting (1000 req / 15 min)
- Helmet security headers
- CORS origin whitelist
- Prototype pollution sanitization on request input
- PostgreSQL advisory locks for concurrent balance operations
- Comprehensive audit trail

---

## Getting Started

### Prerequisites

- Node.js v18+
- PostgreSQL (or Supabase)
- Git

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, AES_SECRET, etc.
npm run prisma:migrate
npm run prisma:generate
npm run dev            # starts on http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev            # starts on http://localhost:3000, proxies /api to backend
```

### Run Tests

```bash
cd backend
npm test
```

---

## CI/CD

This project uses **GitHub Actions** for automated CI/CD. Workflow files live in [`.github/workflows/`](./.github/workflows/).

| Workflow | File | Trigger | What it does |
|----------|------|---------|--------------|
| **CI** | `ci.yml` | Push or PR to `main` / `dev` | Backend tests + migration check; frontend type-check + build |
| **CD** | `cd.yml` | CI succeeds on `main`, or manual run | Packages production builds and uploads artifacts |

### What happens on every push / PR (CI)

1. GitHub spins up a fresh Ubuntu virtual machine
2. **Backend job** installs deps, generates Prisma client, applies migrations to a temporary PostgreSQL database, runs API tests
3. **Frontend job** installs deps, runs TypeScript check (`npm run lint`), runs production build (`npm run build`)
4. If any step fails, the workflow is marked ❌ and the PR is blocked from merging (if branch protection is enabled)

### What happens on `main` after CI passes (CD)

1. CD workflow starts automatically
2. Builds and packages backend + frontend for production
3. Uploads artifacts to GitHub (downloadable for 30 days from the Actions tab)
4. Optional deploy steps (commented out in `cd.yml`) can be enabled with GitHub Secrets

### View results on GitHub

1. Push your branch to GitHub
2. Open your repo → **Actions** tab
3. Click a workflow run to see logs for each step

### Manual deploy

**Actions** → **CD** → **Run workflow** → select `main` → **Run workflow**

### Enable live deployment later

1. **Settings** → **Secrets and variables** → **Actions**
2. Add secrets such as `RENDER_DEPLOY_HOOK_BACKEND` and `RENDER_DEPLOY_HOOK_FRONTEND`
3. Uncomment the deploy steps in [`.github/workflows/cd.yml`](./.github/workflows/cd.yml)

---

## Environment Variables

### Backend (`.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret (32+ chars in production) |
| `JWT_EXPIRES_IN` | Access token lifetime (default: `15m`) |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh token lifetime (default: `30d`) |
| `AES_SECRET` | QR encryption secret (32+ chars in production) |
| `CORS_ORIGIN` | Comma-separated allowed origins |
| `PORT` | HTTP port (default: `5000`) |

### Frontend (`.env.example`)

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Optional Gemini AI API key (AI Studio integration) |
| `APP_URL` | Hosted app URL for self-referential links |

---

## Team & Status

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code only |
| `dev` | Integration branch — all PRs merge here |
| `feat/name/feature` | Individual feature branches |

**Team:**

- **Eyob** — Auth, QR flow, waiter portal, reports, employee portal, balance expiry
- **Selam** — Schema setup, café manager portal, company manager portal, notifications

**Status:** In active development.

---

## Summary

| Aspect | Choice |
|--------|--------|
| **Type** | Enterprise meal balance & cafeteria management system |
| **Architecture** | REST API + React SPA (monorepo) |
| **Real-time** | HTTP polling (not WebSocket) |
| **Database** | PostgreSQL via Prisma |
| **Auth** | JWT + refresh tokens |
| **Offline support** | PWA + waiter order queue sync |
| **QR** | AES encryption + one-time sessions |
| **Reports** | CSV, XLSX, PDF |
| **Languages** | English, Amharic |
| **Currency** | Ethiopian Birr (ETB) |
# CI test
