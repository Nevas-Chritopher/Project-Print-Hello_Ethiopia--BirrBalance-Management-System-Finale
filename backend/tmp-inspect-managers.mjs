import dotenv from 'dotenv';
dotenv.config();
import prisma from './src/config/db.js';

(async () => {
  try {
    const managers = await prisma.users.findMany({
      where: {
        user_roles: { some: { roles: { name: 'company_manager' } } },
      },
      select: {
        id: true,
        employee_external_id: true,
        fullname: true,
        phone_number: true,
        is_active: true,
        password_hash: true,
        user_roles: { include: { roles: true } },
      },
    });
    console.log(JSON.stringify(managers, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
})();