import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

/**
 * 会话级 BFF：转发数据面的「删除会话」与「重命名标题」。
 *
 * 与 /api/sessions 列表代理同源：前端不直连数据面，BFF 拼基址 / 透传 userId，
 * 未来接入控制面鉴权时在此注入身份。
 * 设计依据：doc/design/2026-10-13-会话删除与标题重命名设计.md §5。
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const userId = request.nextUrl.searchParams.get('userId') || 'anonymous';

    const res = await fetch(
      `${BACKEND_URL}/api/sessions/${sessionId}?userId=${encodeURIComponent(userId)}`,
      { method: 'DELETE', cache: 'no-store' }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status }
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[Proxy DELETE session Error]', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 502 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const body = await request.json();
    const { userId, title } = body ?? {};

    if (!userId || typeof title !== 'string') {
      return NextResponse.json(
        { error: 'Missing required fields: userId or title' },
        { status: 400 }
      );
    }

    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, title }),
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status }
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[Proxy PATCH session Error]', error);
    return NextResponse.json({ error: 'Failed to rename session' }, { status: 502 });
  }
}
