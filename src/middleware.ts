import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/** 存放控制面 JWT 的 Cookie 名（与 src/lib/auth.ts 的 AUTH_COOKIE 保持一致）。 */
const AUTH_COOKIE = 'aoteman_token'

/**
 * 公开路径：无需登录即可直达。
 * - /login       登录页本身（否则会无限重定向）
 * - /zoer_proxy  Zoer 内嵌代理页（iframe 预览需要直出，见设计 §3.6）
 */
function isPublicPath(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/zoer_proxy')
}

/**
 * 判断是否为「顶层导航」。
 *
 * 软守卫（设计 §3.6 决策 B）只拦顶层导航：
 * - 顶层导航：`sec-fetch-dest: document`（现代浏览器）
 * - iframe 内嵌：`sec-fetch-dest: iframe` -> 放行，保证内嵌预览不被踢到登录页
 * - 静态资源 / fetch / RSC：`empty | image | script | style ...` -> 放行
 * - 老浏览器不带 Sec-Fetch-*：保守视为顶层导航
 */
function isTopLevelNavigation(request: NextRequest): boolean {
  const dest = request.headers.get('sec-fetch-dest')
  if (dest) return dest === 'document'
  const mode = request.headers.get('sec-fetch-mode')
  if (mode) return mode === 'navigate'
  return true
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const response = NextResponse.next()

  // 保留原有行为：允许 iframe 嵌入
  response.headers.set('X-Frame-Options', 'ALLOWALL')
  response.headers.set('Content-Security-Policy', 'frame-ancestors *')

  if (isPublicPath(pathname)) return response

  // 软守卫：仅「无 cookie 且是顶层导航」时跳登录页；真正的有效性校验交给 /api/auth/me
  const hasToken = Boolean(request.cookies.get(AUTH_COOKIE)?.value)
  if (hasToken || !isTopLevelNavigation(request)) return response

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = ''
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)',
}
