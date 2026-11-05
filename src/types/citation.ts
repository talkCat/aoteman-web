/**
 * 引用相关视图模型。
 *
 * 依据：aoteman-web/doc/design/2026-11-04-知识库与专家模块-前端接口清单.md §6.1-§6.3、
 * 以及 2026-11-04-知识库与专家模型前端设计.md §11。
 * 后端通过 agent.citation 事件下发引用快照；详情与原文下载都以 citationId 为入口。
 */

/** agent.citation / 引用详情接口共用的后端快照结构（对应接口清单 §6.1 的 CitationView）。 */
export interface CitationView {
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

/**
 * 页面消费的引用视图模型：页码 0 统一收敛为 null，
 * 由 knowledge-api 的 toCitation() 完成映射，组件不直接消费后端 DTO。
 */
export interface Citation {
  /** 引用编号（K1、K2…）。 */
  ref: string;
  /** 最终排序名次；null 表示专家子 Agent 草稿阶段尚未排序。 */
  finalRank: number | null;
  /** 引用记录 ID；null 表示不可打开详情。 */
  citationId: string | null;
  /** 检索调用 knowledge_search 的 toolCallId，用于草稿引用去重。 */
  toolCallId: string;
  /** 稳定来源：同一文档版本下的同一片段才是同一条引用。 */
  documentId: string;
  versionId: string;
  chunkId: string;
  kbName: string;
  documentTitle: string;
  fileName: string;
  headingPath: string | null;
  /** DOCX 无页码信息时为 0，收敛为 null，UI 不显示“第 0 页”。 */
  pageFrom: number | null;
  pageTo: number | null;
  chunkOrdinal: number;
  chunkTotal: number;
  snippet: string;
  vectorScore: number | null;
  /** 重排序分数；null 表示未参与重排或重排降级。 */
  rerankScore: number | null;
  expertId: string | null;
  expertName: string | null;
}

/** 引用详情；chunk / parent 在授权回收或文档删除时为 null。 */
export interface CitationDetail {
  citation: Citation;
  chunk: { chunkId: string; content: string; prevChunkId: string; nextChunkId: string } | null;
  parent: { chunkId: string; content: string; headingPath: string } | null;
  document: { documentId: string; title: string; fileName: string; fileExt: string };
  accessRevoked: boolean;
  documentDeleted: boolean;
}