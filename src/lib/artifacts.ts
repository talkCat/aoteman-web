/**
 * 产物预览客户端访问层：统一走 BFF（/api/artifacts）再转发数据面，浏览器不直连数据面。
 *
 * 后端契约（aoteman-agent ArtifactController）：
 * - GET  /api/artifacts?userId=&sessionId=&prefix=              -> ArtifactItem[]
 * - GET  /api/artifacts/content?userId=&sessionId=&workspacePath=&download=
 * - HEAD /api/artifacts/content?userId=&sessionId=&workspacePath=
 *
 * 预览能力：Markdown / 纯文本读正文，PPTX 走「PPTX → PDF」通道，
 * 见 doc/design/2026-10-15 智能体产物预览与沙箱适配设计.md §15、
 * doc/design/2026-11-06-PPTX转PDF预览-前端对接方案.md、
 * doc/design/2026-11-06-本轮产物尾部快捷预览.md。
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
  /**
   * 预览通道（服务端 2026-11-06 新增，老服务端不返回）。
   * `pdf` 表示存在「PPTX → PDF」通道，不代表已就绪，就绪与否看 previewStatus。
   */
  previewKind?: PreviewKind;
  previewStatus?: PreviewStatus;
  previewErrorCode?: string | null;
  previewUpdatedAt?: number;
}

/** 服务端商品预览通道类型。 */
export type PreviewKind = 'none' | 'pdf';

/**
 * 预览状态机（服务端契约 §2.4）：
 * none 无预览通道 / pending 待转换 / converting 转换中 / ready 就绪 / failed 失败。
 */
export type PreviewStatus = 'none' | 'pending' | 'converting' | 'ready' | 'failed';

/**
 * 产物类型。
 * - markdown：渲染正文（.md/.markdown/.mdx）
 * - text：纯文本类，等宽渲染 + 复制，不解析语法（txt/json/yaml/csv/html/js/py/sql/log…）
 * - pptx：二进制，走「PPTX → PDF」预览通道
 * - other：不可内嵌预览，只保留下载
 */
export type ArtifactKind = 'markdown' | 'pptx' | 'text' | 'other';

const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdx'] as const;

/**
 * 纯文本类扩展名（后端放开 isSupported 时按这份清单对齐）。
 *
 * 服务端当前只登记 .md/.pptx，这里提前纳入识别：后端放开后前端无需再改；
 * 后端未放开前这些文件根本不会出现在 /api/artifacts 列表里，属于自然降级。
 */
const TEXT_EXTENSIONS = [
  'txt', 'text', 'log', 'diff', 'patch',
  'json', 'jsonl', 'ndjson', 'csv', 'tsv',
  'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'properties', 'gradle',
  'xml', 'html', 'htm', 'css', 'scss', 'less', 'svg',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte',
  'py', 'java', 'kt', 'kts', 'go', 'rs', 'rb', 'php', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs',
  'sql', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
  'srt', 'vtt',
] as const;

/** 扩展名缺失时按 MIME 兜底：部分产物只有 MIME 可信。 */
const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/xhtml+xml',
  'application/yaml',
  'application/x-yaml',
  'application/javascript',
  'application/x-sh',
  'application/sql',
  'application/toml',
]);

/** 取小写扩展名；`.env` 这类隐藏文件不算有扩展名。 */
function fileExtension(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot <= 0 ? '' : lower.slice(dot + 1);
}

function isTextMime(mimeType?: string): boolean {
  if (!mimeType) return false;
  const value = mimeType.split(';')[0].trim().toLowerCase();
  if (!value) return false;
  return value.startsWith('text/') || TEXT_MIME_TYPES.has(value);
}

/**
 * 判定产物类型。只看扩展名与 MIME，**不读内容**：二进制文件永远不该被当成文本渲染。
 * mimeType 可选，只传路径时按扩展名判定。
 */
export function artifactKind(workspacePath: string, mimeType?: string): ArtifactKind {
  const ext = fileExtension(artifactFileName(workspacePath));
  if ((MARKDOWN_EXTENSIONS as readonly string[]).includes(ext)) return 'markdown';
  if (ext === 'pptx') return 'pptx';
  if ((TEXT_EXTENSIONS as readonly string[]).includes(ext)) return 'text';
  if (isTextMime(mimeType)) return 'text';
  return 'other';
}

/** 卡片上的类型徽标文案。 */
export function artifactKindLabel(kind: ArtifactKind): string {
  switch (kind) {
    case 'markdown':
      return 'MD';
    case 'pptx':
      return 'PPTX';
    case 'text':
      return 'TEXT';
    default:
      return 'FILE';
  }
}

/** 人类可读体积；未知大小返回空串，避免列表里出现误导性的 0 B。 */
export function artifactSizeLabel(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 是否为「可原地渲染正文」的产物（Markdown 与纯文本）。 */
export function isTextLikeArtifact(kind: ArtifactKind): boolean {
  return kind === 'markdown' || kind === 'text';
}

/** 会落盘产出业务的写入类工具。 */
const WRITE_TOOLS = new Set(['write_file', 'edit_file']);

/**
 * 通过命令生成产物的工具。
 *
 * PPTX 是二进制文件，模型无法用 write_file 写入，实际由 PPT 技能在 execute 里
 * 执行 node/python 脚本生成；只放宽 .pptx，避免 `cat README.md` 之类读操作被误判。
 */
const SHELL_TOOLS = new Set(['execute', 'bash', 'shell', 'run_command']);

/** 写入类工具可能落盘的产物扩展名（Markdown / 纯文本 / PPTX）。 */
const ARTIFACT_EXT_PATTERN = ['pptx', ...MARKDOWN_EXTENSIONS, ...TEXT_EXTENSIONS].join('|');

const ARTIFACT_PATH_RE = new RegExp(`\\.(?:${ARTIFACT_EXT_PATTERN})$`, 'i');

function withUser(userId: string, sessionId?: string): URLSearchParams {
  const params = new URLSearchParams({ userId: userId || 'anonymous' });
  if (sessionId) params.set('sessionId', sessionId);
  return params;
}

/** 列出当前用户工作区内的 Markdown / PPTX 产物元数据（服务端已按最后修改时间倒序）。 */
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

/**
 * 构造 PDF 预览的 BFF 地址（同源，浏览器原生 PDF 查看器直接加载）。
 *
 * version 建议传 modifiedAt：源文件被重新生成时 URL 变化，
 * 浏览器才会重新拉取，不会停留在上一版 PDF。
 */
export function artifactPreviewUrl(
  userId: string,
  sessionId: string | undefined,
  workspacePath: string,
  version?: number
): string {
  const params = withUser(userId, sessionId);
  params.set('workspacePath', workspacePath);
  if (version && version > 0) params.set('v', String(version));
  return `/api/artifacts/preview?${params.toString()}`;
}

/** 预览状态查询结果，含 HTTP 层信息便于前端分支。 */
export interface ArtifactPreviewStatusResult {
  httpStatus: number;
  previewKind: PreviewKind;
  previewStatus: PreviewStatus;
  errorCode: string | null;
  message: string | null;
  retryAfterMs: number;
  updatedAt: number;
  size: number;
  modifiedAt: number;
}

/** 触发预览的结果：202 表示已入队/转换中，200 表示已就绪。 */
export interface ArtifactPreviewKickResult {
  httpStatus: number;
  ok: boolean;
  previewStatus: PreviewStatus | null;
  retryAfterMs: number;
  errorCode: string | null;
  message: string | null;
}

/**
 * 查询预览状态（服务端只读，不触发转换；retry=true 才允许把 failed 重置为 pending）。
 *
 * 服务端不可达时抛错，由调用方决定重试策略；非 2xx 不抛错，转成结果对象返回。
 */
export async function fetchArtifactPreviewStatus(
  userId: string,
  sessionId: string | undefined,
  workspacePath: string,
  options: { retry?: boolean; signal?: AbortSignal } = {}
): Promise<ArtifactPreviewStatusResult> {
  const params = withUser(userId, sessionId);
  params.set('workspacePath', workspacePath);
  if (options.retry) params.set('retry', 'true');

  const res = await fetch(`/api/artifacts/preview/status?${params.toString()}`, {
    cache: 'no-store',
    signal: options.signal,
  });

  const body = await safeJson(res);

  return {
    httpStatus: res.status,
    previewKind: normalizePreviewKind(body?.previewKind),
    previewStatus: normalizePreviewStatus(body?.previewStatus) ?? (res.ok ? 'pending' : 'failed'),
    errorCode: errorCodeFrom(body),
    message: asString(body?.message) ?? asString(body?.error),
    retryAfterMs: parseRetryAfterMs(res.headers.get('retry-after'), body),
    updatedAt: asNumber(body?.updatedAt) ?? 0,
    size: asNumber(body?.size) ?? 0,
    modifiedAt: asNumber(body?.modifiedAt) ?? 0,
  };
}

/**
 * 触发 / 获取预览：服务端无缓存时入队并返回 202（单飞，不重复转换）。
 *
 * - 200 / 206：已经就绪并直接回 PDF 字节流。我们只为「触发」而来，
 *   立刻 cancel 掉 body，避免白白下载整份 PDF（iframe 自己会去拉）。
 * - 202：入队 / 转换中，body 是 JSON，可读到 previewStatus 与 retryAfterMs。
 */
export async function requestArtifactPreview(
  userId: string,
  sessionId: string | undefined,
  workspacePath: string,
  options: { warmup?: boolean; signal?: AbortSignal } = {}
): Promise<ArtifactPreviewKickResult> {
  const params = withUser(userId, sessionId);
  params.set('workspacePath', workspacePath);
  if (options.warmup) params.set('warmup', 'true');

  const res = await fetch(`/api/artifacts/preview?${params.toString()}`, {
    cache: 'no-store',
    signal: options.signal,
  });

  if (res.status === 200 || res.status === 206) {
    if (res.body) {
      try {
        await res.body.cancel();
      } catch {
        // 流已被消费时 cancel 会抛：我们不需要这份 body，忽略即可。
      }
    }
    return {
      httpStatus: res.status,
      ok: true,
      previewStatus: 'ready',
      retryAfterMs: parseRetryAfterMs(res.headers.get('retry-after'), null),
      errorCode: null,
      message: null,
    };
  }

  const body = await safeJson(res);
  const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'), body);

  if (res.ok) {
    return {
      httpStatus: res.status,
      ok: true,
      previewStatus: normalizePreviewStatus(body?.previewStatus) ?? 'converting',
      retryAfterMs,
      errorCode: null,
      message: asString(body?.message) ?? null,
    };
  }

  return {
    httpStatus: res.status,
    ok: false,
    previewStatus: normalizePreviewStatus(body?.previewStatus),
    retryAfterMs,
    errorCode: errorCodeFrom(body),
    message: asString(body?.message) ?? asString(body?.error),
  };
}

/**
 * 错误码字段有三种历史写法：服务端预览契约用 previewErrorCode，
 * 通用错误体用 code / errorCode，按优先级取第一个非空值。
 */
function errorCodeFrom(body: Record<string, unknown> | null): string | null {
  if (!body) return null;
  return asString(body.previewErrorCode) ?? asString(body.code) ?? asString(body.errorCode);
}

/** retryAfterMs 优先取 body（毫秒），其次取 Retry-After 头（秒）。 */
function parseRetryAfterMs(
  header: string | null,
  body: Record<string, unknown> | null
): number {
  const fromBody = asNumber(body?.retryAfterMs);
  if (fromBody !== null && fromBody >= 0) return fromBody;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return 0;
}

async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const data = (await res.json()) as unknown;
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizePreviewKind(value: unknown): PreviewKind {
  return value === 'pdf' ? 'pdf' : 'none';
}

function normalizePreviewStatus(value: unknown): PreviewStatus | null {
  return value === 'none' ||
    value === 'pending' ||
    value === 'converting' ||
    value === 'ready' ||
    value === 'failed'
    ? value
    : null;
}

/** 文件名：取 workspacePath 的最后一段。 */
export function artifactFileName(workspacePath: string): string {
  const normalized = workspacePath.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  return slash < 0 ? normalized : normalized.slice(slash + 1);
}


interface ShellInvocation {
  command: string;
  workingDirectory: string;
}

function parseShellInvocation(input: string): ShellInvocation | null {
  try {
    const parsed = JSON.parse(input) as { command?: unknown; working_directory?: unknown };
    if (typeof parsed.command !== 'string') return null;
    return {
      command: parsed.command,
      workingDirectory:
        typeof parsed.working_directory === 'string' ? parsed.working_directory : '',
    };
  } catch {
    // 历史事件里可能只存了裸命令文本。
    const command = input.trim();
    return command ? { command, workingDirectory: '' } : null;
  }
}

/** 脚本类扩展名：PPTX 等二进制产物无法 write_file，只能由脚本生成。 */
const SCRIPT_EXTENSIONS = new Set([
  'js', 'cjs', 'mjs', 'ts', 'py', 'sh', 'bash', 'ps1', 'bat', 'cmd', 'rb', 'php',
]);

/** 脚本源码可能上万行，扫产物路径只需要开头一段。 */
const SCRIPT_SCAN_LIMIT = 200_000;

/**
 * 从任意文本（shell 命令、脚本源码）里提取 .pptx 路径。
 *
 * 支持 `--output x.pptx`、`"x.pptx"` 与 `--out=…` 这些写法。
 * 命中后还要与 `/api/artifacts` 的真实列表对齐，所以宁可放宽：
 * 多提取的候选路径匹配不上就不展示，漏提取才会丢产物。
 */
function pptxPathsFromText(text: string): string[] {
  const found = new Set<string>();
  const matches = text.slice(0, SCRIPT_SCAN_LIMIT).match(/[^\s"'`;|&<>()]+\.pptx/gi) ?? [];
  matches.forEach(raw => {
    let candidate = raw;
    const eq = candidate.lastIndexOf('=');
    if (eq >= 0) candidate = candidate.slice(eq + 1);
    candidate = candidate.replace(/^['"`]+|['"`]+$/g, '').replace(/[,;)]+$/, '');
    if (candidate) found.add(candidate);
  });
  return [...found];
}

/** write_file / edit_file 的入参：目标路径 + 写入内容。 */
function parseToolFile(input: string): { path: string; content: string } | null {
  try {
    const parsed = JSON.parse(input) as { path?: unknown; content?: unknown };
    if (typeof parsed.path !== 'string') return null;
    return {
      path: parsed.path,
      content: typeof parsed.content === 'string' ? parsed.content : '',
    };
  } catch {
    return null;
  }
}

/**
 * 从一次工具调用中提取「可能产出产物的路径」。
 *
 * - write_file / edit_file：input.path 指向 .md/.markdown/文本类产物；
 * - write_file 写的是脚本（.py/.js/…）：PPTX 路径只出现在脚本源码里，从内容中提取；
 * - execute：命令文本里出现 .pptx（`python x.py --out y.pptx` 这类直写形式）。
 *
 * PPT 技能的真实链路是「写脚本 → 执行脚本」，两条命令都不含 .pptx，
 * 只看 input.path 或命令文本会漏掉产物，必须同时扫脚本源码。
 */
function artifactPathsFromToolUse(toolUse: ToolUse): string[] {
  if (WRITE_TOOLS.has(toolUse.name)) {
    const file = parseToolFile(toolUse.input);
    if (!file) return [];
    const extension = fileExtension(file.path);
    // 脚本类文件默认不作为交付物展示：PPT 技能会先写 generate.py 再执行，
    // 用户要的是脚本产出的 .pptx，而不是中间脚本。
    if (SCRIPT_EXTENSIONS.has(extension)) {
      const outputs = pptxPathsFromText(file.content);
      // 但脚本本身就是交付物时（例如「帮我写个爬虫脚本」）没有二进制产物可扫，
      // 此时把脚本自己列出来，避免整轮产物为空。
      if (outputs.length === 0 && ARTIFACT_PATH_RE.test(file.path)) {
        return [file.path];
      }
      return outputs;
    }
    return ARTIFACT_PATH_RE.test(file.path) ? [file.path] : [];
  }

  if (SHELL_TOOLS.has(toolUse.name)) {
    const invocation = parseShellInvocation(toolUse.input);
    if (!invocation) return [];
    const dir = invocation.workingDirectory.trim().replace(/[\\/]$/, '');
    return pptxPathsFromText(invocation.command).map(path => {
      const absolute = /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('/');
      return dir && !absolute ? `${dir}/${path}` : path;
    });
  }

  return [];
}

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\.?\//, '')
    .toLowerCase();
}

/** 是否为「会产出可预览 / 可下载文件的工具调用」（写入类，或生成 PPTX 的脚本命令）。 */
export function isArtifactWrite(toolUse: ToolUse): boolean {
  return artifactPathsFromToolUse(toolUse).length > 0;
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
    artifactPathsFromToolUse(toolUse).forEach(path => {
      const normalized = normalizePath(path);
      if (normalized && !wanted.includes(normalized)) wanted.push(normalized);
    });
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