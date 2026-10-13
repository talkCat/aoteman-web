import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

/**
 * 会话列表 BFF：转发数据面 GET /api/sessions。
 *
 * 与既有 /api/sessions/{id}/events 代理一致——前端不直连数据面，
 * BFF 负责拼基址 / 透传 userId，未来接入控制面鉴权时在此注入身份。
 * 设计依据：doc/design/2026-10-13-用户会话列表与历史记录设计.md §4.2。
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId') || 'anonymous';
    const limit = searchParams.get('limit') || '50';

    const query = new URLSearchParams({ userId, limit });
    const url = `${BACKEND_URL}/api/sessions?${query}`;

    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Proxy GET sessions Error]', error);
    return NextResponse.json(
      { error: 'Failed to fetch sessions from backend' },
      { status: 502 }
    );
  }
}
