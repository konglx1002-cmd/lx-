import { getAllDiaries } from "@/features/diary/diary-service";

export async function GET() {
  try {
    return Response.json({ diaries: await getAllDiaries() });
  } catch {
    return Response.json({ message: "读取历史日志失败" }, { status: 500 });
  }
}
