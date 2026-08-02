import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding test employee...');
  
  // Create a default role if it doesn't exist
  let role = await prisma.roles.findUnique({ where: { name: 'employee' } });
  if (!role) {
    role = await prisma.roles.create({
      data: {
        name: 'employee',
        description: 'Standard employee role'
      }
    });
    console.log('Created missing role: employee');
  }

  // Check if test employee already exists
  const existingUser = await prisma.users.findUnique({
    where: { employee_external_id: 'EMP-999' }
  });

  if (existingUser) {
    console.log('Test employee EMP-999 already exists. Skipping.');
    return;
  }

  // Hash the password
  const passwordHash = await bcrypt.hash('password123', 12);

  // Create the user and assign the role
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
          { role_id: role.id }
        ]
      }
    }
  });

  console.log('Successfully created test employee:');
  console.log('- Employee ID: EMP-999');
  console.log('- Password: password123');
  console.log('- Full Name:', employee.fullname);
}

main()
  .catch((e) => {
    console.error('Error seeding employee:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
