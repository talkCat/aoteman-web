import { NextRequest, NextResponse } from 'next/server';

import { bearerHeaders } from '@/lib/bff-auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

/**
 * 产物列表 BFF：转发数据面 GET /api/artifacts。
 *
 * userId 在 agent.auth.enabled=false 时仍需透传（数据面按参数识别用户）；
 * 打开鉴权后数据面忽略该参数，改从 Authorization: Bearer 取 sub。
 * 设计依据：doc/design/2026-10-15 智能体产物预览与沙箱适配设计.md §15.4。
 */
export async function GET(request: NextRequest) {
  try {
    const src = request.nextUrl.searchParams;
    const params = new URLSearchParams({ userId: src.get('userId') || 'anonymous' });
    (['sessionId', 'tenantId', 'turnId', 'prefix'] as const).forEach(key => {
      const value = src.get(key);
      if (value) params.set(key, value);
    });

    const res = await fetch(`${BACKEND_URL}/api/artifacts?${params.toString()}`, {
      cache: 'no-store',
      headers: bearerHeaders(request),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status }
      );
    }

    return NextResponse.json(await res.json());
  } catch (error) {
    console.error('[Proxy artifacts Error]', error);
    return NextResponse.json({ error: 'Failed to fetch artifacts from backend' }, { status: 502 });
  }
}