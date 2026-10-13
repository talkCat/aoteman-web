import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, controlPlaneBaseUrl } from "@/lib/auth";

export const runtime = "nodejs";

/** 取当前用户 BFF：读 httpOnly Cookie → 带 Bearer 转发到控制面 /api/user/me。 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ code: "UNAUTHENTICATED", message: "未登录" }, { status: 401 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${controlPlaneBaseUrl()}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (error) {
    console.error("[auth/me] 控制面不可达:", error);
    return NextResponse.json(
      { code: "UPSTREAM_UNAVAILABLE", message: "服务暂时不可用，请稍后重试" },
      { status: 502 }
    );
  }

  const text = await upstream.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!upstream.ok) {
    const response = NextResponse.json(payload ?? { code: "UNAUTHENTICATED" }, { status: upstream.status });
    // Token 失效 / 过期：顺手清掉 Cookie，避免反复带着死 Token 请求。
    if (upstream.status === 401) {
      response.cookies.set({
        name: AUTH_COOKIE,
        value: "",
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        secure: process.env.NODE_ENV === "production",
      });
    }
    return response;
  }

  return NextResponse.json(payload);
}
