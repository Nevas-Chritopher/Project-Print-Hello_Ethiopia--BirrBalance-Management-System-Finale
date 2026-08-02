import jwt from "jsonwebtoken";
import prisma from "../config/db.js";
import env from "../config/env.js";
import { AppError } from "../utils/AppError.js";

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      throw new AppError("Authentication token is required", 401);
    }

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch (error) {
      return next(new AppError("Invalid or expired token", 401));
    }

    const user = await prisma.users.findUnique({
      where: { id: payload.id },
      include: {
        cafe_staff: true,
        user_roles: {
          include: { roles: true },
        },
      },
    });

    if (!user || !user.is_active) {
      throw new AppError("User is inactive or not found", 401);
    }

    req.user = {
      id: user.id,
      employee_external_id: user.employee_external_id,
      fullname: user.fullname,
      department_id: user.department_id,
      cafeId: user.cafe_staff?.cafe_id ?? null,
      roles: user.user_roles.map((userRole) => userRole.roles.name),
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    console.log("ROLE CHECK:", req.path, { userRoles: req.user?.roles, allowedRoles });
    const hasRole = req.user?.roles?.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      return next(new AppError("You are not authorized to access this resource", 403));
    }
    next();
  };
};
