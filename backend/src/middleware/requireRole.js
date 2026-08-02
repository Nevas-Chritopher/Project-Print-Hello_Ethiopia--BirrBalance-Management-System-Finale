import { errorResponse } from "../utils/response.js";

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, "Access denied. Not authenticated", 401);
    }

    const hasRole = req.user.roles.some((role) => roles.includes(role));

    if (!hasRole) {
      return errorResponse(res, "Access denied. Insufficient permissions", 403);
    }

    next();
  };
};
