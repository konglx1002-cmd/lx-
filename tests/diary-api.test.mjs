import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const databaseUrl = "file:./diary-api-test.db";
const databasePath = resolve("prisma/diary-api-test.db");
const baseUrl = "http://127.0.0.1:3100";

async function waitForServer(server, getOutput) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before the test started.\n${getOutput()}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/diary/today`);
      if (response.ok) {
        return;
      }
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
      if (error.code !== "EBUSY" || attempt === 19) {
        throw error;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
  }
}

test("creates, reloads, and updates one diary for today", { timeout: 60_000 }, async () => {
  process.env.DATABASE_URL = databaseUrl;
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  let output = "";
  let server;

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Diary" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "date" DATETIME NOT NULL,
        "completedTasks" TEXT NOT NULL,
        "problems" TEXT NOT NULL,
        "nextPlan" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )
    `);
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX "Diary_date_key" ON "Diary"("date")',
    );

    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3100"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    server.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    await waitForServer(server, () => output);

    const initialResponse = await fetch(`${baseUrl}/api/diary/today`);
    const initial = await initialResponse.json();
    assert.equal(initial.diary, null);

    const createResponse = await fetch(`${baseUrl}/api/diary/today`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        completedTasks: "完成首次保存测试",
        problems: "无",
        nextPlan: "验证刷新读取",
      }),
    });
    assert.equal(createResponse.status, 200);

    const firstReload = await fetch(`${baseUrl}/api/diary/today`).then((response) => response.json());
    assert.equal(firstReload.diary.completedTasks, "完成首次保存测试");
    const diaryId = firstReload.diary.id;

    const updateResponse = await fetch(`${baseUrl}/api/diary/today`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        completedTasks: "完成更新测试",
        problems: "问题已解决",
        nextPlan: "进入下一阶段",
      }),
    });
    assert.equal(updateResponse.status, 200);

    const secondReload = await fetch(`${baseUrl}/api/diary/today`).then((response) => response.json());
    assert.equal(secondReload.diary.id, diaryId);
    assert.equal(secondReload.diary.completedTasks, "完成更新测试");
    assert.equal(await prisma.diary.count(), 1);
  } finally {
    if (server && server.exitCode === null) {
      server.kill();
      await Promise.race([once(server, "exit"), new Promise((resolveWait) => setTimeout(resolveWait, 5_000))]);
    }
    await prisma.$disconnect();
    await removeDatabase(databasePath);
    await removeDatabase(`${databasePath}-journal`);
  }
});
