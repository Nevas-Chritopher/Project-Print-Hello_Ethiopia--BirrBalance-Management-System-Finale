import { AppError } from "../utils/AppError.js";
import { removeUploadedFile } from "./upload.middleware.js";

export const notFound = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};

export const errorHandler = (error, req, res, next) => {
  let normalizedError = error;

  if (error?.type === "entity.parse.failed" || error instanceof SyntaxError) {
    normalizedError = new AppError("Request body contains invalid JSON", 400);
  }

  if (error?.code === "P2002") {
    const fields = Array.isArray(error.meta?.target) ? error.meta.target.join(", ") : "field";
    normalizedError = new AppError(`Duplicate value for ${fields}`, 409);
  }

  if (error?.code === "P2025") {
    normalizedError = new AppError("Resource not found", 404);
  }

  if (error?.code === "P2003") {
    normalizedError = new AppError("Referenced resource does not exist", 409);
  }

  if (error?.name === "MulterError") {
    normalizedError = new AppError(error.message, 400);
  }

  const statusCode = normalizedError.statusCode || 500;

  removeUploadedFile(req.file);

  if (statusCode >= 500) {
    console.error(error);
  }

  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? "Internal server error" : normalizedError.message,
    data: null,
  });
};
