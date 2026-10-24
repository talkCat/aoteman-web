import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { AUTH_COOKIE, controlPlaneBaseUrl, type AuthUser } from '@/lib/auth';

/**
 * 服务端身份解析：BFF 只信任 httpOnly Cookie 中的 JWT，
 * 通过控制面 /api/user/me 换取当前用户，绝不采信前端自报的 userId。
 * 设计依据：2026-10-24-智能体后台管理模块设计.md §5 / §6。
 */
export class CurrentUserError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'CurrentUserError';
    this.status = status;
  }
}

export async function resolveCurrentUser(request: NextRequest): Promise<AuthUser> {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) {
    throw new CurrentUserError(401, '未登录，请先登录');
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${controlPlaneBaseUrl()}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch (error) {
    console.error('[bff/current-user] 控制面不可达:', error);
    throw new CurrentUserError(502, '暂时无法验证登录状态，请稍后重试');
  }

  if (!upstream.ok) {
    if (upstream.status === 401) {
      throw new CurrentUserError(401, '登录已失效，请重新登录');
    }
    throw new CurrentUserError(502, `身份服务返回 ${upstream.status}`);
  }

  const user = (await upstream.json()) as AuthUser | null;
  if (!user?.userId) {
    throw new CurrentUserError(502, '身份服务返回了无效的用户信息');
  }
  return user;
}

/** 把身份解析失败统一转换成可读的 JSON 响应。 */
export function currentUserErrorResponse(error: unknown): NextResponse {
  if (error instanceof CurrentUserError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error('[bff/current-user] 未预期错误:', error);
  return NextResponse.json({ error: '服务暂时不可用，请稍后重试' }, { status: 502 });
}

/** 仅 ADMIN 可执行的操作：解析 Cookie 身份并校验角色，失败抛 401 / 403。 */
export async function requireAdmin(request: NextRequest): Promise<AuthUser> {
  const user = await resolveCurrentUser(request);
  if (!user.roles?.includes('ADMIN')) {
    throw new CurrentUserError(403, '需要管理员权限');
  }
  return user;
}
