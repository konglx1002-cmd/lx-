import { getTodayDiary, saveTodayDiary } from "@/features/diary/diary-service";
import type { DiaryInput } from "@/features/diary/types";
import { getCurrentUser } from "@/lib/current-user";

function parseDiaryInput(value: unknown): DiaryInput | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const input = value as Record<string, unknown>;
  if (
    typeof input.completedTasks !== "string" ||
    typeof input.problems !== "string" ||
    typeof input.nextPlan !== "string"
  ) {
    return null;
  }

  return {
    completedTasks: input.completedTasks,
    problems: input.problems,
    nextPlan: input.nextPlan,
  };
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ message: "请先登录" }, { status: 401 });
  }

  try {
    return Response.json(await getTodayDiary(user.id));
  } catch {
    return Response.json({ message: "读取日志失败" }, { status: 500 });
  }
}

async function save(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ message: "请先登录" }, { status: 401 });
  }

  try {
    const input = parseDiaryInput(await request.json());

    if (!input) {
      return Response.json({ message: "日志内容格式不正确" }, { status: 400 });
    }

    return Response.json({ diary: await saveTodayDiary(user.id, input) });
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
