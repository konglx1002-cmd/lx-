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

test("supports diary saving, history, details, and search", { timeout: 60_000 }, async () => {
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
        nextPlan: "进入下一阶段 AlphaPlan",
      }),
    });
    assert.equal(updateResponse.status, 200);

    const secondReload = await fetch(`${baseUrl}/api/diary/today`).then((response) => response.json());
    assert.equal(secondReload.diary.id, diaryId);
    assert.equal(secondReload.diary.completedTasks, "完成更新测试");
    assert.equal(await prisma.diary.count(), 1);

    const today = new Date(`${secondReload.date}T00:00:00.000Z`);
    const previousDay = new Date(today);
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    const earlierDay = new Date(today);
    earlierDay.setUTCDate(earlierDay.getUTCDate() - 2);

    const previousDiary = await prisma.diary.create({
      data: {
        date: previousDay,
        completedTasks: "完成 YOLO 历史列表页面",
        problems: "需要确认排序",
        nextPlan: "检查详情内容",
        content: "",
      },
    });
    const earlierDiary = await prisma.diary.create({
      data: {
        date: earlierDay,
        completedTasks: "整理更早的实验记录",
        problems: "BetaIssue 实验数据待复核",
        nextPlan: "补充实验结论",
        content: "",
      },
    });

    const historyResponse = await fetch(`${baseUrl}/api/diary`);
    assert.equal(historyResponse.status, 200);
    const history = await historyResponse.json();
    assert.deepEqual(
      history.diaries.map((diary) => diary.id),
      [diaryId, previousDiary.id, earlierDiary.id],
    );

    const historyPage = await fetch(`${baseUrl}/history`);
    assert.equal(historyPage.status, 200);
    const historyHtml = await historyPage.text();
    assert.match(historyHtml, /完成 YOLO 历史列表页面/);
    assert.match(historyHtml, new RegExp(`/diary/${previousDiary.id}`));

    const detailPage = await fetch(`${baseUrl}/diary/${earlierDiary.id}`);
    assert.equal(detailPage.status, 200);
    const detailHtml = await detailPage.text();
    assert.match(detailHtml, /整理更早的实验记录/);
    assert.match(detailHtml, /BetaIssue 实验数据待复核/);
    assert.match(detailHtml, /补充实验结论/);

    const completedSearch = await fetch(`${baseUrl}/api/diary/search?q=YOLO`).then((response) =>
      response.json(),
    );
    assert.deepEqual(completedSearch.diaries.map((diary) => diary.id), [previousDiary.id]);

    const problemSearch = await fetch(`${baseUrl}/api/diary/search?q=BetaIssue`).then((response) =>
      response.json(),
    );
    assert.deepEqual(problemSearch.diaries.map((diary) => diary.id), [earlierDiary.id]);

    const planSearch = await fetch(`${baseUrl}/api/diary/search?q=AlphaPlan`).then((response) =>
      response.json(),
    );
    assert.deepEqual(planSearch.diaries.map((diary) => diary.id), [diaryId]);

    const emptySearchResponse = await fetch(`${baseUrl}/api/diary/search?q=not-found`);
    assert.equal(emptySearchResponse.status, 200);
    const emptySearch = await emptySearchResponse.json();
    assert.deepEqual(emptySearch.diaries, []);

    const searchPage = await fetch(`${baseUrl}/search?q=YOLO`);
    assert.equal(searchPage.status, 200);
    const searchHtml = await searchPage.text();
    assert.match(searchHtml, /完成 YOLO 历史列表页面/);
    assert.match(searchHtml, new RegExp(`/diary/${previousDiary.id}`));

    const emptySearchPage = await fetch(`${baseUrl}/search?q=not-found`);
    assert.equal(emptySearchPage.status, 200);
    assert.match(await emptySearchPage.text(), /未找到包含/);
    assert.equal(await prisma.diary.count(), 3);
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
