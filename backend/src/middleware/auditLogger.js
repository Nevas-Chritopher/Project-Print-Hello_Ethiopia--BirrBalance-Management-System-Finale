import prisma from "../config/db.js";

export const auditLog = async ({
  actorId,
  actorRole,
  action,
  targetTable,
  targetId,
  metadata,
}) => {
  try {
    await prisma.audit_logs.create({
      data: {
        user_id: actorId || null,
        action,
        entity_type: targetTable || null,
        entity_id: targetId || null,
        description: metadata ? JSON.stringify(metadata) : null,
      },
    });
  } catch (error) {
    console.error("Audit log error:", error);
  }
};
