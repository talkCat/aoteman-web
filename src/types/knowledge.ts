import type { Citation } from '@/types/citation';

/**
 * 知识库与专家模型的共享类型。
 *
 * 依据：aoteman-web/doc/plans/2026-11-04-知识库与专家模型前端任务拆解.md §2。
 * 当前阶段页面使用 src/lib/knowledge-demo.ts 的静态数据，字段与控制面契约保持一致，
 * 后续接 BFF 时只替换数据来源，不改类型与组件。
 */

export type KnowledgeBaseStatus = 'ACTIVE' | 'DISABLED' | 'DELETED';
export type ChunkStrategy = 'AUTO' | 'TOC' | 'FIXED';
export type IngestStage = 'PARSE' | 'CHUNK' | 'EMBED' | 'INDEX';
export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';
export type VersionStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
export type ExpertStatus = 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'DELETED';

export interface KnowledgeBaseSummary {
  kbId: string;
  name: string;
  description: string | null;
  status: KnowledgeBaseStatus;
  strategy: ChunkStrategy;
  documentCount: number;
  /** 列表接口无聚合切片数，未知时为 null；详情页算准后可写回缓存。 */
  chunkCount: number | null;
  grantCount: number;
  updatedAt: number;
}

export interface KnowledgeDocumentSummary {
  documentId: string;
  kbId: string;
  title: string;
  fileName: string;
  fileSize: number;
  versionNo: number;
  status: DocumentStatus;
  stage: IngestStage | null;
  /** 0-100；后端不给时为 null，UI 退化为四段等分。 */
  progress: number | null;
  failureCode: string | null;
  failureMessage: string | null;
  chunkCount: number | null;
  updatedAt: number;
  /** 仅前端演示用：上传时的切片策略，正式契约放在版本记录里。 */
  strategy?: ChunkStrategy;
  tocDetected?: boolean;
  headingLevels?: number;
}

export interface KnowledgeDocumentVersion {
  versionId: string;
  documentId: string;
  versionNo: number;
  status: VersionStatus;
  chunkCount: number | null;
  createdAt: number;
  failureMessage: string | null;
  isCurrent: boolean;
}

export interface KnowledgeChunk {
  chunkId: string;
  versionId: string;
  parentChunkId: string | null;
  chunkType: 'PARENT' | 'CHILD';
  ordinal: number;
  ordinalTotal: number;
  headingPath: string | null;
  content: string;
  charCount: number;
}

export interface GrantUser {
  userId: string;
  username: string;
  displayName: string;
  email: string | null;
  roles: string[];
  status: string;
}

export interface EmbeddingConfig {
  modelName: string;
  dimension: number;
  endpoint: string;
  rerankModel: string;
}

export interface ExpertResourceSummary {
  knowledgeBaseCount: number;
  skillCount: number;
  mcpCount: number;
  grantCount: number;
}

export interface ExpertSummary {
  expertId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  welcomeMessage: string | null;
  status: ExpertStatus;
  promptChars: number;
  resources: ExpertResourceSummary;
  updatedAt: number;
}

export interface ExpertKnowledgeBinding {
  kbId: string;
  name: string;
  status: KnowledgeBaseStatus;
  sortOrder: number;
  documentCount: number;
  chunkCount: number | null;
}

export interface ExpertSkillBinding {
  skillName: string;
  displayName: string;
  version: string;
  enabled: boolean;
}

export interface ExpertMcpBinding {
  mcpId: string;
  displayName: string;
  transport: 'SSE' | 'STREAMABLE_HTTP';
  enabled: boolean;
}

export interface AdminExpertDetail extends ExpertSummary {
  systemPrompt: string;
  promptHash: string | null;
  knowledgeBases: ExpertKnowledgeBinding[];
  skills: ExpertSkillBinding[];
  mcpServers: ExpertMcpBinding[];
  grants: GrantUser[];
  publishedAt: number | null;
}

export interface ExpertCapabilities {
  skills: boolean;
  mcp: boolean;
}

/** 用户端可见的专家摘要：不包含 systemPrompt，避免提示词泄露到浏览器。 */
export interface UserExpertSummary {
  expertId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  welcomeMessage: string | null;
  knowledgeBaseCount: number;
  skillCount: number;
  mcpCount: number;
  promptChars: number;
  updatedAt: number;
}

/** 历史消息里的专家快照：专家改名或删除后仍按当时名称展示。 */
export interface ExpertRef {
  expertId: string;
  name: string;
  promptHash: string | null;
}

export type { Citation };