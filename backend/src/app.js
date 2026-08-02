import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import env from "./config/env.js";
import routes from "./routes/index.js";
import { notFound, errorHandler } from "./middleware/error.middleware.js";
import { UPLOAD_ROOT } from "./middleware/upload.middleware.js";
import prisma from "./config/db.js";

const app = express();

const corsOptions = {
  origin: env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
    : false,
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
}));
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

const sanitizeInput = (value) => {
  if (Array.isArray(value)) return value.map(sanitizeInput);
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) {
        delete value[key];
      } else {
        value[key] = sanitizeInput(value[key]);
      }
    }
  }
  if (typeof value === "string") return value.trim();
  return value;
};

app.use((req, res, next) => {
  if (req.body && typeof req.body === "object") sanitizeInput(req.body);
  if (req.query && typeof req.query === "object") sanitizeInput(req.query);
  if (req.params && typeof req.params === "object") sanitizeInput(req.params);
  next();
});

app.use("/uploads", express.static(UPLOAD_ROOT));

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    database: "unchecked",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/health/ready", async (req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "ready",
      database: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("DB health check failed:", error);
    res.status(503).json({
      status: "not_ready",
      database: "error",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }
});

app.use("/api", routes);

app.get("/", (req, res) => {
  res.json({ message: "ESROM BirrBalance API is running" });
});

app.use(notFound);
app.use(errorHandler);

export default app;
