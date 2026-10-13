import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const databaseUrl = "file:./auth-api-test.db";
const databasePath = resolve("prisma/auth-api-test.db");
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

test("supports registration, persistent sessions, login, and logout", { timeout: 90_000 }, async () => {
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: authSecret,
    BETTER_AUTH_URL: baseUrl,
  };
  let output = "";
  let prisma;
  let server;

  try {
    process.env.DATABASE_URL = databaseUrl;
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
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
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "User_email_key" ON "User"("email")');
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token")');
    await prisma.$executeRawUnsafe('CREATE INDEX "Session_userId_idx" ON "Session"("userId")');
    await prisma.$executeRawUnsafe('CREATE INDEX "Account_userId_idx" ON "Account"("userId")');
    await prisma.$executeRawUnsafe(
      'CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier")',
    );

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
    assert.notEqual(secondSession.user.id, firstSession.user.id);

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

    const anonymousHome = await fetch(baseUrl).then((response) => response.text());
    assert.match(anonymousHome, /href="\/login"/);
    const authenticatedHome = await fetch(baseUrl, {
      headers: { Cookie: loginCookie },
    }).then((response) => response.text());
    assert.match(authenticatedHome, /用户甲/);

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
    await prisma?.$disconnect();
    await removeDatabase(databasePath);
    await removeDatabase(`${databasePath}-journal`);
  }
});
