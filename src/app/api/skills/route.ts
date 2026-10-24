import { NextRequest, NextResponse } from 'next/server';

import { bearerHeaders } from '@/lib/bff-auth';
import {
  CurrentUserError,
  currentUserErrorResponse,
  requireAdmin,
} from '@/lib/current-user';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

/**
 * 技能广场 BFF：转发数据面 /api/skills。
 *
 * - GET：广场列表（附当前用户安装状态）；
 * - POST：上传 / 覆盖技能（ADMIN，multipart zip）。
 *
 * userId 在 agent.auth.enabled=false 时仍需透传（数据面按参数识别用户）；
 * 打开鉴权后数据面忽略该参数，改从 Authorization: Bearer 取 sub。
 * 设计依据：doc/design/2026-10-14-技能广场设计.md §5 / §6。
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId') || 'anonymous';
    const url = `${BACKEND_URL}/api/skills?userId=${encodeURIComponent(userId)}`;

    const res = await fetch(url, { cache: 'no-store', headers: bearerHeaders(request) });

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

export async function POST(request: NextRequest) {
  try {
    // ADMIN 专属：P1 数据面未开鉴权时，由 BFF 兜底校验角色。
    await requireAdmin(request);
    const form = await request.formData();
    const res = await fetch(`${BACKEND_URL}/api/skills`, {
      method: 'POST',
      headers: bearerHeaders(request),
      body: form,
    });

    const text = await res.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }

    if (!res.ok) {
      return NextResponse.json(
        payload ?? { error: `Backend returned ${res.status}` },
        { status: res.status }
      );
    }

    return NextResponse.json(payload ?? {});
  } catch (error) {
    if (error instanceof CurrentUserError) {
      return currentUserErrorResponse(error);
    }
    console.error('[Proxy skill upload Error]', error);
    return NextResponse.json({ error: 'Failed to upload skill' }, { status: 502 });
  }
}