import prisma from './src/config/db.js';

const main = async () => {
  const employeeRole = await prisma.roles.findFirst({ where: { name: 'employee' } });

  if (!employeeRole) {
    console.log(JSON.stringify({ deleted: 0, remaining: 0, message: 'No employee role found' }));
    await prisma.$disconnect();
    return;
  }

  const employeeRows = await prisma.user_roles.findMany({
    where: { role_id: employeeRole.id },
    select: { user_id: true },
  });

  const ids = [...new Set(employeeRows.map((row) => row.user_id))];
  console.log(JSON.stringify({ before: ids.length }));

  for (const userId of ids) {
    await prisma.$transaction(async (tx) => {
      await tx.qr_sessions.deleteMany({
        where: { OR: [{ employee_id: userId }, { waiter_id: userId }] },
      });
      await tx.employee_qr_codes.deleteMany({ where: { user_id: userId } });
      await tx.order_items.deleteMany({
        where: {
          orders: {
            OR: [{ employee_id: userId }, { waiter_id: userId }],
          },
        },
      });
      await tx.orders.deleteMany({
        where: {
          OR: [{ employee_id: userId }, { waiter_id: userId }],
        },
      });
      await tx.balance_transactions.deleteMany({ where: { user_id: userId } });
      await tx.monthly_allocations.deleteMany({ where: { user_id: userId } });
      await tx.feedback.deleteMany({ where: { user_id: userId } });
      await tx.notifications.deleteMany({ where: { user_id: userId } });
      await tx.login_history.deleteMany({ where: { user_id: userId } });
      await tx.password_reset_tokens.deleteMany({ where: { user_id: userId } });
      await tx.refresh_tokens.deleteMany({ where: { user_id: userId } });
      await tx.cafe_staff.deleteMany({ where: { user_id: userId } });
      await tx.user_roles.deleteMany({ where: { user_id: userId } });
      await tx.audit_logs.deleteMany({ where: { user_id: userId } });
      await tx.users.delete({ where: { id: userId } });
    });
  }

  const remaining = await prisma.users.count({
    where: { user_roles: { some: { roles: { name: 'employee' } } } },
  });

  console.log(JSON.stringify({ deleted: ids.length, remaining }));
  await prisma.$disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
