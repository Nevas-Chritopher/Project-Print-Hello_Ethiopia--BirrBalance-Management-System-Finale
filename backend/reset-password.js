// backend/reset-password.js
import bcrypt from "bcrypt";
import prisma from "./src/config/db.js";

const newHash = await bcrypt.hash("ChangeMe123!", 10);

await prisma.users.update({
  where: { employee_external_id: "MGR-001" },
  data: { password_hash: newHash },
});

console.log("Password updated. New hash:", newHash);
await prisma.$disconnect();