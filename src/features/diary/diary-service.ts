import type { Diary } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { DiaryData, DiaryInput } from "./types";

const DIARY_TIME_ZONE = "Asia/Shanghai";

export function getTodayDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: DIARY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateKeyToDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function toDiaryData(diary: Diary): DiaryData {
  return {
    id: diary.id,
    date: diary.date.toISOString().slice(0, 10),
    completedTasks: diary.completedTasks,
    problems: diary.problems,
    nextPlan: diary.nextPlan,
    createdAt: diary.createdAt.toISOString(),
    updatedAt: diary.updatedAt.toISOString(),
  };
}

export async function getTodayDiary(userId: string) {
  const date = getTodayDateKey();
  const diary = await prisma.diary.findUnique({
    where: {
      userId_date: {
        userId,
        date: dateKeyToDate(date),
      },
    },
  });

  return {
    date,
    diary: diary ? toDiaryData(diary) : null,
  };
}

export async function getAllDiaries(userId: string) {
  const diaries = await prisma.diary.findMany({
    where: { userId },
    orderBy: { date: "desc" },
  });

  return diaries.map(toDiaryData);
}

export async function getDiaryById(userId: string, id: string) {
  const diary = await prisma.diary.findFirst({ where: { id, userId } });
  return diary ? toDiaryData(diary) : null;
}

export async function searchDiaries(userId: string, query: string) {
  const keyword = query.trim();

  if (!keyword) {
    return [];
  }

  const diaries = await prisma.diary.findMany({
    where: {
      userId,
      OR: [
        { completedTasks: { contains: keyword } },
        { problems: { contains: keyword } },
        { nextPlan: { contains: keyword } },
      ],
    },
    orderBy: { date: "desc" },
  });

  return diaries.map(toDiaryData);
}

export async function saveTodayDiary(userId: string, input: DiaryInput) {
  const date = getTodayDateKey();
  const diaryDate = dateKeyToDate(date);
  const diary = await prisma.diary.upsert({
    where: {
      userId_date: {
        userId,
        date: diaryDate,
      },
    },
    update: input,
    create: {
      userId,
      date: diaryDate,
      ...input,
      content: "",
    },
  });

  return toDiaryData(diary);
}
