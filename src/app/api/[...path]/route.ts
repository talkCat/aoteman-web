import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { controlPlaneBaseUrl } from '@/lib/auth';
import { bearerHeaders } from '@/lib/bff-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 控制面 BFF 代理（知识库 / 专家模块）。
 *
 * 为什么用同源 `/api/**` 而不是让浏览器直连 8081：
 * - JWT 只存在 httpOnly Cookie 里，页面 JS 读不到，必须由 BFF 换成 Authorization；
 * - `/internal/**` 用 X-Internal-Token 做服务间鉴权，绝不能下发到浏览器。
 *
 * 只放行明确允许的路径前缀（admin / experts / knowledge），其余一律 404，
 * 避免把「未知路径」原样透传到控制面。静态路由（/api/auth、/api/skills 等）
 * 由 Next 的段优先级匹配，不会落到这个 catch-all。
 *
 * 设计依据：doc/design/2026-11-04-知识库与专家模块-前端接口清单.md §0.1 / §0.2 / §8。
 */
const ALLOWED_PREFIXES = new Set(['admin', 'experts', 'knowledge']);

/** 只透传与语义相关的响应头；content-length / content-encoding 交给运行时重算。 */
const RESPONSE_HEADERS = ['content-type', 'content-disposition', 'cache-control', 'etag', 'last-modified'];

type RouteContext = { params: Promise<{ path?: string[] }> };

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const segments = path ?? [];

  if (segments.length === 0 || !ALLOWED_PREFIXES.has(segments[0])) {
    return NextResponse.json(
      { code: 'NOT_FOUND', message: '接口不存在' },
      { status: 404 },
    );
  }

  // 显式拦掉 /api/internal/**：即使将来有人放宽前缀，内部凭证也不能出网。
  if (segments[0] === 'internal' || segments.includes('internal')) {
    return NextResponse.json(
      { code: 'NOT_FOUND', message: '接口不存在' },
      { status: 404 },
    );
  }

  const target = `${controlPlaneBaseUrl()}/api/${segments.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  const headers: Record<string, string> = { ...bearerHeaders(request) };

  const contentType = request.headers.get('content-type');
  if (contentType) headers['content-type'] = contentType;
  const accept = request.headers.get('accept');
  if (accept) headers.accept = accept;

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Node fetch 流式转发请求体（multipart 上传大文件）时必须显式声明半双工。
      ...(hasBody ? { duplex: 'half' } : {}),
      cache: 'no-store',
      redirect: 'manual',
    } as RequestInit);
  } catch (error) {
    console.error('[bff/controlplane] 控制面不可达:', error);
    return NextResponse.json(
      { code: 'UPSTREAM_UNAVAILABLE', message: '服务暂时不可用，请稍后重试' },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  if (!responseHeaders.has('content-type')) {
    responseHeaders.set('content-type', 'application/json; charset=utf-8');
  }

  // 204 / 304 不能带响应体，否则 undici 会抛错。
  const body = upstream.status === 204 || upstream.status === 304 ? null : upstream.body;

  return new Response(body, { status: upstream.status, headers: responseHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;