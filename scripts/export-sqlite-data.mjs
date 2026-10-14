import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const sourcePath = resolve(process.env.SQLITE_DATABASE_PATH ?? "prisma/dev.db");
const outputPath = resolve(
  process.env.MIGRATION_EXPORT_PATH ?? "migration-data/sqlite-export.json",
);

function toIso(value, field) {
  const normalized = typeof value === "bigint" ? Number(value) : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`SQLite field ${field} contains an invalid date.`);
  }
  return date.toISOString();
}

function nullableIso(value, field) {
  return value === null ? null : toIso(value, field);
}

function sortedRows(database, table) {
  return database.prepare(`SELECT * FROM "${table}" ORDER BY "id"`).all();
}

let database;

try {
  database = new DatabaseSync(sourcePath, { readOnly: true });
  const users = sortedRows(database, "User").map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: Boolean(row.emailVerified),
    timeZone: row.timeZone,
    image: row.image,
    createdAt: toIso(row.createdAt, "User.createdAt"),
    updatedAt: toIso(row.updatedAt, "User.updatedAt"),
  }));
  const accounts = sortedRows(database, "Account").map((row) => ({
    id: row.id,
    accountId: row.accountId,
    providerId: row.providerId,
    userId: row.userId,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    idToken: row.idToken,
    accessTokenExpiresAt: nullableIso(
      row.accessTokenExpiresAt,
      "Account.accessTokenExpiresAt",
    ),
    refreshTokenExpiresAt: nullableIso(
      row.refreshTokenExpiresAt,
      "Account.refreshTokenExpiresAt",
    ),
    scope: row.scope,
    password: row.password,
    createdAt: toIso(row.createdAt, "Account.createdAt"),
    updatedAt: toIso(row.updatedAt, "Account.updatedAt"),
  }));
  const diaries = sortedRows(database, "Diary").map((row) => ({
    id: row.id,
    userId: row.userId,
    date: toIso(row.date, "Diary.date"),
    completedTasks: row.completedTasks,
    problems: row.problems,
    nextPlan: row.nextPlan,
    content: row.content,
    createdAt: toIso(row.createdAt, "Diary.createdAt"),
    updatedAt: toIso(row.updatedAt, "Diary.updatedAt"),
  }));

  const payload = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    counts: {
      users: users.length,
      accounts: accounts.length,
      diaries: diaries.length,
    },
    users,
    accounts,
    diaries,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  console.log(
    JSON.stringify({
      outputPath,
      ...payload.counts,
      sessions: 0,
      verifications: 0,
    }),
  );
} finally {
  database?.close();
}
