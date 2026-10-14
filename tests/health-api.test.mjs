import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

import { createPostgresTestDatabase } from "./postgres-test-database.mjs";

const authSecret = "health-test-secret-with-at-least-32-characters";

function startServer(port, databaseUrl) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DIRECT_URL: databaseUrl,
        BETTER_AUTH_SECRET: authSecret,
        BETTER_AUTH_URL: baseUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  return { baseUrl, server, getOutput: () => output };
}

async function waitForServer(instance) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (instance.server.exitCode !== null) {
      throw new Error(`Next.js exited before the test started.\n${instance.getOutput()}`);
    }
    try {
      const response = await fetch(`${instance.baseUrl}/api/health`);
      if (response.status === 200 || response.status === 503) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Timed out waiting for Next.js.\n${instance.getOutput()}`);
}

async function stopServer(instance) {
  if (instance && instance.server.exitCode === null) {
    instance.server.kill();
    await Promise.race([
      once(instance.server, "exit"),
      new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
    ]);
  }
}

test("reports database health without exposing connection errors", { timeout: 90_000 }, async () => {
  const database = await createPostgresTestDatabase("health_api_test");
  let connectedServer;
  let disconnectedServer;

  try {
    connectedServer = startServer(3103, database.databaseUrl);
    await waitForServer(connectedServer);

    const beforeRequest = Date.now();
    const healthyResponse = await fetch(`${connectedServer.baseUrl}/api/health`);
    const afterRequest = Date.now();
    const healthyBody = await healthyResponse.json();

    assert.equal(healthyResponse.status, 200);
    assert.equal(healthyResponse.headers.get("content-type"), "application/json");
    assert.deepEqual(Object.keys(healthyBody).sort(), ["database", "status", "timestamp"]);
    assert.equal(healthyBody.status, "ok");
    assert.equal(healthyBody.database, "connected");
    const timestamp = Date.parse(healthyBody.timestamp);
    assert.ok(Number.isFinite(timestamp));
    assert.ok(timestamp >= beforeRequest && timestamp <= afterRequest);

    await stopServer(connectedServer);
    connectedServer = undefined;

    const unavailableDatabaseUrl =
      "postgresql://postgres:postgres@127.0.0.1:1/unavailable?schema=public&connect_timeout=1";
    disconnectedServer = startServer(3104, unavailableDatabaseUrl);
    await waitForServer(disconnectedServer);

    const unhealthyResponse = await fetch(`${disconnectedServer.baseUrl}/api/health`);
    const unhealthyText = await unhealthyResponse.text();

    assert.equal(unhealthyResponse.status, 503);
    assert.deepEqual(JSON.parse(unhealthyText), {
      status: "error",
      database: "disconnected",
    });
    assert.doesNotMatch(unhealthyText, /postgres|prisma|127\.0\.0\.1|DATABASE_URL|secret/i);
  } finally {
    await stopServer(connectedServer);
    await stopServer(disconnectedServer);
    await database.cleanup();
  }
});
