import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

/**
 * 技能广场列表 BFF：转发数据面 GET /api/skills。
 *
 * 与既有 /api/sessions 代理一致：前端不直连数据面，BFF 拼基址 / 透传 userId，
 * 未来接入控制面鉴权（P2）时在此注入真实身份、丢弃客户端直传参数。
 * 设计依据：doc/design/2026-10-14-技能广场前端.md §4。
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId') || 'anonymous';
    const url = `${BACKEND_URL}/api/skills?userId=${encodeURIComponent(userId)}`;

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
    console.error('[Proxy skills Error]', error);
    return NextResponse.json(
      { error: 'Failed to fetch skills from backend' },
      { status: 502 }
    );
  }
}
