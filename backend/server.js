import app from "./src/app.js";
import prisma from "./src/config/db.js";
import { startExpireBalancesJob } from "./src/jobs/expireBalances.job.js";
import { startMonthlyPaymentsJob } from "./src/jobs/monthlyPayments.job.js";

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startExpireBalancesJob();
  startMonthlyPaymentsJob();
});

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Keep process alive and log unexpected errors so the server doesn't
// abruptly exit when transient errors occur (e.g. DB timeouts).
process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  try {
    // Attempt a graceful shutdown; do not force exit immediately so
    // the process manager (or developer) can inspect logs and restart.
    await prisma.$disconnect();
  } catch (err) {
    console.error('Error during disconnect after unhandledRejection:', err);
  }
});

process.on('uncaughtException', async (err) => {
  console.error('Uncaught Exception thrown:', err);
  try {
    await prisma.$disconnect();
  } catch (e) {
    console.error('Error during disconnect after uncaughtException:', e);
  }
  // Re-throw after cleanup so the process manager can restart the service.
  process.exit(1);
});
