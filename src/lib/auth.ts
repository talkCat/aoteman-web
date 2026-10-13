/**
 * 鉴权相关的共享常量与类型（BFF 路由与 middleware 共用）。
 *
 * 设计依据：doc/design/2026-10-13-登录界面与预制账号设计.md（D1 / D2 / D5）。
 * - Token 只存在 httpOnly Cookie 里，页面 JS 读不到（防 XSS）；
 * - 真正的校验交给控制面，前端只负责「带 Cookie 转发」。
 */

/** 存放控制面 JWT 的 Cookie 名。 */
export const AUTH_COOKIE = "aoteman_token";

/** Cookie 有效期（秒）——与控制面 Token TTL 对齐（7 天）。 */
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * 控制面（aoteman-controlplane，默认 8081）基址。
 * 只在服务端 BFF 里调用，不暴露给浏览器。
 */
export function controlPlaneBaseUrl(): string {
  return process.env.CONTROL_PLANE_BASE_URL || "http://localhost:8081";
}

/** 控制面返回的用户视图（对应后端 UserView，绝不含口令哈希）。 */
export type AuthUser = {
  userId: string;
  username: string;
  displayName: string | null;
  email: string | null;
  status: string;
  roles: string[];
  createdAt: number;
};
