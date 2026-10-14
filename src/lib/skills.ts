/**
 * 技能广场客户端访问层：统一走 BFF（/api/skills）再转发数据面，
 * 浏览器不直连数据面，P2 接入控制面鉴权时只需替换 BFF 的身份注入。
 *
 * 后端 P1 契约（aoteman-agent SkillController）：
 * - GET  /api/skills?userId=...          -> SkillView[]
 * - POST /api/skills/{name}/install?userId=...
 * - DELETE /api/skills/{name}/install?userId=...
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
