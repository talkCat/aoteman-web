import { NextRequest, NextResponse } from 'next/server';

import { bearerHeaders } from '@/lib/bff-auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

/**
 * 预览状态 BFF：转发数据面 GET /api/artifacts/preview/status。
 *
 * 服务端契约见 aoteman-platform
 * doc/design/2026-11-06-PPTX转PDF预览-服务端接口需求.md §2.2。
 *
 * 只读、轻量：服务端只读 meta.json，不触发转换，所以前端可以按 1.5s
 * 的节奏轮询而不必担心放大工作区扫描。
 *
 * 非 2xx 不吞：把 { error, code } 原样交给浏览器，前端按 code 分支给文案。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FORWARD_KEYS = ['userId', 'sessionId', 'tenantId', 'turnId', 'retry'] as const;

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams;
  const workspacePath = src.get('workspacePath');
  if (!workspacePath) {
    return NextResponse.json(
      { error: 'workspacePath is required', code: 'BAD_REQUEST' },
      { status: 400 }
    );
  }

  const params = new URLSearchParams({ workspacePath });
  FORWARD_KEYS.forEach(key => {
    const value = src.get(key);
    if (value) params.set(key, value);
  });

  try {
    const res = await fetch(`${BACKEND_URL}/api/artifacts/preview/status?${params.toString()}`, {
      cache: 'no-store',
      headers: bearerHeaders(request),
    });

    const payload = await res.text();
    const headers = new Headers({ 'cache-control': 'no-store' });
    const contentType = res.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    else headers.set('content-type', 'application/json');
    const retryAfter = res.headers.get('retry-after');
    if (retryAfter) headers.set('retry-after', retryAfter);

    return new NextResponse(payload || null, { status: res.status, headers });
  } catch (error) {
    console.error('[Proxy artifact preview status Error]', error);
    return NextResponse.json(
      { error: 'Failed to fetch artifact preview status', code: 'UPSTREAM_UNREACHABLE' },
      { status: 502 }
    );
  }
}