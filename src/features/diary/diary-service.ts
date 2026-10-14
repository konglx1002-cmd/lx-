import type { Diary } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getTodayDateKey } from "@/lib/time-zone";

import type { DiaryData, DiaryInput } from "./types";

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

export async function getTodayDiary(userId: string, timeZone: string) {
  const date = getTodayDateKey(timeZone);
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

export async function getRecentDiaries(userId: string) {
  const diaries = await prisma.diary.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 3,
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

export async function saveTodayDiary(userId: string, timeZone: string, input: DiaryInput) {
  const date = getTodayDateKey(timeZone);
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
