/**
 * 开发期静态预览标记（浏览器端与 middleware 共用）。
 *
 * 控制面 / 数据面未启动时，用 `?preview=1` 进入演示数据模式。只靠 query 参数有两个问题：
 * 1. 站内整页刷新（F5）会丢掉 query；
 * 2. 新标签页直接打开 `/admin/**` 时也没有 query。
 * 因此首次带参数进入时额外写一个开发专用 Cookie，让 middleware 能放行顶层导航。
 *
 * 该 Cookie **不是鉴权凭证**：middleware 只在 `NODE_ENV !== 'production'` 时才认它，
 * 生产构建下这条判断会被编译期折叠，线上即使手工写入也无效。
 */
export const DEV_PREVIEW_COOKIE = "aoteman_dev_preview";

/** 预览标记有效期（秒）：足够一次走查，关掉浏览器后自然过期。 */
export const DEV_PREVIEW_MAX_AGE = 60 * 60 * 8;

/** 与服务端保持一致：只有非生产构建才启用预览旁路。 */
function isDevEnvironment(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** 读取浏览器里的预览标记 Cookie（仅客户端调用）。 */
export function hasDevPreviewCookie(): boolean {
  if (!isDevEnvironment() || typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((item) => item.trim() === `${DEV_PREVIEW_COOKIE}=1`);
}

/** 写入预览标记 Cookie，让整页刷新 / 新标签页也能保持在预览模式。 */
export function enableDevPreviewCookie(): void {
  if (!isDevEnvironment() || typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${DEV_PREVIEW_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=${DEV_PREVIEW_MAX_AGE}${secure}`;
}

/** 退出预览：立刻让 Cookie 过期。 */
export function disableDevPreviewCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${DEV_PREVIEW_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`;
}
