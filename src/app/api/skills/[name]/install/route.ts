import { NextRequest, NextResponse } from 'next/server';

import { bearerHeaders } from '@/lib/bff-auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

type RouteContext = { params: Promise<{ name: string }> };

/**
 * 安装 / 卸载技能 BFF：转发数据面 POST/DELETE /api/skills/{name}/install。
 * userId 当前以 query 透传，P2 同时注入 Cookie 解析出的 Authorization，
 * 供 agent.auth.enabled=true 时数据面还原真实身份（query 参数被忽略）。
 */
async function proxy(
  request: NextRequest,
  context: RouteContext,
  method: 'POST' | 'DELETE'
) {
  try {
    const { name } = await context.params;
    const userId = request.nextUrl.searchParams.get('userId') || 'anonymous';

    const url = `${BACKEND_URL}/api/skills/${encodeURIComponent(name)}/install?userId=${encodeURIComponent(userId)}`;
    const res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: bearerHeaders(request),
    });

    if (!res.ok) {
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      return NextResponse.json(
        payload ?? { error: `Backend returned ${res.status}` },
        { status: res.status }
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[Proxy skill install Error]', error);
    return NextResponse.json({ error: 'Failed to proxy skill install' }, { status: 502 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context, 'POST');
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxy(request, context, 'DELETE');
}