import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const databaseUrl = "file:./diary-api-test.db";
const databasePath = resolve("prisma/diary-api-test.db");
const baseUrl = "http://127.0.0.1:3100";
const authSecret = "diary-test-secret-with-at-least-32-characters";

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

async function removeDatabase(path) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rm(path, { force: true });
      return;
    } catch (error) {
      if (error.code !== "EBUSY" || attempt === 19) throw error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
  }
}

function cookieFrom(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "authentication response should set a session cookie");
  return setCookie.split(";", 1)[0];
}

async function register(name, email) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ name, email, password: "test-password" }),
  });
  assert.equal(response.status, 200, await response.text());
  const cookie = cookieFrom(response);
  const session = await fetch(`${baseUrl}/api/auth/get-session`, {
    headers: { Cookie: cookie },
  }).then((sessionResponse) => sessionResponse.json());
  return { cookie, user: session.user };
}

function authenticatedFetch(path, cookie, init = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...init.headers, Cookie: cookie },
  });
}

async function createSchema(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "emailVerified" BOOLEAN NOT NULL DEFAULT false,
      "image" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "Session" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "expiresAt" DATETIME NOT NULL,
      "token" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "userId" TEXT NOT NULL,
      CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "Account" (
      "id" TEXT NOT NULL PRIMARY KEY,
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
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "Verification" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "identifier" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "expiresAt" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE "Diary" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "date" DATETIME NOT NULL,
      "completedTasks" TEXT NOT NULL,
      "problems" TEXT NOT NULL,
      "nextPlan" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Diary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "User_email_key" ON "User"("email")');
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token")');
  await prisma.$executeRawUnsafe('CREATE INDEX "Session_userId_idx" ON "Session"("userId")');
  await prisma.$executeRawUnsafe('CREATE INDEX "Account_userId_idx" ON "Account"("userId")');
  await prisma.$executeRawUnsafe(
    'CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX "Diary_userId_date_key" ON "Diary"("userId", "date")',
  );
}

test("isolates diary saving, history, details, and search by user", { timeout: 90_000 }, async () => {
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: authSecret,
    BETTER_AUTH_URL: baseUrl,
  };
  process.env.DATABASE_URL = databaseUrl;
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  let output = "";
  let server;

  try {
    await createSchema(prisma);

    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3100"], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    server.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    await waitForServer(server, () => output);
    assert.equal((await fetch(`${baseUrl}/api/diary/today`)).status, 401);

    const userA = await register("用户 A", "user-a@example.com");
    const userB = await register("用户 B", "user-b@example.com");
    const initialA = await authenticatedFetch("/api/diary/today", userA.cookie).then((response) =>
      response.json(),
    );
    const initialB = await authenticatedFetch("/api/diary/today", userB.cookie).then((response) =>
      response.json(),
    );
    assert.equal(initialA.diary, null);
    assert.equal(initialB.diary, null);

    const createA = await authenticatedFetch("/api/diary/today", userA.cookie, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: userB.user.id,
        completedTasks: "完成用户 A 首次保存测试",
        problems: "无",
        nextPlan: "验证刷新读取",
      }),
    });
    assert.equal(createA.status, 200);
    const createB = await authenticatedFetch("/api/diary/today", userB.cookie, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        completedTasks: "用户 B 私有当日日志 BobTodaySecret",
        problems: "仅用户 B 可见",
        nextPlan: "继续隔离验证",
      }),
    });
    assert.equal(createB.status, 200);

    const firstReloadA = await authenticatedFetch("/api/diary/today", userA.cookie).then(
      (response) => response.json(),
    );
    const firstReloadB = await authenticatedFetch("/api/diary/today", userB.cookie).then(
      (response) => response.json(),
    );
    const diaryAId = firstReloadA.diary.id;
    const diaryBId = firstReloadB.diary.id;
    assert.notEqual(diaryAId, diaryBId);
    assert.equal(await prisma.diary.count(), 2);
    assert.equal((await prisma.diary.findUnique({ where: { id: diaryAId } })).userId, userA.user.id);
    assert.equal((await prisma.diary.findUnique({ where: { id: diaryBId } })).userId, userB.user.id);

    const updateA = await authenticatedFetch("/api/diary/today", userA.cookie, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        completedTasks: "完成用户 A 更新测试",
        problems: "问题已解决",
        nextPlan: "进入下一阶段 AlphaPlan",
      }),
    });
    assert.equal(updateA.status, 200);
    const secondReloadA = await authenticatedFetch("/api/diary/today", userA.cookie).then(
      (response) => response.json(),
    );
    assert.equal(secondReloadA.diary.id, diaryAId);

    const today = new Date(`${secondReloadA.date}T00:00:00.000Z`);
    const previousDay = new Date(today);
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    const earlierDay = new Date(today);
    earlierDay.setUTCDate(earlierDay.getUTCDate() - 2);
    const previousA = await prisma.diary.create({
      data: {
        userId: userA.user.id,
        date: previousDay,
        completedTasks: "完成 YOLO 用户 A 历史列表页面",
        problems: "需要确认排序",
        nextPlan: "检查详情内容",
        content: "",
      },
    });
    const earlierA = await prisma.diary.create({
      data: {
        userId: userA.user.id,
        date: earlierDay,
        completedTasks: "整理用户 A 更早的实验记录",
        problems: "BetaIssue 实验数据待复核",
        nextPlan: "补充实验结论",
        content: "",
      },
    });
    const privateB = await prisma.diary.create({
      data: {
        userId: userB.user.id,
        date: previousDay,
        completedTasks: "OnlyBobSecret 私有历史记录",
        problems: "用户 A 不应看到",
        nextPlan: "保持隔离",
        content: "",
      },
    });

    const historyA = await authenticatedFetch("/api/diary", userA.cookie).then((response) =>
      response.json(),
    );
    assert.deepEqual(
      historyA.diaries.map((diary) => diary.id),
      [diaryAId, previousA.id, earlierA.id],
    );
    assert.ok(!historyA.diaries.some((diary) => diary.id === diaryBId || diary.id === privateB.id));

    const historyPageA = await authenticatedFetch("/history", userA.cookie);
    assert.equal(historyPageA.status, 200);
    const historyHtmlA = await historyPageA.text();
    assert.match(historyHtmlA, /完成 YOLO 用户 A 历史列表页面/);
    assert.doesNotMatch(historyHtmlA, /OnlyBobSecret|BobTodaySecret/);

    const ownDetail = await authenticatedFetch(`/diary/${earlierA.id}`, userA.cookie);
    assert.equal(ownDetail.status, 200);
    assert.match(await ownDetail.text(), /BetaIssue 实验数据待复核/);
    assert.equal(
      (await authenticatedFetch(`/diary/${privateB.id}`, userA.cookie)).status,
      404,
    );

    const ownSearch = await authenticatedFetch("/api/diary/search?q=YOLO", userA.cookie).then(
      (response) => response.json(),
    );
    assert.deepEqual(ownSearch.diaries.map((diary) => diary.id), [previousA.id]);
    const privateSearchA = await authenticatedFetch(
      "/api/diary/search?q=OnlyBobSecret",
      userA.cookie,
    ).then((response) => response.json());
    assert.deepEqual(privateSearchA.diaries, []);
    const privateSearchB = await authenticatedFetch(
      "/api/diary/search?q=OnlyBobSecret",
      userB.cookie,
    ).then((response) => response.json());
    assert.deepEqual(privateSearchB.diaries.map((diary) => diary.id), [privateB.id]);

    const searchPageA = await authenticatedFetch("/search?q=OnlyBobSecret", userA.cookie);
    assert.equal(searchPageA.status, 200);
    assert.doesNotMatch(await searchPageA.text(), /私有历史记录/);
    assert.equal(await prisma.diary.count(), 5);
  } finally {
    if (server && server.exitCode === null) {
      server.kill();
      await Promise.race([
        once(server, "exit"),
        new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
      ]);
    }
    await prisma.$disconnect();
    await removeDatabase(databasePath);
    await removeDatabase(`${databasePath}-journal`);
  }
});
