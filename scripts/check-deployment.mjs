import { spawn } from "node:child_process";
import { resolve } from "node:path";

const REQUIRED_ENVIRONMENT_VARIABLES = [
  "DATABASE_URL",
  "DIRECT_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
];

function checkEnvironmentVariables() {
  const missing = REQUIRED_ENVIRONMENT_VARIABLES.filter(
    (name) => !process.env[name]?.trim(),
  );

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  console.log("Required deployment environment variables are present.");
}

async function checkPrismaClient() {
  try {
    const prisma = await import("@prisma/client");
    if (typeof prisma.PrismaClient !== "function") {
      throw new Error();
    }
  } catch {
    throw new Error("Prisma Client is not generated. Run `pnpm exec prisma generate`.");
  }

  console.log("Prisma Client is generated.");
}

async function checkMigrationStatus() {
  const prismaCli = resolve("node_modules/prisma/build/index.js");
  const child = spawn(process.execPath, [prismaCli, "migrate", "status"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "ignore",
  });

  const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });

  if (exitCode !== 0) {
    throw new Error(
      "Migration status check failed. Confirm the database connection and deploy pending migrations.",
    );
  }

  console.log("Database migration status is current.");
}

async function main() {
  checkEnvironmentVariables();
  await checkPrismaClient();
  await checkMigrationStatus();
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Deployment check failed.");
  process.exitCode = 1;
}
