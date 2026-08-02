import prisma from "../config/db.js";

export const writeAuditLog = async (
  {
    userId,
    action,
    entityType = null,
    entityId = null,
    description = null,
    ipAddress = null,
  },
  tx = prisma,
) => {
  return tx.audit_logs.create({
    data: {
      user_id: userId ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      description,
      ip_address: ipAddress,
    },
  });
};

export const listAuditLogs = async (filters, pagination) => {
  const where = {
    ...(filters.action ? { action: { contains: filters.action, mode: "insensitive" } } : {}),
    ...(filters.user_id ? { user_id: filters.user_id } : {}),
    ...(filters.from || filters.to
      ? {
          created_at: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.audit_logs.findMany({
      where,
      include: {
        users: {
          select: {
            id: true,
            employee_external_id: true,
            fullname: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.audit_logs.count({ where }),
  ]);

  return {
    items,
    total,
    page: pagination.page,
    limit: pagination.limit,
    total_pages: Math.ceil(total / pagination.limit),
  };
};
