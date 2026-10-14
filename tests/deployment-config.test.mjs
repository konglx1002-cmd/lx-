import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("pins the runtime and separates development and production migrations", async () => {
  const nodeVersion = (await readFile(".nvmrc", "utf8")).trim();
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const pnpmLock = await readFile("pnpm-lock.yaml", "utf8");

  assert.match(nodeVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(packageJson.packageManager, "pnpm@10.34.6");
  assert.match(pnpmLock, /^lockfileVersion: '9\.0'$/m);
  assert.equal(packageJson.scripts.build, "next build --webpack");
  assert.equal(packageJson.scripts.postinstall, "prisma generate");
  assert.equal(packageJson.scripts["test:deploy"], "node --test --test-concurrency=1");
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

test("uses a PostgreSQL schema and a PostgreSQL-only migration history", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf8");
  const migrationLock = await readFile("prisma/migrations/migration_lock.toml", "utf8");
  const initialMigration = await readFile(
    "prisma/migrations/20261014000000_postgresql_init/migration.sql",
    "utf8",
  );

  assert.match(schema, /provider\s+=\s+"postgresql"/);
  assert.match(schema, /directUrl\s+=\s+env\("DIRECT_URL"\)/);
  assert.match(migrationLock, /provider = "postgresql"/);
  assert.match(initialMigration, /TIMESTAMP\(3\)/);
  assert.doesNotMatch(initialMigration, /PRAGMA|DATETIME|new_Diary|new_User/);
});
