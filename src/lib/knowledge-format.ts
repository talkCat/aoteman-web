import type { ChunkStrategy, IngestStage } from '@/types/knowledge';

const TZ = 'Asia/Shanghai';

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: TZ,
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const fullDateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const countFormatter = new Intl.NumberFormat('zh-CN');

/** 列表里的短时间：11-04 14:20。固定时区，避免服务端 / 浏览器渲染不一致。 */
export function formatDateTime(timestamp: number): string {
  return dateTimeFormatter.format(new Date(timestamp)).replace(/\//g, '-');
}

/** 详情里的完整时间：2026-11-04 14:20。 */
export function formatFullDateTime(timestamp: number): string {
  return fullDateTimeFormatter.format(new Date(timestamp)).replace(/\//g, '-');
}

/** 文档数 / 切片数：千分位，配合 tabular-nums 使用。 */
export function formatCount(value: number): string {
  return countFormatter.format(value);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const STAGE_LABEL: Record<IngestStage, string> = {
  PARSE: '解析文档',
  CHUNK: '切分章节',
  EMBED: '向量化',
  INDEX: '写入索引',
};

/** 紧凑阶段名，用于行内说明「入库中 · 切片」。 */
export const STAGE_SHORT_LABEL: Record<IngestStage, string> = {
  PARSE: '解析',
  CHUNK: '切片',
  EMBED: '向量化',
  INDEX: '建索引',
};

export const STAGE_ORDER: IngestStage[] = ['PARSE', 'CHUNK', 'EMBED', 'INDEX'];

export const STRATEGY_LABEL: Record<ChunkStrategy, string> = {
  AUTO: '自动',
  TOC: '章节模式',
  FIXED: '固定长度',
};

/** 由后端 progress 推断当前阶段对应的四段进度；后端不给 progress 时按阶段等分。 */
export function stageIndex(stage: IngestStage | null): number {
  if (!stage) return -1;
  return STAGE_ORDER.indexOf(stage);
}

export function percentOfStage(stage: IngestStage | null, progress: number | null): number {
  if (typeof progress === 'number') return Math.min(100, Math.max(0, Math.round(progress)));
  const index = stageIndex(stage);
  return index < 0 ? 0 : Math.round(((index + 1) / STAGE_ORDER.length) * 100);
}

export function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 1) : '专';
}