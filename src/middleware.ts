import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { DEV_PREVIEW_COOKIE } from '@/lib/dev-preview'

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
 * 带扩展名的静态资源（public/ 下的图片、字体等）不做登录守卫。
 *
 * 必要性：next/image 的优化器是在**服务端**回源 `/brand/xxx.png`，
 * 该请求不带 Sec-Fetch-*，会被下面的软守卫当成顶层导航重定向到 /login，
 * 导致优化器拿到 HTML 后报「The requested resource isn't a valid image」。
 * 带扩展名的路径不可能是 App Router 页面，放行不影响登录保护。
 */
function isStaticAsset(pathname: string): boolean {
  return /\.[a-z0-9]{2,5}$/i.test(pathname)
}

/**
 * 开发期静态预览放行：`?preview=1` 或预览 Cookie，且非生产构建时，允许无鉴权 Cookie 的顶层导航直接进入。
 *
 * 为什么放在 middleware：`/?preview=1` 与 `/admin/**?preview=1` 的演示数据逻辑都在页面内，
 * 但顶层导航会先被下面的软守卫重定向到 /login，页面来不及读取 preview 参数。
 *
 * 为什么还要认 Cookie：`?preview=1` 只挂在首次进入的那条 URL 上，整页刷新（F5）会丢掉 query，
 * 而 sessionStorage 只有浏览器端能读、middleware 读不到，于是刷新一次就被软守卫踢回 /login。
 * 首次带参数进入时页面会写这个开发专用 Cookie，刷新 / 新标签页都能继续留在预览模式。
 *
 * 安全性：条件里含 `NODE_ENV !== 'production'`，`next build` 会在编译期把它折叠为 false，
 * 线上不存在这条旁路；该 Cookie 不是鉴权凭证，只影响登录守卫放行；
 * 且 matcher 已排除 /api/**，不会影响真实接口鉴权。
 */
function isDevPreview(search: string, cookieValue: string | undefined): boolean {
  if (process.env.NODE_ENV === 'production') return false
  if (cookieValue === '1') return true
  return new URLSearchParams(search).get('preview') === '1'
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

  if (isPublicPath(pathname) || isStaticAsset(pathname) || isDevPreview(request.nextUrl.search, request.cookies.get(DEV_PREVIEW_COOKIE)?.value)) {
    return response
  }

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
