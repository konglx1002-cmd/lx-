import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

const inputPath = resolve(
  process.env.MIGRATION_EXPORT_PATH ?? "migration-data/sqlite-export.json",
);
const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DIRECT_URL or DATABASE_URL is required for the PostgreSQL import.");
}

const protocol = new URL(databaseUrl).protocol;
if (protocol !== "postgresql:" && protocol !== "postgres:") {
  throw new Error("The import target must use a direct postgresql:// connection URL.");
}

function requireArray(payload, field) {
  if (!Array.isArray(payload[field])) {
    throw new Error(`Migration export field ${field} must be an array.`);
  }
  return payload[field];
}

function ensureUnique(records, key, label) {
  const values = records.map((record) => key(record));
  if (new Set(values).size !== values.length) {
    throw new Error(`Migration export contains duplicate ${label}.`);
  }
}

function toDate(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Migration export field ${field} contains an invalid date.`);
  }
  return date;
}

const payload = JSON.parse(await readFile(inputPath, "utf8"));
if (payload.formatVersion !== 1) {
  throw new Error(`Unsupported migration export format: ${payload.formatVersion}`);
}

const users = requireArray(payload, "users");
const accounts = requireArray(payload, "accounts");
const diaries = requireArray(payload, "diaries");
ensureUnique(users, (record) => record.id, "User IDs");
ensureUnique(users, (record) => record.email, "User emails");
ensureUnique(accounts, (record) => record.id, "Account IDs");
ensureUnique(diaries, (record) => record.id, "Diary IDs");
ensureUnique(diaries, (record) => `${record.userId}\0${record.date}`, "Diary user/date keys");

const userIds = new Set(users.map((user) => user.id));
for (const account of accounts) {
  if (!userIds.has(account.userId)) {
    throw new Error(`Account ${account.id} references a missing User.`);
  }
}
for (const diary of diaries) {
  if (!userIds.has(diary.userId)) {
    throw new Error(`Diary ${diary.id} references a missing User.`);
  }
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

try {
  const targetCounts = await Promise.all([
    prisma.user.count(),
    prisma.account.count(),
    prisma.diary.count(),
    prisma.session.count(),
    prisma.verification.count(),
  ]);
  if (targetCounts.some((count) => count !== 0)) {
    throw new Error("PostgreSQL migration target must be empty before import.");
  }

  const operations = [];
  if (users.length > 0) {
    operations.push(
      prisma.user.createMany({
        data: users.map((user) => ({
          ...user,
          createdAt: toDate(user.createdAt, `User ${user.id} createdAt`),
          updatedAt: toDate(user.updatedAt, `User ${user.id} updatedAt`),
        })),
      }),
    );
  }
  if (accounts.length > 0) {
    operations.push(
      prisma.account.createMany({
        data: accounts.map((account) => ({
          ...account,
          accessTokenExpiresAt:
            account.accessTokenExpiresAt === null
              ? null
              : toDate(account.accessTokenExpiresAt, `Account ${account.id} accessTokenExpiresAt`),
          refreshTokenExpiresAt:
            account.refreshTokenExpiresAt === null
              ? null
              : toDate(
                  account.refreshTokenExpiresAt,
                  `Account ${account.id} refreshTokenExpiresAt`,
                ),
          createdAt: toDate(account.createdAt, `Account ${account.id} createdAt`),
          updatedAt: toDate(account.updatedAt, `Account ${account.id} updatedAt`),
        })),
      }),
    );
  }
  if (diaries.length > 0) {
    operations.push(
      prisma.diary.createMany({
        data: diaries.map((diary) => ({
          ...diary,
          date: toDate(diary.date, `Diary ${diary.id} date`),
          createdAt: toDate(diary.createdAt, `Diary ${diary.id} createdAt`),
          updatedAt: toDate(diary.updatedAt, `Diary ${diary.id} updatedAt`),
        })),
      }),
    );
  }

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }

  console.log(
    JSON.stringify({
      users: users.length,
      accounts: accounts.length,
      diaries: diaries.length,
      sessions: 0,
      verifications: 0,
    }),
  );
} finally {
  await prisma.$disconnect();
}
