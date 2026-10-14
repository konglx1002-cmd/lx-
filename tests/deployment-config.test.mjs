import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("pins the runtime and separates development and production migrations", async () => {
  const nodeVersion = (await readFile(".nvmrc", "utf8")).trim();
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.match(nodeVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(packageJson.packageManager, "pnpm@11.25.0");
  assert.equal(packageJson.scripts.build, "next build --webpack");
  assert.equal(packageJson.scripts["db:migrate:dev"], "prisma migrate dev");
  assert.equal(packageJson.scripts["db:migrate:deploy"], "prisma migrate deploy");
});

test("provides a production environment template without real credentials", async () => {
  const template = await readFile(".env.production.example", "utf8");
  const requiredVariables = [
    "DATABASE_URL",
    "DIRECT_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
  ];

  for (const variable of requiredVariables) {
    assert.match(template, new RegExp(`^${variable}=`, "m"));
  }

  assert.match(template, /APP_USER:APP_PASSWORD@POOL_HOST/);
  assert.match(template, /MIGRATION_USER:MIGRATION_PASSWORD@DIRECT_HOST/);
  assert.match(template, /replace-with-a-production-secret/);
  assert.match(template, /https:\/\/your-domain\.example\.com/);
});
