import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

const inputPath = resolve(
  process.env.MIGRATION_EXPORT_PATH ?? "migration-data/sqlite-export.json",
);
const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DIRECT_URL or DATABASE_URL is required for migration verification.");
}

const protocol = new URL(databaseUrl).protocol;
if (protocol !== "postgresql:" && protocol !== "postgres:") {
  throw new Error("The verification target must use a direct postgresql:// connection URL.");
}

function iso(value) {
  return value === null ? null : new Date(value).toISOString();
}

function compareCount(label, source, target) {
  if (source.length !== target.length) {
    throw new Error(`${label} count mismatch: source=${source.length}, target=${target.length}.`);
  }
}

function compareIds(label, source, target) {
  const sourceIds = source.map((record) => record.id).sort();
  const targetIds = target.map((record) => record.id).sort();
  if (JSON.stringify(sourceIds) !== JSON.stringify(targetIds)) {
    throw new Error(`${label} ID set mismatch.`);
  }
}

function compareRecords(label, source, target, fields) {
  const targetById = new Map(target.map((record) => [record.id, record]));
  for (const sourceRecord of source) {
    const targetRecord = targetById.get(sourceRecord.id);
    if (!targetRecord) {
      throw new Error(`${label} ${sourceRecord.id} is missing from PostgreSQL.`);
    }
    for (const field of fields) {
      if (sourceRecord[field] !== targetRecord[field]) {
        throw new Error(`${label} ${sourceRecord.id} field ${field} does not match.`);
      }
    }
  }
}

const payload = JSON.parse(await readFile(inputPath, "utf8"));
if (payload.formatVersion !== 1) {
  throw new Error(`Unsupported migration export format: ${payload.formatVersion}`);
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

try {
  const [users, accounts, diaries, sessionCount, verificationCount] = await Promise.all([
    prisma.user.findMany({ orderBy: { id: "asc" } }),
    prisma.account.findMany({ orderBy: { id: "asc" } }),
    prisma.diary.findMany({ orderBy: { id: "asc" } }),
    prisma.session.count(),
    prisma.verification.count(),
  ]);

  const normalizedUsers = users.map((user) => ({
    ...user,
    createdAt: iso(user.createdAt),
    updatedAt: iso(user.updatedAt),
  }));
  const normalizedAccounts = accounts.map((account) => ({
    ...account,
    accessTokenExpiresAt: iso(account.accessTokenExpiresAt),
    refreshTokenExpiresAt: iso(account.refreshTokenExpiresAt),
    createdAt: iso(account.createdAt),
    updatedAt: iso(account.updatedAt),
  }));
  const normalizedDiaries = diaries.map((diary) => ({
    ...diary,
    date: iso(diary.date),
    createdAt: iso(diary.createdAt),
    updatedAt: iso(diary.updatedAt),
  }));

  compareCount("User", payload.users, normalizedUsers);
  compareCount("Account", payload.accounts, normalizedAccounts);
  compareCount("Diary", payload.diaries, normalizedDiaries);
  compareIds("User", payload.users, normalizedUsers);
  compareIds("Account", payload.accounts, normalizedAccounts);
  compareIds("Diary", payload.diaries, normalizedDiaries);
  compareRecords("User", payload.users, normalizedUsers, [
    "name",
    "email",
    "emailVerified",
    "timeZone",
    "image",
    "createdAt",
    "updatedAt",
  ]);
  compareRecords("Account", payload.accounts, normalizedAccounts, [
    "accountId",
    "providerId",
    "userId",
    "accessToken",
    "refreshToken",
    "idToken",
    "accessTokenExpiresAt",
    "refreshTokenExpiresAt",
    "scope",
    "password",
    "createdAt",
    "updatedAt",
  ]);
  compareRecords("Diary", payload.diaries, normalizedDiaries, [
    "userId",
    "date",
    "completedTasks",
    "problems",
    "nextPlan",
    "content",
    "createdAt",
    "updatedAt",
  ]);

  const userIds = new Set(normalizedUsers.map((user) => user.id));
  if (normalizedDiaries.some((diary) => !userIds.has(diary.userId))) {
    throw new Error("PostgreSQL contains a Diary with an invalid userId relationship.");
  }
  if (sessionCount !== 0 || verificationCount !== 0) {
    throw new Error("Session and Verification must remain empty during migration.");
  }

  console.log(
    JSON.stringify({
      verified: true,
      users: users.length,
      accounts: accounts.length,
      diaries: diaries.length,
      sessions: sessionCount,
      verifications: verificationCount,
    }),
  );
} finally {
  await prisma.$disconnect();
}
