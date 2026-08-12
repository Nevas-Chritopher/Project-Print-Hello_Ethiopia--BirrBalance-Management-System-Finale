import 'dotenv/config';
import prisma from './src/config/db.js';
import bcrypt from 'bcrypt';

async function ensureRole(name) {
  let role = await prisma.roles.findUnique({ where: { name } });
  if (!role) {
    role = await prisma.roles.create({
      data: { name },
    });
    console.log(`Created missing role: ${name}`);
  }
  return role;
}

async function seedTestEmployee() {
  console.log('Seeding test employee...');

  const role = await ensureRole('employee');

  const existingUser = await prisma.users.findUnique({
    where: { employee_external_id: 'EMP-999' },
  });

  if (existingUser) {
    console.log('Test employee EMP-999 already exists. Skipping.');
    return;
  }

  const passwordHash = await bcrypt.hash('password123', 12);

  const employee = await prisma.users.create({
    data: {
      employee_external_id: 'EMP-999',
      fullname: 'Test Employee',
      email: 'test@example.com',
      phone_number: '+251999999999',
      password_hash: passwordHash,
      is_active: true,
      user_roles: {
        create: [
          { role_id: role.id },
        ],
      },
    },
  });

  console.log('Successfully created test employee:');
  console.log('- Employee ID: EMP-999');
  console.log('- Password: password123');
  console.log('- Full Name:', employee.fullname);
}

async function seedCompanyManager() {
  console.log('Seeding default company manager...');

  const role = await ensureRole('company_manager');

  const existingManager = await prisma.users.findUnique({
    where: { employee_external_id: 'MGR-001' },
  });

  if (existingManager) {
    console.log('Company manager MGR-001 already exists. Skipping.');
    return;
  }

  const passwordHash = await bcrypt.hash('ChangeMe123!', 12);

  const manager = await prisma.users.create({
    data: {
      employee_external_id: 'MGR-001',
      fullname: 'Company Manager',
      email: 'manager@example.com',
      phone_number: '+251900000001',
      password_hash: passwordHash,
      is_active: true,
      user_roles: {
        create: [
          { role_id: role.id },
        ],
      },
    },
  });

  console.log('Successfully created default company manager:');
  console.log('- Employee ID: MGR-001');
  console.log('- Password: ChangeMe123!');
  console.log('- Full Name:', manager.fullname);
}

async function main() {
  await seedTestEmployee();
  await seedCompanyManager();
}

main()
  .catch((e) => {
    console.error('Error seeding users:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
