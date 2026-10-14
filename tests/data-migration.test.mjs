import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { hashPassword } from "better-auth/crypto";

import { createPostgresTestDatabase } from "./postgres-test-database.mjs";

const baseUrl = "http://127.0.0.1:3102";
const authSecret = "migration-test-secret-with-at-least-32-characters";

function runScript(script, env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [resolve(script)], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("error", rejectRun);
    child.once("exit", (exitCode) => {
      if (exitCode === 0) {
        resolveRun(output);
      } else {
        rejectRun(new Error(`${script} failed.\n${output}`));
      }
    });
  });
}

function insert(database, table, record) {
  const fields = Object.keys(record);
  const placeholders = fields.map(() => "?").join(", ");
  const columns = fields.map((field) => `"${field}"`).join(", ");
  database
    .prepare(`INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`)
    .run(...Object.values(record));
}

async function createSourceDatabase(path) {
  const passwordA = await hashPassword("migration-password-a");
  const passwordB = await hashPassword("migration-password-b");
  const database = new DatabaseSync(path);
  const createdAt = Date.parse("2026-01-01T00:00:00.000Z");
  const updatedAt = Date.parse("2026-01-02T00:00:00.000Z");

  try {
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE "User" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL UNIQUE,
        "emailVerified" INTEGER NOT NULL DEFAULT 0,
        "timeZone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
        "image" TEXT,
        "createdAt" DATETIME NOT NULL,
        "updatedAt" DATETIME NOT NULL
      );
      CREATE TABLE "Account" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "accountId" TEXT NOT NULL,
        "providerId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "accessToken" TEXT,
        "refreshToken" TEXT,
        "idToken" TEXT,
        "accessTokenExpiresAt" DATETIME,
        "refreshTokenExpiresAt" DATETIME,
        "scope" TEXT,
        "password" TEXT,
        "createdAt" DATETIME NOT NULL,
        "updatedAt" DATETIME NOT NULL,
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
      );
      CREATE TABLE "Diary" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "userId" TEXT NOT NULL,
        "date" DATETIME NOT NULL,
        "completedTasks" TEXT NOT NULL,
        "problems" TEXT NOT NULL,
        "nextPlan" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL,
        "updatedAt" DATETIME NOT NULL,
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
        UNIQUE ("userId", "date")
      );
      CREATE TABLE "Session" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "expiresAt" DATETIME NOT NULL,
        "token" TEXT NOT NULL UNIQUE,
        "createdAt" DATETIME NOT NULL,
        "updatedAt" DATETIME NOT NULL,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "userId" TEXT NOT NULL,
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
      );
      CREATE TABLE "Verification" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "identifier" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "expiresAt" DATETIME NOT NULL,
        "createdAt" DATETIME NOT NULL,
        "updatedAt" DATETIME NOT NULL
      );
    `);

    insert(database, "User", {
      id: "migration-user-a",
      name: "迁移用户 A",
      email: "migration-a@example.com",
      emailVerified: 1,
      timeZone: "Asia/Shanghai",
      image: null,
      createdAt,
      updatedAt,
    });
    insert(database, "User", {
      id: "migration-user-b",
      name: "迁移用户 B",
      email: "migration-b@example.com",
      emailVerified: 0,
      timeZone: "Asia/Tokyo",
      image: "https://example.com/user-b.png",
      createdAt,
      updatedAt,
    });
    insert(database, "Account", {
      id: "migration-account-a",
      accountId: "migration-user-a",
      providerId: "credential",
      userId: "migration-user-a",
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      scope: null,
      password: passwordA,
      createdAt,
      updatedAt,
    });
    insert(database, "Account", {
      id: "migration-account-b",
      accountId: "migration-user-b",
      providerId: "credential",
      userId: "migration-user-b",
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      scope: null,
      password: passwordB,
      createdAt,
      updatedAt,
    });
    insert(database, "Diary", {
      id: "migration-diary-a",
      userId: "migration-user-a",
      date: Date.parse("2026-01-01T00:00:00.000Z"),
      completedTasks: "MigrationAlphaSearch 完成用户 A 迁移验证",
      problems: "用户 A 问题",
      nextPlan: "用户 A 下一步",
      content: "用户 A 完整内容",
      createdAt,
      updatedAt,
    });
    insert(database, "Diary", {
      id: "migration-diary-b",
      userId: "migration-user-b",
      date: Date.parse("2026-01-02T00:00:00.000Z"),
      completedTasks: "MigrationBetaSearch 完成用户 B 迁移验证",
      problems: "用户 B 问题",
      nextPlan: "用户 B 下一步",
      content: "用户 B 完整内容",
      createdAt,
      updatedAt,
    });
    insert(database, "Session", {
      id: "sqlite-session-not-migrated",
      expiresAt: Date.parse("2027-01-01T00:00:00.000Z"),
      token: "sqlite-session-token",
      createdAt,
      updatedAt,
      ipAddress: null,
      userAgent: null,
      userId: "migration-user-a",
    });
    insert(database, "Verification", {
      id: "sqlite-verification-not-migrated",
      identifier: "migration-a@example.com",
      value: "verification-value",
      expiresAt: Date.parse("2027-01-01T00:00:00.000Z"),
      createdAt,
      updatedAt,
    });
  } finally {
    database.close();
  }
}

async function waitForServer(server, getOutput) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before the test started.\n${getOutput()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/auth/get-session`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Timed out waiting for Next.js.\n${getOutput()}`);
}

function cookieFrom(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "login response should set a session cookie");
  return setCookie.split(";", 1)[0];
}

async function login(email, password) {
  const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, await response.text());
  return cookieFrom(response);
}

function authenticatedFetch(path, cookie) {
  return fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
}

function todayIn(timeZone) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

test(
  "migrates SQLite users, accounts, and diaries while preserving identity and isolation",
  { timeout: 120_000 },
  async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "scientific-growth-log-migration-"));
    const sqlitePath = join(tempDirectory, "source.db");
    const exportPath = join(tempDirectory, "sqlite-export.json");
    let database;
    let server;
    let output = "";

    try {
      await createSourceDatabase(sqlitePath);
      database = await createPostgresTestDatabase("data_migration_test");
      const migrationEnv = {
        SQLITE_DATABASE_PATH: sqlitePath,
        MIGRATION_EXPORT_PATH: exportPath,
        DATABASE_URL: database.databaseUrl,
        DIRECT_URL: database.databaseUrl,
      };

      await runScript("scripts/export-sqlite-data.mjs", migrationEnv);
      const exported = JSON.parse(await readFile(exportPath, "utf8"));
      assert.deepEqual(exported.counts, { users: 2, accounts: 2, diaries: 2 });
      assert.equal(exported.sessions, undefined);
      assert.equal(exported.verifications, undefined);

      await runScript("scripts/import-postgres-data.mjs", migrationEnv);
      const verificationOutput = await runScript("scripts/verify-migration.mjs", migrationEnv);
      assert.equal(JSON.parse(verificationOutput.trim()).verified, true);

      const users = await database.prisma.user.findMany({ orderBy: { id: "asc" } });
      const diaries = await database.prisma.diary.findMany({ orderBy: { id: "asc" } });
      assert.deepEqual(
        users.map((user) => user.id),
        ["migration-user-a", "migration-user-b"],
      );
      assert.deepEqual(
        diaries.map((diary) => [diary.id, diary.userId]),
        [
          ["migration-diary-a", "migration-user-a"],
          ["migration-diary-b", "migration-user-b"],
        ],
      );
      assert.equal(await database.prisma.session.count(), 0);
      assert.equal(await database.prisma.verification.count(), 0);

      const env = {
        ...process.env,
        DATABASE_URL: database.databaseUrl,
        DIRECT_URL: database.databaseUrl,
        BETTER_AUTH_SECRET: authSecret,
        BETTER_AUTH_URL: baseUrl,
      };
      server = spawn(
        process.execPath,
        ["node_modules/next/dist/bin/next", "dev", "-p", "3102"],
        { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] },
      );
      server.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });
      server.stderr.on("data", (chunk) => {
        output += chunk.toString();
      });
      await waitForServer(server, () => output);

      const cookieA = await login("migration-a@example.com", "migration-password-a");
      const cookieB = await login("migration-b@example.com", "migration-password-b");
      const sessionA = await authenticatedFetch("/api/auth/get-session", cookieA).then(
        (response) => response.json(),
      );
      const sessionB = await authenticatedFetch("/api/auth/get-session", cookieB).then(
        (response) => response.json(),
      );
      assert.equal(sessionA.user.id, "migration-user-a");
      assert.equal(sessionA.user.timeZone, "Asia/Shanghai");
      assert.equal(sessionB.user.id, "migration-user-b");
      assert.equal(sessionB.user.timeZone, "Asia/Tokyo");

      const diariesA = await authenticatedFetch("/api/diary", cookieA).then((response) =>
        response.json(),
      );
      const diariesB = await authenticatedFetch("/api/diary", cookieB).then((response) =>
        response.json(),
      );
      assert.deepEqual(diariesA.diaries.map((diary) => diary.id), ["migration-diary-a"]);
      assert.deepEqual(diariesB.diaries.map((diary) => diary.id), ["migration-diary-b"]);

      const dashboardA = await authenticatedFetch("/", cookieA).then((response) => response.text());
      const dashboardB = await authenticatedFetch("/", cookieB).then((response) => response.text());
      assert.match(dashboardA, /MigrationAlphaSearch/);
      assert.doesNotMatch(dashboardA, /MigrationBetaSearch/);
      assert.match(dashboardB, /MigrationBetaSearch/);
      assert.doesNotMatch(dashboardB, /MigrationAlphaSearch/);

      const historyA = await authenticatedFetch("/history", cookieA).then((response) =>
        response.text(),
      );
      assert.match(historyA, /MigrationAlphaSearch/);
      assert.doesNotMatch(historyA, /MigrationBetaSearch/);
      assert.equal(
        (await authenticatedFetch("/diary/migration-diary-b", cookieA)).status,
        404,
      );

      const searchA = await authenticatedFetch(
        "/api/diary/search?q=MigrationAlphaSearch",
        cookieA,
      ).then((response) => response.json());
      const blockedSearch = await authenticatedFetch(
        "/api/diary/search?q=MigrationBetaSearch",
        cookieA,
      ).then((response) => response.json());
      assert.deepEqual(searchA.diaries.map((diary) => diary.id), ["migration-diary-a"]);
      assert.deepEqual(blockedSearch.diaries, []);

      const todayA = await authenticatedFetch("/api/diary/today", cookieA).then((response) =>
        response.json(),
      );
      const todayB = await authenticatedFetch("/api/diary/today", cookieB).then((response) =>
        response.json(),
      );
      assert.equal(todayA.date, todayIn("Asia/Shanghai"));
      assert.equal(todayB.date, todayIn("Asia/Tokyo"));
      assert.equal(await database.prisma.session.count(), 2);
    } finally {
      if (server && server.exitCode === null) {
        server.kill();
        await Promise.race([
          once(server, "exit"),
          new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
        ]);
      }
      if (database) await database.cleanup();
      await rm(tempDirectory, { recursive: true, force: true });
    }
  },
);
