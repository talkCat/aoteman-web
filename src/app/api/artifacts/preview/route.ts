import { NextRequest, NextResponse } from 'next/server';

import { bearerHeaders } from '@/lib/bff-auth';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

/**
 * 预览内容 BFF：转发数据面 GET / HEAD /api/artifacts/preview。
 *
 * 和 `content` 路由的区别（设计 §3.3，三条都不能省）：
 * 1. 透传 `Range` / `If-None-Match` —— 浏览器原生 PDF 查看器按需分段拉取；
 * 2. 透传 `206` / `Content-Range` / `Accept-Ranges` / `ETag` / `Retry-After`；
 * 3. 用 `res.body` 流式转发，绝不能用 `arrayBuffer()` 整包缓冲，
 *    否则 Chromium 会认为响应不完整，表现为白屏或无法翻页。
 *
 * `v` 参数只用于前端防缓存，不转发后端。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FORWARD_KEYS = ['workspacePath', 'userId', 'sessionId', 'tenantId', 'turnId', 'warmup'] as const;

const RESPONSE_HEADERS = [
  'content-type',
  'content-disposition',
  'content-length',
  'content-range',
  'accept-ranges',
  'etag',
  'retry-after',
] as const;

function buildTargetUrl(request: NextRequest): string | null {
  const src = request.nextUrl.searchParams;
  const workspacePath = src.get('workspacePath');
  if (!workspacePath) return null;

  const params = new URLSearchParams({ workspacePath });
  FORWARD_KEYS.forEach(key => {
    const value = src.get(key);
    if (value) params.set(key, value);
  });
  return `${BACKEND_URL}/api/artifacts/preview?${params.toString()}`;
}

async function proxy(request: NextRequest, method: 'GET' | 'HEAD') {
  const target = buildTargetUrl(request);
  if (!target) {
    return NextResponse.json(
      { error: 'workspacePath is required', code: 'BAD_REQUEST' },
      { status: 400 }
    );
  }

  const headers = new Headers(bearerHeaders(request));
  const range = request.headers.get('range');
  if (range) headers.set('range', range);
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch) headers.set('if-none-match', ifNoneMatch);

  let res: Response;
  try {
    res = await fetch(target, { method, cache: 'no-store', headers });
  } catch (error) {
    console.error('[Proxy artifact preview Error]', error);
    return NextResponse.json(
      { error: 'Failed to reach artifact preview service', code: 'UPSTREAM_UNREACHABLE' },
      { status: 502 }
    );
  }

  // 不按 res.ok 分支：202（转换中）、206（分段）、304（协商缓存）
  // 都原样交给浏览器 / 前端，由调用方按状态码自行处理。
  const out = new Headers({ 'cache-control': 'no-store' });
  RESPONSE_HEADERS.forEach(key => {
    const value = res.headers.get(key);
    if (value) out.set(key, value);
  });

  if (method === 'HEAD') {
    return new NextResponse(null, { status: res.status, headers: out });
  }
  return new NextResponse(res.body, { status: res.status, headers: out });
}

export async function GET(request: NextRequest) {
  return proxy(request, 'GET');
}

export async function HEAD(request: NextRequest) {
  return proxy(request, 'HEAD');
}