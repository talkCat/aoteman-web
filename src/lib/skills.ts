/**
 * 技能广场客户端访问层：统一走 BFF（/api/skills）再转发数据面，
 * 浏览器不直连数据面，后续接入控制面鉴权时只需替换 BFF 的身份注入。
 *
 * 后端契约（aoteman-agent SkillController）：
 * - GET    /api/skills?userId=...          -> SkillView[]
 * - POST   /api/skills/{name}/install?userId=...
 * - DELETE /api/skills/{name}/install?userId=...
 * - POST   /api/skills                     -> multipart zip 上传/覆盖（ADMIN）
 * - GET    /api/skills/{name}/package      -> zip 下载（ADMIN）
 * - DELETE /api/skills/{name}              -> 下架（ADMIN）
 */
import type { SkillItem } from '@/types/skill';

export type { SkillItem } from '@/types/skill';

/** 带 HTTP 状态码的技能接口错误，便于管理页区分 400 / 403 / 5xx。 */
export class SkillRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SkillRequestError';
    this.status = status;
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  400: '技能包不合法或请求有误。',
  401: '登录已失效，请重新登录。',
  403: '需要管理员权限。',
  404: '技能不存在或已被下架。',
  502: '服务暂时不可用，请稍后重试。',
};

function withUserId(userId: string): string {
  return new URLSearchParams({ userId: userId || 'anonymous' }).toString();
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string; detail?: string };
    return data.error || data.message || data.detail || '';
  } catch {
    return '';
  }
}

async function throwForResponse(res: Response, fallback: string): Promise<never> {
  const detail = await parseError(res);
  const message =
    (!detail || /^(Bad Request|Unauthorized|Forbidden|Not Found|Internal Server Error)$/i.test(detail)
      ? STATUS_MESSAGES[res.status] || fallback
      : detail) + (detail ? '' : `（${res.status}）`);
  throw new SkillRequestError(message, res.status);
}

export async function fetchSkills(userId: string): Promise<SkillItem[]> {
  const res = await fetch(`/api/skills?${withUserId(userId)}`, { cache: 'no-store' });
  if (!res.ok) await throwForResponse(res, '加载技能列表失败');
  return (await res.json()) as SkillItem[];
}

export async function installSkill(name: string, userId: string): Promise<void> {
  const res = await fetch(`/api/skills/${encodeURIComponent(name)}/install?${withUserId(userId)}`, {
    method: 'POST',
  });
  if (!res.ok) await throwForResponse(res, '安装失败');
}

export async function uninstallSkill(name: string, userId: string): Promise<void> {
  const res = await fetch(`/api/skills/${encodeURIComponent(name)}/install?${withUserId(userId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) await throwForResponse(res, '卸载失败');
}

/** 上传/覆盖技能（ADMIN）：multipart 单个 zip 包，返回入库后的技能名。 */
export async function uploadSkill(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/skills', { method: 'POST', body: form });
  if (!res.ok) await throwForResponse(res, '上传失败');
  const data = (await res.json()) as { name?: string };
  return data.name ?? file.name.replace(/\.zip$/i, '');
}

/** 下载技能 zip 包（ADMIN），触发浏览器另存为。 */
export async function downloadSkillPackage(name: string): Promise<void> {
  const res = await fetch(`/api/skills/${encodeURIComponent(name)}/package`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) await throwForResponse(res, '下载失败');

  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename\*?=(?:UTF-8''|["']?)([^"';]+)/i.exec(disposition);
  const filename = match?.[1] ? decodeURIComponent(match[1]) : `${name}.zip`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** 下架技能（ADMIN）：删除主数据、资源及所有用户的安装关系。 */
export async function deleteSkill(name: string): Promise<void> {
  const res = await fetch(`/api/skills/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) await throwForResponse(res, '下架失败');
}
