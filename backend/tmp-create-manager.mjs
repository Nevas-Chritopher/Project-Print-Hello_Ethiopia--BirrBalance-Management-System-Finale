import 'dotenv/config';
import bcrypt from 'bcrypt';
import prisma from './src/config/db.js';

const employeeExternalId = 'Mgr-001---';
const password = 'ChangeMe123!';
const roleName = 'company_manager';

console.log('Using DB:', process.env.DATABASE_URL || process.env.DIRECT_URL);

try {
  let role = await prisma.roles.findUnique({ where: { name: roleName } });
  if (!role) {
    role = await prisma.roles.create({ data: { name: roleName } });
  }

  let user = await prisma.users.findUnique({ where: { employee_external_id: employeeExternalId } });
  const passwordHash = await bcrypt.hash(password, 12);

  if (!user) {
    user = await prisma.users.create({
      data: {
        employee_external_id: employeeExternalId,
        fullname: 'Company Manager',
        email: 'mgr001@example.com',
        password_hash: passwordHash,
        is_active: true,
      },
    });
  } else {
    user = await prisma.users.update({
      where: { id: user.id },
      data: {
        fullname: 'Company Manager',
        email: 'mgr001@example.com',
        password_hash: passwordHash,
        is_active: true,
      },
    });
  }

  await prisma.user_roles.upsert({
    where: { user_id_role_id: { user_id: user.id, role_id: role.id } },
    update: {},
    create: { user_id: user.id, role_id: role.id },
  });

  console.log(JSON.stringify({ employee_external_id: user.employee_external_id, role: role.name, status: 'created' }));
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
