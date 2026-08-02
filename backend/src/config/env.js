import dotenv from "dotenv";
dotenv.config();

const env = {
  PORT: process.env.PORT || 5000,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "15m",
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
  AES_SECRET: process.env.AES_SECRET,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  NODE_ENV: process.env.NODE_ENV || "development",
};

const requiredVars = ["DATABASE_URL", "JWT_SECRET", "AES_SECRET"];

for (const key of requiredVars) {
  if (!env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

if (env.NODE_ENV === "production") {
  const weakSecrets = [
    ["JWT_SECRET", env.JWT_SECRET],
    ["AES_SECRET", env.AES_SECRET],
  ].filter(([, value]) => value.length < 32);

  if (weakSecrets.length) {
    console.error(`Production secrets must be at least 32 characters: ${weakSecrets.map(([key]) => key).join(", ")}`);
    process.exit(1);
  }
}

export default env;
