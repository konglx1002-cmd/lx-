import { getAllDiaries } from "@/features/diary/diary-service";
import { getCurrentUser } from "@/lib/current-user";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ message: "请先登录" }, { status: 401 });
  }

  try {
    return Response.json({ diaries: await getAllDiaries(user.id) });
  } catch {
    return Response.json({ message: "读取历史日志失败" }, { status: 500 });
  }
}
