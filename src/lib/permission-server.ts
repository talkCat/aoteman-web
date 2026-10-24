import { NextResponse } from 'next/server';

/**
 * 权限规则 BFF 的共享转发工具（仅服务端）。
 * 设计依据：2026-10-24-智能体后台管理模块设计.md §5。
 */

export const DATA_PLANE_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

/** Spring / 网关默认错误体里的通用原因短语，不能直接当作可读文案展示。 */
const GENERIC_HTTP_MESSAGE =
  /^(Bad\s*Request|Unauthorized|Forbidden|Not\s*Found|Internal\s*Server\s*Error|Service\s*Unavailable|Bad\s*Gateway)$/i;

const STATUS_MESSAGES: Record<number, string> = {
  400: '请求被拒绝：只能把工具收紧为「每次询问 / 拒绝」，且只能选择可配置工具。',
  401: '登录已失效，请重新登录。',
  403: '没有权限执行此操作。',
  404: '规则不存在或已被删除。',
  502: '数据面暂时不可用，请稍后重试。',
  503: '权限服务暂时不可用，请稍后重试。',
};

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function extractDetail(payload: unknown, rawText: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['error', 'message', 'detail'] as const) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  const text = rawText.trim();
  if (text && text.length <= 300 && !text.startsWith('<')) return text;
  return '';
}

/** 读取成功响应体（JSON 或空）。 */
export async function readUpstreamPayload(res: Response): Promise<unknown> {
  return parseJson(await res.text());
}

/** 把数据面的失败响应转换成稳定的中文 JSON 错误，保留上游状态码。 */
export async function proxyPermissionError(
  res: Response,
  fallback = '请求失败',
): Promise<NextResponse> {
  const rawText = await res.text();
  const detail = extractDetail(parseJson(rawText), rawText);
  const message =
    detail && !GENERIC_HTTP_MESSAGE.test(detail)
      ? detail
      : STATUS_MESSAGES[res.status] || `${fallback}（${res.status}）`;
  return NextResponse.json({ error: message }, { status: res.status });
}