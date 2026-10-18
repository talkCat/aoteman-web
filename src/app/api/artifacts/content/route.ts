import { NextRequest, NextResponse } from 'next/server';

import { bearerHeaders } from '@/lib/bff-auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

/**
 * 产物内容 BFF：转发数据面 GET / HEAD /api/artifacts/content。
 *
 * 直接透传字节流，并保留后端设置的 content-type / content-disposition，
 * 使前端既能取文本做 Markdown 预览，也能按附件下载。
 * 设计依据：doc/design/2026-10-15 智能体产物预览与沙箱适配设计.md §15.4。
 */
function buildTargetUrl(request: NextRequest): string | null {
  const src = request.nextUrl.searchParams;
  const workspacePath = src.get('workspacePath');
  if (!workspacePath) return null;

  const params = new URLSearchParams({ workspacePath });
  (['userId', 'sessionId', 'tenantId', 'download'] as const).forEach(key => {
    const value = src.get(key);
    if (value) params.set(key, value);
  });
  return `${BACKEND_URL}/api/artifacts/content?${params.toString()}`;
}

async function proxy(request: NextRequest, method: 'GET' | 'HEAD') {
  const target = buildTargetUrl(request);
  if (!target) {
    return NextResponse.json({ error: 'workspacePath is required' }, { status: 400 });
  }
  try {
    const res = await fetch(target, {
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

    const headers = new Headers({ 'cache-control': 'no-store' });
    ['content-type', 'content-disposition', 'content-length'].forEach(key => {
      const value = res.headers.get(key);
      if (value) headers.set(key, value);
    });

    if (method === 'HEAD') {
      return new NextResponse(null, { status: res.status, headers });
    }
    return new NextResponse(await res.arrayBuffer(), { status: res.status, headers });
  } catch (error) {
    console.error('[Proxy artifact content Error]', error);
    return NextResponse.json({ error: 'Failed to fetch artifact content' }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  return proxy(request, 'GET');
}

export async function HEAD(request: NextRequest) {
  return proxy(request, 'HEAD');
}