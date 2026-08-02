// backend/hashgen.js
import bcrypt from "bcrypt";
const hash = await bcrypt.hash("ChangeMe123!", 10);
console.log(hash);