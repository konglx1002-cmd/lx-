import { getTodayDiary, saveTodayDiary } from "@/features/diary/diary-service";
import type { DiaryInput } from "@/features/diary/types";

function isDiaryInput(value: unknown): value is DiaryInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const input = value as Record<string, unknown>;
  return (
    typeof input.completedTasks === "string" &&
    typeof input.problems === "string" &&
    typeof input.nextPlan === "string"
  );
}

export async function GET() {
  try {
    return Response.json(await getTodayDiary());
  } catch {
    return Response.json({ message: "读取日志失败" }, { status: 500 });
  }
}

async function save(request: Request) {
  try {
    const input: unknown = await request.json();

    if (!isDiaryInput(input)) {
      return Response.json({ message: "日志内容格式不正确" }, { status: 400 });
    }

    return Response.json({ diary: await saveTodayDiary(input) });
  } catch {
    return Response.json({ message: "保存日志失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return save(request);
}

export async function PUT(request: Request) {
  return save(request);
}
