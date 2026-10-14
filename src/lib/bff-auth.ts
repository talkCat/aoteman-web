import type { NextRequest } from 'next/server';

import { AUTH_COOKIE } from '@/lib/auth';

/**
 * 从 httpOnly Cookie 读取控制面签发的 JWT，生成转发给数据面的 Authorization 头。
 *
 * 数据面 agent.auth.enabled 默认关闭，此时该头可有可无；打开后数据面按下此头还原身份，
 * 忽略接口外墙的另外一个参数来源。未登录返回空对象，保证旧的无鉴权路径仍可用。
 */
export function bearerHeaders(request: NextRequest): Record<string, string> {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}