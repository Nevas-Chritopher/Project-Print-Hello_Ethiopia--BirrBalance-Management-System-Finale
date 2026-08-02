// backend/verify.js
import bcrypt from "bcrypt";

const passwordToTest = "ChangeMe123!";
const storedHash = "PASTE_THE_HASH_FROM_STEP_1_HERE";

const result = await bcrypt.compare(passwordToTest, storedHash);
console.log("Match:", result);