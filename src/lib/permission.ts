'use client';

import type {
  PermissionCatalogItem,
  PermissionRule,
  PermissionRuleInput,
  PermissionRuleUpsertResult,
} from '@/types/permission';

/** BFF 返回的错误（status 用于区分 400 / 401 / 502 等）。 */
export class PermissionRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'PermissionRequestError';
    this.status = status;
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  400: '请求被拒绝：只能把工具收紧为「每次询问 / 拒绝」，且只能选择可配置工具。',
  401: '登录已失效，请重新登录。',
  403: '没有权限执行此操作。',
  404: '规则不存在或已被删除。',
  502: '服务暂时不可用，请稍后重试。',
  503: '权限服务暂时不可用，请稍后重试。',
};

/** Spring 默认错误体里的通用原因短语，不能直接当作可读文案展示。 */
const GENERIC_HTTP_MESSAGE =
  /^(Bad\s*Request|Unauthorized|Forbidden|Not\s*Found|Internal\s*Server\s*Error|Service\s*Unavailable|Bad\s*Gateway)$/i;

async function parseMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string; detail?: string };
    return data.error || data.message || data.detail || '';
  } catch {
    return '';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init });

  if (!res.ok) {
    const detail = await parseMessage(res);
    const message =
      detail && !GENERIC_HTTP_MESSAGE.test(detail)
        ? detail
        : STATUS_MESSAGES[res.status] || `请求失败（${res.status}）`;
    throw new PermissionRequestError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** 只读工具目录。 */
export function fetchPermissionCatalog(): Promise<PermissionCatalogItem[]> {
  return request<PermissionCatalogItem[]>('/api/permission-rules/catalog');
}

/** 当前登录用户的规则列表（userId 由 BFF 解析）。 */
export function fetchPermissionRules(): Promise<PermissionRule[]> {
  return request<PermissionRule[]>('/api/permission-rules');
}

/** 新增 / 更新一条规则（同一工具重复提交即更新）。 */
export function upsertPermissionRule(input: PermissionRuleInput): Promise<PermissionRuleUpsertResult> {
  return request<PermissionRuleUpsertResult>('/api/permission-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** 删除一条本人规则。 */
export function deletePermissionRule(ruleId: number): Promise<void> {
  return request<void>(`/api/permission-rules/${ruleId}`, { method: 'DELETE' });
}