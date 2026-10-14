import { NextRequest, NextResponse } from 'next/server';

import { bearerHeaders } from '@/lib/bff-auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

type RouteContext = { params: Promise<{ name: string }> };

/**
 * 下载技能 zip 包 BFF（ADMIN）：转发数据面 GET /api/skills/{name}/package。
 * 直接透传 zip 字节流，保留登录态注入的 Authorization。
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { name } = await context.params;
    const url = `${BACKEND_URL}/api/skills/${encodeURIComponent(name)}/package`;

    const res = await fetch(url, {
      method: 'GET',
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

    const body = await res.arrayBuffer();
    const headers = new Headers();
    const contentType = res.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    const contentDisposition = res.headers.get('content-disposition');
    if (contentDisposition) headers.set('content-disposition', contentDisposition);

    return new NextResponse(body, { status: res.status, headers });
  } catch (error) {
    console.error('[Proxy skill package Error]', error);
    return NextResponse.json({ error: 'Failed to download skill package' }, { status: 502 });
  }
}