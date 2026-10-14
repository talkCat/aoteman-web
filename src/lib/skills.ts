/**
 * 技能广场客户端访问层：统一走 BFF（/api/skills）再转发数据面，
 * 浏览器不直连数据面，P2 接入控制面鉴权时只需替换 BFF 的身份注入。
 *
 * 后端契约（aoteman-agent SkillController）：
 * - GET    /api/skills?userId=...          -> SkillView[]
 * - POST   /api/skills/{name}/install?userId=...
 * - DELETE /api/skills/{name}/install?userId=...
 * - POST   /api/skills                     -> multipart zip 上传/覆盖（ADMIN）
 * - GET    /api/skills/{name}/package      -> zip 下载（ADMIN）
 * - DELETE /api/skills/{name}              -> 下架（ADMIN）
 */
export interface SkillItem {
  name: string;
  description: string;
  source: string;
  installed: boolean;
}

function withUserId(userId: string): string {
  return new URLSearchParams({ userId: userId || 'anonymous' }).toString();
}

export async function fetchSkills(userId: string): Promise<SkillItem[]> {
  const res = await fetch(`/api/skills?${withUserId(userId)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`加载技能列表失败（${res.status}）`);
  return (await res.json()) as SkillItem[];
}

export async function installSkill(name: string, userId: string): Promise<void> {
  const res = await fetch(`/api/skills/${encodeURIComponent(name)}/install?${withUserId(userId)}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`安装失败（${res.status}）`);
}

export async function uninstallSkill(name: string, userId: string): Promise<void> {
  const res = await fetch(`/api/skills/${encodeURIComponent(name)}/install?${withUserId(userId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`卸载失败（${res.status}）`);
}

/** 上传/覆盖技能（ADMIN）：multipart 单个 zip 包，返回入库后的技能名。 */
export async function uploadSkill(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/skills', { method: 'POST', body: form });
  if (!res.ok) {
    const detail = await parseError(res);
    throw new Error(detail || `上传失败（${res.status}）`);
  }
  const data = (await res.json()) as { name?: string };
  return data.name ?? file.name.replace(/\.zip$/i, '');
}

/** 下载技能 zip 包（ADMIN），触发浏览器另存为。 */
export async function downloadSkillPackage(name: string): Promise<void> {
  const res = await fetch(`/api/skills/${encodeURIComponent(name)}/package`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await parseError(res);
    throw new Error(detail || `下载失败（${res.status}）`);
  }

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
  if (!res.ok) {
    const detail = await parseError(res);
    throw new Error(detail || `下架失败（${res.status}）`);
  }
}

async function parseError(res: Response): Promise<string | null> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error || data.message || null;
  } catch {
    return null;
  }
}