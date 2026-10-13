PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Preserve pre-authentication diaries. Existing installations use their
-- earliest account; installations without an account receive a migration-only owner.
INSERT INTO "User" (
    "id",
    "name",
    "email",
    "emailVerified",
    "image",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy-diary-owner',
    '原单用户数据',
    'legacy-diary-owner@migration.invalid',
    false,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Diary")
  AND NOT EXISTS (SELECT 1 FROM "User");

CREATE TABLE "new_Diary" (
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
);

INSERT INTO "new_Diary" (
    "id",
    "userId",
    "date",
    "completedTasks",
    "problems",
    "nextPlan",
    "content",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    (SELECT "id" FROM "User" ORDER BY "createdAt", "id" LIMIT 1),
    "date",
    "completedTasks",
    "problems",
    "nextPlan",
    "content",
    "createdAt",
    "updatedAt"
FROM "Diary";

DROP TABLE "Diary";
ALTER TABLE "new_Diary" RENAME TO "Diary";

CREATE UNIQUE INDEX "Diary_userId_date_key" ON "Diary"("userId", "date");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
