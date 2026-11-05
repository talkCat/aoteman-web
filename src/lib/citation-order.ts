import type { Citation } from '@/types/citation';

/**
 * 引用去重键。
 *
 * 优先使用「专家 + 文档 + 版本 + 切片」这一稳定来源：同一轮可能发生多次
 * knowledge_search，同一片段每批都会拿到新的 citationId，但来源并没有变。
 * 来源字段不完整时退回 citationId，最后才用 toolCallId + expertId + ref。
 *
 * 专家模式下多个子 Agent 各自从 K1 开始编号，expertId 必须参与，
 * 否则「专家 A 的 K1」和「专家 B 的 K1」会被误判为同一条而被丢弃。
 */
export function citationKey(citation: Citation): string {
  if (citation.documentId && citation.versionId && citation.chunkId) {
    return `chunk:${citation.expertId ?? ''}:${citation.documentId}:${citation.versionId}:${citation.chunkId}`;
  }
  if (citation.citationId) return `id:${citation.citationId}`;
  return `ref:${citation.toolCallId}:${citation.expertId ?? ''}:${citation.ref}`;
}

/** 同一来源的两次快照是否完全一致；用于避免重连回放时无意义地替换对象。 */
function isSameSnapshot(a: Citation, b: Citation): boolean {
  return (
    a.citationId === b.citationId &&
    a.ref === b.ref &&
    a.finalRank === b.finalRank &&
    a.toolCallId === b.toolCallId &&
    a.vectorScore === b.vectorScore &&
    a.rerankScore === b.rerankScore &&
    a.snippet === b.snippet
  );
}

/**
 * 合并一轮内的多批引用，同一稳定来源采用 latest-wins。
 *
 * 后到达的快照代表更靠后的检索结果，因此替换先前的 citationId / ref /
 * finalRank / 分数，而不是保留第一次命中的记录。没有变化时返回原数组，
 * 保持引用徽标依赖的数组身份稳定。
 */
export function mergeCitations(current: Citation[], incoming: Citation[]): Citation[] {
  if (incoming.length === 0) return current;

  const merged = [...current];
  const indexByKey = new Map<string, number>();
  merged.forEach((citation, index) => indexByKey.set(citationKey(citation), index));

  let changed = false;
  for (const citation of incoming) {
    const key = citationKey(citation);
    const index = indexByKey.get(key);
    if (index === undefined) {
      indexByKey.set(key, merged.length);
      merged.push(citation);
      changed = true;
      continue;
    }
    if (isSameSnapshot(merged[index], citation)) continue;
    merged[index] = citation;
    changed = true;
  }

  if (!changed) return current;
  return merged.sort(compareCitations);
}

/**
 * 参考资料排序。
 *
 * finalRank 为空（专家草稿阶段）排在最后；同 rank 时按 K 编号兜底。
 * Array#sort 在 ES2019 起是稳定排序，因此完全相同的键会保持事件到达顺序。
 */
export function compareCitations(a: Citation, b: Citation): number {
  const rankA = a.finalRank ?? Number.MAX_SAFE_INTEGER;
  const rankB = b.finalRank ?? Number.MAX_SAFE_INTEGER;
  if (rankA !== rankB) return rankA - rankB;

  const refA = Number.parseInt(a.ref.replace(/\D/g, ''), 10);
  const refB = Number.parseInt(b.ref.replace(/\D/g, ''), 10);
  return (
    (Number.isNaN(refA) ? Number.MAX_SAFE_INTEGER : refA) -
    (Number.isNaN(refB) ? Number.MAX_SAFE_INTEGER : refB)
  );
}