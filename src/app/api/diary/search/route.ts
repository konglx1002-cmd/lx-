import { searchDiaries } from "@/features/diary/diary-service";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";

  try {
    return Response.json({ diaries: await searchDiaries(query) });
  } catch {
    return Response.json({ message: "搜索日志失败" }, { status: 500 });
  }
}
