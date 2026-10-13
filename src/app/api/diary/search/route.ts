import { searchDiaries } from "@/features/diary/diary-service";
import { getCurrentUser } from "@/lib/current-user";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ message: "请先登录" }, { status: 401 });
  }

  try {
    return Response.json({ diaries: await searchDiaries(user.id, query) });
  } catch {
    return Response.json({ message: "搜索日志失败" }, { status: 500 });
  }
}
