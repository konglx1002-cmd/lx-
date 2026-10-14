import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { isValidTimeZone } from "@/lib/time-zone";

type SettingsUpdate = {
  name?: string;
  timeZone?: string;
};

function toSettings(user: { name: string; email: string; timeZone: string }) {
  return {
    name: user.name,
    email: user.email,
    timeZone: user.timeZone,
  };
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ message: "请先登录" }, { status: 401 });
  }

  return Response.json({ settings: toSettings(user) });
}

async function update(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ message: "请先登录" }, { status: 401 });
  }

  let value: unknown;

  try {
    value = await request.json();
  } catch {
    return Response.json({ message: "请求格式不正确" }, { status: 400 });
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Response.json({ message: "请求格式不正确" }, { status: 400 });
  }

  const input = value as Record<string, unknown>;

  if ("userId" in input) {
    return Response.json({ message: "不能指定用户身份" }, { status: 400 });
  }

  if ("email" in input) {
    return Response.json({ message: "邮箱暂不支持修改" }, { status: 400 });
  }

  const data: SettingsUpdate = {};

  if ("name" in input) {
    if (typeof input.name !== "string" || !input.name.trim()) {
      return Response.json({ message: "用户名不能为空" }, { status: 400 });
    }

    data.name = input.name.trim();
  }

  if ("timeZone" in input) {
    if (!isValidTimeZone(input.timeZone)) {
      return Response.json({ message: "请输入有效的 IANA 时区" }, { status: 400 });
    }

    data.timeZone = input.timeZone;
  }

  if (data.name === undefined && data.timeZone === undefined) {
    return Response.json({ message: "请提供要更新的用户名或时区" }, { status: 400 });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data,
      select: {
        name: true,
        email: true,
        timeZone: true,
      },
    });

    return Response.json({ settings: toSettings(updatedUser) });
  } catch {
    return Response.json({ message: "保存设置失败" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  return update(request);
}

export async function PATCH(request: Request) {
  return update(request);
}
