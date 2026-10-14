import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

import { createPostgresTestDatabase } from "./postgres-test-database.mjs";

const baseUrl = "http://127.0.0.1:3101";
const authSecret = "auth-test-secret-with-at-least-32-characters";

async function waitForServer(server, getOutput) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before the test started.\n${getOutput()}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/auth/get-session`);
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

function cookieFrom(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "authentication response should set a session cookie");
  return setCookie.split(";", 1)[0];
}

async function postAuth(path, body, cookie) {
  return fetch(`${baseUrl}/api/auth/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function getSession(cookie) {
  const response = await fetch(`${baseUrl}/api/auth/get-session`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  assert.equal(response.status, 200);
  return response.json();
}

test("supports authentication and isolated user settings", { timeout: 90_000 }, async () => {
  const database = await createPostgresTestDatabase("auth_api_test");
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
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3101"], {
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

    const firstRegistration = await postAuth("sign-up/email", {
      name: "用户甲",
      email: "first@example.com",
      password: "first-password",
    });
    assert.equal(firstRegistration.status, 200, await firstRegistration.text());
    const firstCookie = cookieFrom(firstRegistration);

    const firstSession = await getSession(firstCookie);
    assert.equal(firstSession.user.name, "用户甲");
    assert.equal(firstSession.user.email, "first@example.com");
    assert.equal(firstSession.user.timeZone, "Asia/Shanghai");

    const refreshedSession = await getSession(firstCookie);
    assert.equal(refreshedSession.session.id, firstSession.session.id);
    assert.equal(refreshedSession.user.id, firstSession.user.id);

    const secondRegistration = await postAuth("sign-up/email", {
      name: "用户乙",
      email: "second@example.com",
      password: "second-password",
    });
    assert.equal(secondRegistration.status, 200, await secondRegistration.text());
    const secondCookie = cookieFrom(secondRegistration);
    const secondSession = await getSession(secondCookie);
    assert.equal(secondSession.user.name, "用户乙");
    assert.equal(secondSession.user.timeZone, "Asia/Shanghai");
    assert.notEqual(secondSession.user.id, firstSession.user.id);

    const invalidTimeZoneRegistration = await postAuth("sign-up/email", {
      name: "非法时区用户",
      email: "invalid-time-zone@example.com",
      password: "invalid-time-zone-password",
      timeZone: "Mars/Olympus_Mons",
    });
    assert.equal(invalidTimeZoneRegistration.status, 400);

    const anonymousSettingsApi = await fetch(`${baseUrl}/api/settings`);
    assert.equal(anonymousSettingsApi.status, 401);
    const anonymousSettingsPage = await fetch(`${baseUrl}/settings`, { redirect: "manual" });
    assert.equal(anonymousSettingsPage.status, 307);
    assert.equal(
      new URL(anonymousSettingsPage.headers.get("location"), baseUrl).pathname,
      "/login",
    );

    const initialSettingsResponse = await fetch(`${baseUrl}/api/settings`, {
      headers: { Cookie: firstCookie },
    });
    assert.equal(initialSettingsResponse.status, 200);
    assert.deepEqual((await initialSettingsResponse.json()).settings, {
      name: "用户甲",
      email: "first@example.com",
      timeZone: "Asia/Shanghai",
    });

    const updateSettingsResponse = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: firstCookie },
      body: JSON.stringify({ name: "用户甲已更新", timeZone: "Asia/Tokyo" }),
    });
    const updateSettingsResult = await updateSettingsResponse.json();
    assert.equal(updateSettingsResponse.status, 200, JSON.stringify(updateSettingsResult));
    assert.deepEqual(updateSettingsResult.settings, {
      name: "用户甲已更新",
      email: "first@example.com",
      timeZone: "Asia/Tokyo",
    });

    const emptyNameResponse = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: firstCookie },
      body: JSON.stringify({ name: "   " }),
    });
    assert.equal(emptyNameResponse.status, 400);

    const emailUpdateResponse = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: firstCookie },
      body: JSON.stringify({ email: "changed@example.com" }),
    });
    assert.equal(emailUpdateResponse.status, 400);

    const invalidSettingsResponse = await fetch(`${baseUrl}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: firstCookie },
      body: JSON.stringify({ timeZone: "Mars/Olympus_Mons" }),
    });
    assert.equal(invalidSettingsResponse.status, 400);

    const crossUserUpdate = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: secondCookie },
      body: JSON.stringify({
        userId: firstSession.user.id,
        name: "用户乙试图修改甲",
        timeZone: "Asia/Shanghai",
      }),
    });
    assert.equal(crossUserUpdate.status, 400);

    const storedFirstUser = await prisma.user.findUniqueOrThrow({
      where: { id: firstSession.user.id },
    });
    const storedSecondUser = await prisma.user.findUniqueOrThrow({
      where: { id: secondSession.user.id },
    });
    assert.equal(storedFirstUser.name, "用户甲已更新");
    assert.equal(storedFirstUser.timeZone, "Asia/Tokyo");
    assert.equal(storedSecondUser.name, "用户乙");
    assert.equal(storedSecondUser.timeZone, "Asia/Shanghai");

    const todayResponse = await fetch(`${baseUrl}/api/diary/today`, {
      headers: { Cookie: firstCookie },
    });
    assert.equal(todayResponse.status, 200);
    const todayResult = await todayResponse.json();
    const todayParts = new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const todayValues = Object.fromEntries(todayParts.map((part) => [part.type, part.value]));
    assert.equal(todayResult.date, `${todayValues.year}-${todayValues.month}-${todayValues.day}`);

    const settingsPage = await fetch(`${baseUrl}/settings`, {
      headers: { Cookie: firstCookie },
    });
    assert.equal(settingsPage.status, 200);
    const settingsHtml = await settingsPage.text();
    assert.match(settingsHtml, /用户甲已更新/);
    assert.match(settingsHtml, /first@example\.com/);
    assert.match(settingsHtml, /Asia\/Tokyo/);

    const signOutResponse = await postAuth("sign-out", {}, firstCookie);
    assert.equal(signOutResponse.status, 200);
    assert.equal(await getSession(firstCookie), null);

    const loginResponse = await postAuth("sign-in/email", {
      email: "first@example.com",
      password: "first-password",
    });
    assert.equal(loginResponse.status, 200, await loginResponse.text());
    const loginCookie = cookieFrom(loginResponse);
    const loginSession = await getSession(loginCookie);
    assert.equal(loginSession.user.id, firstSession.user.id);
    assert.equal(loginSession.user.name, "用户甲已更新");
    assert.equal(loginSession.user.timeZone, "Asia/Tokyo");

    const anonymousHome = await fetch(baseUrl).then((response) => response.text());
    assert.match(anonymousHome, /href="\/login"/);
    const authenticatedHome = await fetch(baseUrl, {
      headers: { Cookie: loginCookie },
    }).then((response) => response.text());
    assert.match(authenticatedHome, /href="\/settings"/);
    assert.match(authenticatedHome, /用户甲已更新/);

    assert.equal(await prisma.user.count(), 2);
    assert.ok((await prisma.session.count()) >= 1);
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
