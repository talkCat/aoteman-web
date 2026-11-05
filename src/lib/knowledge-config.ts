/**
 * 知识库模块的全局只读配置。
 *
 * 控制面没有暴露「查询全局 Embedding 配置」的接口：embeddingModel / embeddingDim
 * 由服务端在建库时决定，前端提交了也会被忽略（接口清单 §2.1）。
 * 因此这里只用于表单里的只读展示；部署变更模型时需要同步这一处文案。
 */

export interface EmbeddingDisplay {
  modelName: string;
  dimension: number;
  rerankModel: string;
}

export const GLOBAL_EMBEDDING: EmbeddingDisplay = {
  modelName: 'qwen3-embedding',
  dimension: 1024,
  rerankModel: 'bge-reranker-base',
};