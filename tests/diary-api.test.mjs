import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

import { createPostgresTestDatabase } from "./postgres-test-database.mjs";

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

function cookieFrom(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "authentication response should set a session cookie");
  return setCookie.split(";", 1)[0];
}

async function register(name, email, timeZone) {
  const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ name, email, password: "test-password", timeZone }),
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

test("isolates dashboard, diary saving, history, details, and search by user", { timeout: 90_000 }, async () => {
  const database = await createPostgresTestDatabase("diary_api_test");
  const { databaseUrl, prisma } = database;
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    BETTER_AUTH_SECRET: authSecret,
    BETTER_AUTH_URL: baseUrl,
  };
  let output = "";
  let server;

  try {
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
    const anonymousHome = await fetch(baseUrl);
    assert.equal(anonymousHome.status, 200);
    const anonymousHomeHtml = await anonymousHome.text();
    assert.match(anonymousHomeHtml, /科研成长日志/);
    assert.match(anonymousHomeHtml, /href="\/login"/);
    assert.match(anonymousHomeHtml, /href="\/register"/);
    assert.doesNotMatch(anonymousHomeHtml, /科研日志工作台/);

    const userA = await register("用户 A", "user-a@example.com", "Asia/Shanghai");
    const userB = await register("用户 B", "user-b@example.com", "Asia/Tokyo");
    assert.equal(userA.user.timeZone, "Asia/Shanghai");
    assert.equal(userB.user.timeZone, "Asia/Tokyo");
    const initialA = await authenticatedFetch("/api/diary/today", userA.cookie).then((response) =>
      response.json(),
    );
    const initialB = await authenticatedFetch("/api/diary/today", userB.cookie).then((response) =>
      response.json(),
    );
    assert.equal(initialA.diary, null);
    assert.equal(initialB.diary, null);

    const emptyDashboardA = await authenticatedFetch("/", userA.cookie).then((response) =>
      response.text(),
    );
    assert.match(emptyDashboardA, /你好，(?:<!-- -->)?用户 A/);
    assert.match(emptyDashboardA, /还没有记录今天的日志/);
    assert.match(emptyDashboardA, /开始你的第一篇科研日志/);
    assert.match(emptyDashboardA, /记录今天/);
    assert.match(emptyDashboardA, new RegExp(`dateTime="${initialA.date}"`));

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
    const oldestDay = new Date(today);
    oldestDay.setUTCDate(oldestDay.getUTCDate() - 3);
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
    const oldestA = await prisma.diary.create({
      data: {
        userId: userA.user.id,
        date: oldestDay,
        completedTasks: "用户 A 第四篇旧日志 ShouldNotBeRecent",
        problems: "仅用于验证最近三篇",
        nextPlan: "不应出现在 Dashboard",
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
      [diaryAId, previousA.id, earlierA.id, oldestA.id],
    );
    assert.ok(!historyA.diaries.some((diary) => diary.id === diaryBId || diary.id === privateB.id));

    const dashboardA = await authenticatedFetch("/", userA.cookie).then((response) =>
      response.text(),
    );
    assert.match(dashboardA, /你好，(?:<!-- -->)?用户 A/);
    assert.match(dashboardA, /今天已经完成日志/);
    assert.match(dashboardA, /继续编辑今天日志/);
    assert.match(dashboardA, new RegExp(`dateTime="${secondReloadA.date}"`));
    assert.match(dashboardA, new RegExp(`href="/diary/${diaryAId}"`));
    assert.match(dashboardA, /完成 YOLO 用户 A 历史列表页面/);
    assert.match(dashboardA, /整理用户 A 更早的实验记录/);
    assert.doesNotMatch(dashboardA, /ShouldNotBeRecent|OnlyBobSecret|BobTodaySecret/);

    const dashboardB = await authenticatedFetch("/", userB.cookie).then((response) =>
      response.text(),
    );
    assert.match(dashboardB, /你好，(?:<!-- -->)?用户 B/);
    assert.match(dashboardB, new RegExp(`dateTime="${initialB.date}"`));
    assert.match(dashboardB, /BobTodaySecret/);
    assert.match(dashboardB, /OnlyBobSecret/);
    assert.doesNotMatch(dashboardB, /AlphaPlan|ShouldNotBeRecent|YOLO/);

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
    assert.equal(await prisma.diary.count(), 6);
  } finally {
    if (server && server.exitCode === null) {
      server.kill();
      await Promise.race([
        once(server, "exit"),
        new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
      ]);
    }
    await database.cleanup();
  }
});
