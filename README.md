 # Birr Balance Management System

A full-stack application to manage Birr balances, orders, payments, staff roles and reporting for cafes/restaurants.

## Key Features

- Role-based authentication (staff, managers) and authorization
- Balance tracking with expiration and scheduled jobs
- Order management and QR generation for payments
- Audit logging and notifications

## Tech Stack

- Backend: Node.js, Express, Prisma ORM
- Database: PostgreSQL (via Prisma)
- Frontend: React + TypeScript (Vite)

## Quick Start

1. Clone the repository:

```bash
git clone <repo-url>
cd Project-Print-Hello_Ethiopia--BirrBalance-Management-System-Finale
```

2. Start the backend (recommended):

```powershell
# Windows (provided script)
start-backend.bat
```

Or manually:

```bash
cd backend
npm install
npm run dev
```

3. Start the frontend (recommended):

```powershell
# Windows (provided script)
start-frontend.bat
```

Or manually:

```bash
cd frontend
npm install
npm run dev
```

## Important Files

- Backend entry: [backend/server.js](backend/server.js)
- Backend config: [backend/src/config/env.js](backend/src/config/env.js) and [backend/src/config/db.js](backend/src/config/db.js)
- Prisma schema & migrations: [backend/prisma/schema.prisma](backend/prisma/schema.prisma) and `backend/prisma/migrations/`
- Background jobs: `backend/src/jobs/` (e.g. `balanceExpiration.job.js`)
- Frontend entry: [frontend/src/main.tsx](frontend/src/main.tsx) and [frontend/src/App.tsx](frontend/src/App.tsx)
- Dev scripts: [start-backend.bat](start-backend.bat), [start-frontend.bat](start-frontend.bat)

## Configuration

The backend reads environment variables from `backend/src/config/env.js`. Typical variables to provide:

- `DATABASE_URL` — PostgreSQL connection string
- `PORT` — server port (default 3000)
- `JWT_SECRET` — secret for signing JWTs
- `NODE_ENV` — `development` / `production`

Check `backend/src/config/env.js` for the exact variable names used by the project.

## Database & Migrations

Use Prisma to manage the database migrations. From the `backend/` folder:

```bash
# Local development
npx prisma migrate dev

# Production deploy
npx prisma migrate deploy
```

Seed data is available in `backend/seed-employee.js` and other seed scripts.

## Testing

Backend tests live under `backend/tests/` (examples: `api.test.js`, `auth.service.test.js`). Run tests from the `backend/` folder with your test runner (e.g., `npm test`).

## Contributing

- Fork the repository and create a feature branch.
- Run linters and tests locally before opening a PR.
- Keep code consistent with existing patterns in `backend/src/` and `frontend/src/`.

## Notes for Maintainers

- Ensure scheduled jobs are running for balance expiration and monthly payments (`backend/src/jobs/`).
- Dev helpers: `backend/hashgen.js`, `backend/reset-password.js`, `backend/verify.js`.
- Local HTTPS cert helper for frontend: `frontend/scripts/create-local-https-cert.ps1`.

