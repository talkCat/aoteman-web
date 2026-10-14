import { NextRequest, NextResponse } from 'next/server';

import { bearerHeaders } from '@/lib/bff-auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

type RouteContext = { params: Promise<{ name: string }> };

/**
 * 下架技能 BFF（ADMIN）：转发数据面 DELETE /api/skills/{name}。
 * 数据面会执行删除主数据 + 级联资源 + 清理所有用户安装关系。
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { name } = await context.params;
    const url = `${BACKEND_URL}/api/skills/${encodeURIComponent(name)}`;

    const res = await fetch(url, {
      method: 'DELETE',
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
    console.error('[Proxy skill delete Error]', error);
    return NextResponse.json({ error: 'Failed to delete skill' }, { status: 502 });
  }
}