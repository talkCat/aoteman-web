import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, AUTH_COOKIE_MAX_AGE, controlPlaneBaseUrl } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * 登录 BFF：浏览器只调这里，由服务端转发到控制面并在成功后写入 httpOnly Cookie。
 *
 * - 成功：响应体只回 `{ user }`，Token 绝不进响应体（它只存在于 Cookie 里）；
 * - 失败：透传控制面的稳定错误码（INVALID_CREDENTIALS / USER_DISABLED ...）。
 */
export async function POST(request: NextRequest) {
  let username = "";
  let password = "";
  try {
    const body = (await request.json()) as { username?: unknown; password?: unknown };
    username = typeof body?.username === "string" ? body.username : "";
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json(
      { code: "INVALID_REQUEST", message: "请求格式不正确" },
      { status: 400 }
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${controlPlaneBaseUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[auth/login] 控制面不可达:", error);
    return NextResponse.json(
      { code: "UPSTREAM_UNAVAILABLE", message: "服务暂时不可用，请稍后重试" },
      { status: 502 }
    );
  }

  const text = await upstream.text();
  let payload: Record<string, unknown> = {};
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // 非 JSON 响应（如网关错误页）：保持空对象，下面按错误码兜底
    }
  }

  if (!upstream.ok) {
    return NextResponse.json(payload, { status: upstream.status });
  }

  const token = typeof payload.token === "string" ? payload.token : "";
  if (!token) {
    return NextResponse.json(
      { code: "LOGIN_FAILED", message: "登录失败，请稍后重试" },
      { status: 502 }
    );
  }

  const response = NextResponse.json({ user: payload.user ?? null });
  response.cookies.set({
    name: AUTH_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
