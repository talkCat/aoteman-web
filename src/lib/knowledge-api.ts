/**
 * 知识库 / 专家模块的前端 API 客户端。
 *
 * 分层：
 *   页面 → 本文件 → 同源 `/api/**`（BFF）→ 控制面 8081。
 * 浏览器永远拿不到控制面地址，也拿不到 `/internal/**` 的内部凭证。
 *
 * 后端 DTO 与页面视图模型并不完全一致（例如列表不含 documentCount / grantCount，
 * 文档状态是 PENDING 而不是 UPLOADED），映射集中在这里，页面只消费 `types/knowledge.ts`。
 *
 * 设计依据：doc/design/2026-11-04-知识库与专家模块-前端接口清单.md。
 */

import type {
  AdminExpertDetail,
  ChunkStrategy,
  DocumentStatus,
  GrantUser,
  IngestStage,
  KnowledgeBaseStatus,
  KnowledgeBaseSummary,
  KnowledgeChunk,
  KnowledgeDocumentSummary,
  KnowledgeDocumentVersion,
  UserExpertSummary,
  VersionStatus,
} from '@/types/knowledge';
import type { Citation, CitationDetail } from '@/types/citation';

// ---------------------------------------------------------------- 错误模型

/** 控制面统一错误体（aoteman-common 的 ApiError）。分支判断只允许用 code。 */
export interface ApiErrorBody {
  code: string;
  message: string;
  timestamp: number;
}

export class KnowledgeApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly timestamp: number;

  constructor(status: number, code: string, message: string, timestamp = Date.now()) {
    super(message);
    this.name = 'KnowledgeApiError';
    this.status = status;
    this.code = code;
    this.timestamp = timestamp;
  }
}

/** 页面 catch 后统一取中文提示；网络异常给出可操作的兜底文案。 */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof KnowledgeApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return '请求失败，请稍后重试';
}

function parsePayload(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, cache: 'no-store' });
  } catch {
    throw new KnowledgeApiError(0, 'NETWORK_ERROR', '网络异常，请检查服务是否已启动');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = parsePayload(text);

  if (!response.ok) {
    const body = payload as Partial<ApiErrorBody> | null;
    throw new KnowledgeApiError(
      response.status,
      body?.code || 'REQUEST_ERROR',
      body?.message || `请求失败（HTTP ${response.status}）`,
      body?.timestamp,
    );
  }

  return (payload ?? null) as T;
}

/** 受控并发：知识库列表要为每个库补文档数 / 授权数，避免一次打出上百个请求。 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

// ---------------------------------------------------------------- 后端 DTO

export interface KnowledgeBaseDto {
  kbId: string;
  name: string;
  description: string | null;
  status: KnowledgeBaseStatus;
  embeddingModel: string;
  embeddingDim: number;
  collectionName: string;
  chunkStrategy: ChunkStrategy;
  configJson: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AdminDocumentDto {
  documentId: string;
  kbId: string;
  title: string;
  fileName: string;
  fileExt: string;
  mimeType: string;
  fileSize: number;
  currentVersionNo: number;
  status: 'PENDING' | 'READY' | 'FAILED';
  createdAt: number;
  updatedAt: number;
}

export interface DocumentVersionDto {
  versionId: string;
  documentId: string;
  versionNo: number;
  status: 'PENDING' | 'READY' | 'FAILED';
  chunkStrategy: ChunkStrategy;
  tocDetected: boolean;
  parserName: string;
  embeddingModel: string;
  embeddingDim: number;
  pageCount: number;
  charCount: number;
  chunkCount: number;
  childChunkCount: number;
  errorCode: string;
  errorMessage: string;
  indexedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChunkItemDto {
  chunkId: string;
  chunkType: 'CHILD' | 'PARENT';
  headingPath: string;
  ordinal: number;
  content: string;
  charCount: number;
  tokenCount: number;
  pageFrom: number;
  pageTo: number;
}

export interface ChunkPageDto {
  items: ChunkItemDto[];
  page: number;
  size: number;
  total: number;
}

export interface JobDto {
  jobId: string;
  kbId: string;
  documentId: string;
  versionId: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  stage: IngestStage;
  progress: number;
  attempt: number;
  maxAttempts: number;
  errorCode: string;
  errorMessage: string;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface UploadResultDto {
  documentId: string;
  versionId: string;
  jobId: string;
  duplicate: boolean;
}

export interface ExpertAdminDto {
  expertId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  welcomeMessage: string | null;
  systemPrompt: string;
  status: 'DRAFT' | 'ACTIVE' | 'DISABLED';
  kbIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ExpertSummaryDto {
  expertId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  welcomeMessage: string | null;
  kbIds: string[];
}

export interface UserDto {
  userId: string;
  username: string;
  displayName: string | null;
  email: string | null;
  status: string;
  roles: string[];
  createdAt: number;
}

// ---------------------------------------------------------------- 视图映射

/** 后端 PENDING 在上传场景等于「已入队待处理」，UI 用 UPLOADED 表达。 */
function mapDocumentStatus(status: AdminDocumentDto['status']): DocumentStatus {
  if (status === 'PENDING') return 'UPLOADED';
  return status;
}

function mapVersionStatus(status: DocumentVersionDto['status']): VersionStatus {
  return status;
}

export function toGrantUser(dto: UserDto): GrantUser {
  return {
    userId: dto.userId,
    username: dto.username,
    displayName: dto.displayName || dto.username,
    email: dto.email,
    roles: dto.roles ?? [],
    status: dto.status,
  };
}

/**
 * 列表页的知识库视图。
 *
 * 控制面列表只返回库本身，文档数 / 授权数要额外两次请求；
 * 切片数没有聚合接口（按文档版本逐个取代价过高），这里给 null，页面显示「—」。
 * 进入详情页后会把精确切片数写回会话缓存，列表再次打开即可显示。
 */
export function toBaseSummary(
  dto: KnowledgeBaseDto,
  counts?: { documentCount?: number; chunkCount?: number | null; grantCount?: number },
): KnowledgeBaseSummary {
  return {
    kbId: dto.kbId,
    name: dto.name,
    description: dto.description || null,
    status: dto.status,
    strategy: dto.chunkStrategy,
    documentCount: counts?.documentCount ?? 0,
    chunkCount: counts?.chunkCount ?? null,
    grantCount: counts?.grantCount ?? 0,
    updatedAt: dto.updatedAt,
  };
}

export function toDocumentSummary(
  dto: AdminDocumentDto,
  version?: DocumentVersionDto | null,
): KnowledgeDocumentSummary {
  return {
    documentId: dto.documentId,
    kbId: dto.kbId,
    title: dto.title,
    fileName: dto.fileName,
    fileSize: dto.fileSize,
    versionNo: dto.currentVersionNo,
    status: mapDocumentStatus(dto.status),
    stage: dto.status === 'PENDING' ? 'PARSE' : null,
    progress: null,
    failureCode: version?.errorCode || null,
    failureMessage: version?.errorMessage || null,
    chunkCount: version?.chunkCount ?? null,
    updatedAt: dto.updatedAt,
    strategy: version?.chunkStrategy,
    tocDetected: version?.tocDetected,
  };
}

export function toDocumentVersion(
  dto: DocumentVersionDto,
  currentVersionNo: number,
): KnowledgeDocumentVersion {
  return {
    versionId: dto.versionId,
    documentId: dto.documentId,
    versionNo: dto.versionNo,
    status: mapVersionStatus(dto.status),
    chunkCount: dto.status === 'READY' ? dto.chunkCount : null,
    createdAt: dto.createdAt,
    failureMessage: dto.errorMessage || null,
    isCurrent: dto.versionNo === currentVersionNo,
  };
}

export function toChunk(dto: ChunkItemDto, versionId: string, ordinalTotal: number): KnowledgeChunk {
  return {
    chunkId: dto.chunkId,
    versionId,
    parentChunkId: null,
    chunkType: dto.chunkType,
    ordinal: dto.ordinal,
    ordinalTotal,
    headingPath: dto.headingPath || null,
    content: dto.content,
    charCount: dto.charCount,
  };
}

export function toUserExpert(
  dto: ExpertSummaryDto,
  stats?: { knowledgeBaseCount?: number; skillCount?: number; mcpCount?: number },
): UserExpertSummary {
  return {
    expertId: dto.expertId,
    name: dto.name,
    description: dto.description || null,
    avatarUrl: dto.avatarUrl || null,
    welcomeMessage: dto.welcomeMessage || null,
    knowledgeBaseCount: stats?.knowledgeBaseCount ?? dto.kbIds.length,
    skillCount: stats?.skillCount ?? 0,
    mcpCount: stats?.mcpCount ?? 0,
    promptChars: 0,
    updatedAt: 0,
  };
}

/** 把专家 DTO + 绑定 + 授权 + 知识库索引拼成管理端详情视图。 */
export function toAdminExpert(
  dto: ExpertAdminDto,
  options: {
    bases: KnowledgeBaseSummary[];
    grants: GrantUser[];
  },
): AdminExpertDetail {
  const byId = new Map(options.bases.map((base) => [base.kbId, base]));
  return {
    expertId: dto.expertId,
    name: dto.name,
    description: dto.description || null,
    avatarUrl: dto.avatarUrl || null,
    welcomeMessage: dto.welcomeMessage || null,
    status: dto.status,
    promptChars: dto.systemPrompt.length,
    resources: {
      knowledgeBaseCount: dto.kbIds.length,
      skillCount: 0,
      mcpCount: 0,
      grantCount: options.grants.length,
    },
    updatedAt: dto.updatedAt,
    systemPrompt: dto.systemPrompt,
    promptHash: null,
    knowledgeBases: dto.kbIds.map((kbId, index) => {
      const base = byId.get(kbId);
      return {
        kbId,
        name: base?.name ?? '知识库已不可用',
        status: base?.status ?? 'DELETED',
        sortOrder: index + 1,
        documentCount: base?.documentCount ?? 0,
        chunkCount: base?.chunkCount ?? null,
      };
    }),
    skills: [],
    mcpServers: [],
    grants: options.grants,
    publishedAt: dto.status === 'ACTIVE' ? dto.updatedAt : null,
  };
}

// ---------------------------------------------------------------- 知识库

export interface KnowledgeBaseCommand {
  name: string;
  description?: string | null;
  chunkStrategy?: ChunkStrategy | null;
  configJson?: string | null;
}

export async function listKnowledgeBases(): Promise<KnowledgeBaseDto[]> {
  const dtos = await request<KnowledgeBaseDto[]>('/api/admin/knowledge/bases');
  // §2.2：列表未过滤软删，前端必须自己排除，否则会出现「删了还在」。
  return dtos.filter((dto) => dto.status !== 'DELETED');
}

/** 列表页视图：并行补齐文档数与授权数（每个库两次请求，4 并发）。 */
export async function fetchKnowledgeBaseSummaries(): Promise<KnowledgeBaseSummary[]> {
  const dtos = await listKnowledgeBases();

  return mapWithConcurrency(dtos, 4, async (dto) => {
    const [documents, grants] = await Promise.all([
      request<AdminDocumentDto[]>(`/api/admin/knowledge/bases/${dto.kbId}/documents`).catch(() => []),
      request<{ userIds: string[] }>(`/api/admin/knowledge/bases/${dto.kbId}/grants`).catch(() => ({
        userIds: [],
      })),
    ]);
    const cached = readChunkCountCache(dto.kbId);
    return toBaseSummary(dto, {
      documentCount: documents.length,
      chunkCount: cached,
      grantCount: grants.userIds.length,
    });
  });
}

export async function getKnowledgeBase(kbId: string): Promise<KnowledgeBaseDto> {
  return request<KnowledgeBaseDto>(`/api/admin/knowledge/bases/${kbId}`);
}

export async function createKnowledgeBase(command: KnowledgeBaseCommand): Promise<KnowledgeBaseDto> {
  return request<KnowledgeBaseDto>('/api/admin/knowledge/bases', {
    method: 'POST',
    body: JSON.stringify(command),
  });
}

export async function updateKnowledgeBase(
  kbId: string,
  command: KnowledgeBaseCommand,
): Promise<KnowledgeBaseDto> {
  return request<KnowledgeBaseDto>(`/api/admin/knowledge/bases/${kbId}`, {
    method: 'PATCH',
    body: JSON.stringify(command),
  });
}

export async function deleteKnowledgeBase(kbId: string): Promise<void> {
  await request<void>(`/api/admin/knowledge/bases/${kbId}`, { method: 'DELETE' });
}

export async function getKnowledgeBaseGrants(kbId: string): Promise<string[]> {
  const view = await request<{ userIds: string[] }>(`/api/admin/knowledge/bases/${kbId}/grants`);
  return view.userIds ?? [];
}

export async function replaceKnowledgeBaseGrants(kbId: string, userIds: string[]): Promise<string[]> {
  const view = await request<{ userIds: string[] }>(`/api/admin/knowledge/bases/${kbId}/grants`, {
    method: 'PUT',
    body: JSON.stringify({ userIds }),
  });
  return view.userIds ?? [];
}

// ---------------------------------------------------------------- 文档 / 入库

export async function listDocuments(kbId: string): Promise<AdminDocumentDto[]> {
  return request<AdminDocumentDto[]>(`/api/admin/knowledge/bases/${kbId}/documents`);
}

export async function listVersions(documentId: string): Promise<DocumentVersionDto[]> {
  return request<DocumentVersionDto[]>(`/api/admin/knowledge/documents/${documentId}/versions`);
}

export async function deleteDocument(documentId: string): Promise<void> {
  await request<void>(`/api/admin/knowledge/documents/${documentId}`, { method: 'DELETE' });
}

export async function retryDocument(documentId: string): Promise<JobDto> {
  return request<JobDto>(`/api/admin/knowledge/documents/${documentId}/retry`, { method: 'POST' });
}

export async function getJob(jobId: string): Promise<JobDto> {
  return request<JobDto>(`/api/admin/knowledge/jobs/${jobId}`);
}

export async function listChunks(
  documentId: string,
  params: { versionId?: string; type?: 'CHILD' | 'PARENT'; page?: number; size?: number } = {},
): Promise<ChunkPageDto> {
  const query = new URLSearchParams();
  if (params.versionId) query.set('versionId', params.versionId);
  if (params.type) query.set('type', params.type);
  if (params.page) query.set('page', String(params.page));
  if (params.size) query.set('size', String(params.size));
  const suffix = query.toString();
  return request<ChunkPageDto>(
    `/api/admin/knowledge/documents/${documentId}/chunks${suffix ? `?${suffix}` : ''}`,
  );
}

/**
 * 上传 .docx。
 *
 * 用 XMLHttpRequest 而不是 fetch：fetch 没有上传进度事件，而设计稿要求真实进度条。
 * 不手动设置 Content-Type，让浏览器自己带 multipart boundary。
 */
export function uploadDocument(input: {
  kbId: string;
  file: File;
  strategy?: ChunkStrategy;
  replaceDocumentId?: string | null;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<UploadResultDto> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', input.file);
    if (input.strategy) form.append('strategy', input.strategy);
    if (input.replaceDocumentId) form.append('replaceDocumentId', input.replaceDocumentId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/admin/knowledge/bases/${input.kbId}/documents`);
    xhr.responseType = 'text';

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && input.onProgress) {
        input.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      const payload = parsePayload(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload as UploadResultDto);
        return;
      }
      const body = payload as Partial<ApiErrorBody> | null;
      reject(
        new KnowledgeApiError(
          xhr.status,
          body?.code || 'UPLOAD_FAILED',
          body?.message || `上传失败（HTTP ${xhr.status}）`,
          body?.timestamp,
        ),
      );
    };

    xhr.onerror = () => reject(new KnowledgeApiError(0, 'NETWORK_ERROR', '上传失败，请检查网络'));
    xhr.onabort = () => reject(new KnowledgeApiError(0, 'ABORTED', '上传已取消'));

    input.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

// ---------------------------------------------------------------- 专家（管理端）

export async function listAdminExperts(): Promise<ExpertAdminDto[]> {
  return request<ExpertAdminDto[]>('/api/admin/experts');
}

export async function getAdminExpert(expertId: string): Promise<ExpertAdminDto> {
  return request<ExpertAdminDto>(`/api/admin/experts/${expertId}`);
}

export interface ExpertCommand {
  name: string;
  description: string;
  avatarUrl: string;
  welcomeMessage: string;
  systemPrompt: string;
  status: 'DRAFT' | 'ACTIVE' | 'DISABLED';
}

export async function createExpert(command: ExpertCommand): Promise<ExpertAdminDto> {
  return request<ExpertAdminDto>('/api/admin/experts', {
    method: 'POST',
    body: JSON.stringify(command),
  });
}

/** ⚠️ 全量覆盖：六个字段必须全传，漏传会被写空（§4.3）。 */
export async function updateExpert(expertId: string, command: ExpertCommand): Promise<ExpertAdminDto> {
  return request<ExpertAdminDto>(`/api/admin/experts/${expertId}`, {
    method: 'PATCH',
    body: JSON.stringify(command),
  });
}

export async function deleteExpert(expertId: string): Promise<void> {
  await request<void>(`/api/admin/experts/${expertId}`, { method: 'DELETE' });
}

export async function getExpertKnowledgeBases(expertId: string): Promise<string[]> {
  const view = await request<{ kbIds: string[] }>(
    `/api/admin/experts/${expertId}/knowledge-bases`,
  );
  return view.kbIds ?? [];
}

export async function replaceExpertKnowledgeBases(
  expertId: string,
  kbIds: string[],
): Promise<string[]> {
  const view = await request<{ kbIds: string[] }>(
    `/api/admin/experts/${expertId}/knowledge-bases`,
    { method: 'PUT', body: JSON.stringify({ kbIds }) },
  );
  return view.kbIds ?? [];
}

export async function getExpertGrants(expertId: string): Promise<string[]> {
  const view = await request<{ userIds: string[] }>(`/api/admin/experts/${expertId}/grants`);
  return view.userIds ?? [];
}

export async function replaceExpertGrants(expertId: string, userIds: string[]): Promise<string[]> {
  const view = await request<{ userIds: string[] }>(`/api/admin/experts/${expertId}/grants`, {
    method: 'PUT',
    body: JSON.stringify({ userIds }),
  });
  return view.userIds ?? [];
}

// ---------------------------------------------------------------- 用户

export async function listAdminUsers(): Promise<GrantUser[]> {
  const dtos = await request<UserDto[]>('/api/admin/users');
  return dtos.map(toGrantUser);
}

// ---------------------------------------------------------------- 用户端专家

export async function listUserExperts(): Promise<UserExpertSummary[]> {
  const dtos = await request<ExpertSummaryDto[]>('/api/experts');
  // 用户端接口刻意不下发 systemPrompt，也没有 updatedAt；按名称稳定排序即可。
  return dtos
    .map((dto) => toUserExpert(dto))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

// ---------------------------------------------------------------- 检索与引用

export interface CitationViewDto {
  ref: string;
  finalRank: number | null;
  citationId: string | null;
  toolCallId: string;
  expertId: string;
  expertName: string;
  kbId: string;
  kbName: string;
  documentId: string;
  documentTitle: string;
  fileName: string;
  versionId: string;
  chunkId: string;
  parentChunkId: string;
  headingPath: string;
  pageFrom: number;
  pageTo: number;
  chunkOrdinal: number;
  chunkTotal: number;
  snippet: string;
  vectorScore: number | null;
  rerankScore: number | null;
}

export interface CitationDetailDto {
  citation: CitationViewDto;
  chunk: { chunkId: string; content: string; prevChunkId: string; nextChunkId: string } | null;
  parent: { chunkId: string; content: string; headingPath: string } | null;
  document: { documentId: string; title: string; fileName: string; fileExt: string };
  accessRevoked: boolean;
  documentDeleted: boolean;
}

/** 空白字符串统一收敛为 null，避免空串进入引用快照。 */
function trimmedOrNull(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  return text ? text : null;
}

/** agent.citation 事件 DTO → 前端 Citation 视图模型。 */
export function toCitation(dto: CitationViewDto): Citation {
  return {
    ref: String(dto.ref ?? ''),
    finalRank: typeof dto.finalRank === 'number' ? dto.finalRank : null,
    citationId: trimmedOrNull(dto.citationId),
    toolCallId: String(dto.toolCallId ?? ''),
    documentId: String(dto.documentId ?? ''),
    versionId: String(dto.versionId ?? ''),
    chunkId: String(dto.chunkId ?? ''),
    kbName: String(dto.kbName ?? ''),
    documentTitle: String(dto.documentTitle ?? ''),
    fileName: String(dto.fileName ?? ''),
    headingPath: trimmedOrNull(dto.headingPath),
    pageFrom: dto.pageFrom > 0 ? dto.pageFrom : null,
    pageTo: dto.pageTo > 0 ? dto.pageTo : null,
    chunkOrdinal: Number(dto.chunkOrdinal ?? 0),
    chunkTotal: Number(dto.chunkTotal ?? 0),
    snippet: String(dto.snippet ?? ''),
    vectorScore: typeof dto.vectorScore === 'number' ? dto.vectorScore : null,
    rerankScore: typeof dto.rerankScore === 'number' ? dto.rerankScore : null,
    expertId: trimmedOrNull(dto.expertId),
    expertName: trimmedOrNull(dto.expertName),
  };
}

/** 引用详情 DTO → 前端视图模型。 */
export function toCitationDetail(dto: CitationDetailDto): CitationDetail {
  return {
    citation: toCitation(dto.citation),
    chunk: dto.chunk ?? null,
    parent: dto.parent ?? null,
    document: dto.document,
    accessRevoked: Boolean(dto.accessRevoked),
    documentDeleted: Boolean(dto.documentDeleted),
  };
}

export interface KnowledgeSearchResponseDto {
  context: string;
  citations: CitationViewDto[];
  degraded: boolean;
}

export async function searchKnowledge(input: {
  query: string;
  sessionId?: string;
  toolCallId?: string;
  expertIds?: string[];
  topK?: number;
}): Promise<KnowledgeSearchResponseDto> {
  return request<KnowledgeSearchResponseDto>('/api/knowledge/search', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getCitationDetail(citationId: string): Promise<CitationDetail> {
  const dto = await request<CitationDetailDto>(`/api/knowledge/citations/${citationId}`);
  return toCitationDetail(dto);
}

/** 引用原文下载：BFF 流式透传，浏览器按 Content-Disposition 落盘。 */
export async function downloadCitationDocument(citationId: string): Promise<Response> {
  const response = await fetch(`/api/knowledge/citations/${citationId}/document`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text();
    const body = parsePayload(text) as Partial<ApiErrorBody> | null;
    throw new KnowledgeApiError(
      response.status,
      body?.code || 'DOWNLOAD_FAILED',
      body?.message || '原文下载失败',
    );
  }
  return response;
}

// ---------------------------------------------------------------- 本地缓存

const CHUNK_CACHE_KEY = 'aoteman-kb-chunk-counts';

/** 切片数在列表页无法低成本聚合，详情页算准后写回，避免同一库反复显示「—」。 */
function readChunkCountCache(kbId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CHUNK_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, number>;
    const value = parsed[kbId];
    return typeof value === 'number' ? value : null;
  } catch {
    return null;
  }
}

export function cacheChunkCount(kbId: string, chunkCount: number): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(CHUNK_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    parsed[kbId] = chunkCount;
    window.sessionStorage.setItem(CHUNK_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // 会话缓存失败不影响功能。
  }
}

// ---------------------------------------------------------------- 详情聚合

export interface KnowledgeBaseDetail {
  base: KnowledgeBaseSummary;
  documents: KnowledgeDocumentSummary[];
  versions: KnowledgeDocumentVersion[];
  grantUserIds: string[];
  /** 已授权的用户（用于渲染授权列表 / 计算脏状态）。 */
  users: GrantUser[];
  /** 全量用户：授权选择器要能添加「尚未授权」的人。 */
  allUsers: GrantUser[];
  embedding: { modelName: string; dimension: number };
}

/**
 * 详情页一次性聚合：库 + 文档 + 每份文档的当前版本 + 授权 + 用户列表。
 *
 * 版本要逐文档取（列表接口不带切片数）；文档量在几十份以内，用 4 并发即可。
 */
export async function fetchKnowledgeBaseDetail(kbId: string): Promise<KnowledgeBaseDetail> {
  const [baseDto, documents, grantUserIds, users] = await Promise.all([
    getKnowledgeBase(kbId),
    listDocuments(kbId),
    getKnowledgeBaseGrants(kbId),
    listAdminUsers(),
  ]);

  const versionLists = await mapWithConcurrency(documents, 4, (doc) =>
    listVersions(doc.documentId).catch(() => [] as DocumentVersionDto[]),
  );

  const versions: KnowledgeDocumentVersion[] = [];
  let chunkTotal = 0;
  const mappedDocuments = documents.map((doc, index) => {
    const list = versionLists[index];
    const current = list.find((item) => item.versionNo === doc.currentVersionNo) ?? list[0] ?? null;
    if (doc.status === 'READY' && current) {
      chunkTotal += current.chunkCount;
      versions.push(...list.map((item) => toDocumentVersion(item, doc.currentVersionNo)));
    } else {
      versions.push(...list.map((item) => toDocumentVersion(item, doc.currentVersionNo)));
    }
    return toDocumentSummary(doc, current);
  });

  cacheChunkCount(kbId, chunkTotal);

  const grantSet = new Set(grantUserIds);
  return {
    base: toBaseSummary(baseDto, {
      documentCount: documents.length,
      chunkCount: chunkTotal,
      grantCount: grantUserIds.length,
    }),
    documents: mappedDocuments.sort((a, b) => b.updatedAt - a.updatedAt),
    versions,
    grantUserIds,
    users: users.filter((user) => grantSet.has(user.userId)),
    allUsers: users,
    embedding: { modelName: baseDto.embeddingModel, dimension: baseDto.embeddingDim },
  };
}