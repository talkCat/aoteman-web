/**
 * 产物预览客户端访问层：统一走 BFF（/api/artifacts）再转发数据面，浏览器不直连数据面。
 *
 * 后端契约（aoteman-agent ArtifactController）：
 * - GET  /api/artifacts?userId=&sessionId=&prefix=              -> ArtifactItem[]
 * - GET  /api/artifacts/content?userId=&sessionId=&workspacePath=&download=
 * - HEAD /api/artifacts/content?userId=&sessionId=&workspacePath=
 *
 * 本轮只落地 Markdown（.md/.markdown），
 * 见 doc/design/2026-10-15 智能体产物预览与沙箱适配设计.md §15。
 */
import type { ToolUse } from '@/types/agent';

/** 与后端 ArtifactMetadata 对应。 */
export interface ArtifactItem {
  id: string;
  workspacePath: string;
  turnId: string | null;
  size: number;
  mimeType: string;
  previewable: boolean;
  downloadable: boolean;
  contentType: string;
  contentDisposition: string;
  modifiedAt: number;
}

/** 会落盘产出业务的写入类工具。 */
const WRITE_TOOLS = new Set(['write_file', 'edit_file']);

function withUser(userId: string, sessionId?: string): URLSearchParams {
  const params = new URLSearchParams({ userId: userId || 'anonymous' });
  if (sessionId) params.set('sessionId', sessionId);
  return params;
}

/** 列出当前用户工作区内的 Markdown 产物元数据（服务端已按最后修改时间倒序）。 */
export async function fetchArtifacts(
  userId: string,
  sessionId?: string,
  prefix?: string
): Promise<ArtifactItem[]> {
  const params = withUser(userId, sessionId);
  if (prefix) params.set('prefix', prefix);
  const res = await fetch(`/api/artifacts?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) {
    const detail = await parseError(res);
    throw new Error(detail || `加载产物列表失败（${res.status}）`);
  }
  return (await res.json()) as ArtifactItem[];
}

/** 读取单个产物内容（Markdown 文本）。 */
export async function fetchArtifactContent(
  userId: string,
  sessionId: string | undefined,
  workspacePath: string
): Promise<string> {
  const res = await fetch(artifactContentUrl(userId, sessionId, workspacePath), {
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await parseError(res);
    throw new Error(detail || `加载产物内容失败（${res.status}）`);
  }
  return await res.text();
}

/** 构造产物内容 / 下载的 BFF 地址（同源，浏览器自动带上鉴权 Cookie）。 */
export function artifactContentUrl(
  userId: string,
  sessionId: string | undefined,
  workspacePath: string,
  download = false
): string {
  const params = withUser(userId, sessionId);
  params.set('workspacePath', workspacePath);
  if (download) params.set('download', 'true');
  return `/api/artifacts/content?${params.toString()}`;
}

/** 文件名：取 workspacePath 的最后一段。 */
export function artifactFileName(workspacePath: string): string {
  const normalized = workspacePath.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  return slash < 0 ? normalized : normalized.slice(slash + 1);
}

function parseToolPath(input: string): string | null {
  try {
    const parsed = JSON.parse(input) as { path?: unknown };
    return typeof parsed.path === 'string' ? parsed.path : null;
  } catch {
    return null;
  }
}

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\.?\//, '')
    .toLowerCase();
}

/** 是否为「会产出 Markdown 的写入工具调用」（write_file / edit_file + .md/.markdown）。 */
export function isMarkdownArtifactWrite(toolUse: ToolUse): boolean {
  if (!WRITE_TOOLS.has(toolUse.name)) return false;
  const path = parseToolPath(toolUse.input);
  return Boolean(path && /\.(md|markdown)$/i.test(path));
}

/**
 * 从本回合的工具调用推导「本轮产物」（设计 §15.1）。
 *
 * 模型写入的 input.path 可能是绝对路径或带前缀的相对路径，未必等于后端返回的
 * workspacePath，因此按「路径段边界上的后缀」双向对齐匹配。
 */
export function matchTurnArtifacts(toolUses: ToolUse[], all: ArtifactItem[]): ArtifactItem[] {
  const wanted: string[] = [];
  toolUses.forEach(toolUse => {
    if (!isMarkdownArtifactWrite(toolUse)) return;
    const path = parseToolPath(toolUse.input);
    if (!path) return;
    const normalized = normalizePath(path);
    if (normalized && !wanted.includes(normalized)) wanted.push(normalized);
  });
  if (wanted.length === 0) return [];

  const matched: ArtifactItem[] = [];
  const seen = new Set<string>();
  all.forEach(item => {
    const rel = normalizePath(item.workspacePath);
    if (!rel) return;
    const hit = wanted.some(w => w === rel || w.endsWith(`/${rel}`) || rel.endsWith(`/${w}`));
    if (hit && !seen.has(item.workspacePath)) {
      seen.add(item.workspacePath);
      matched.push(item);
    }
  });
  return matched;
}

async function parseError(res: Response): Promise<string | null> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error || data.message || null;
  } catch {
    return null;
  }
}