'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { citationKey, compareCitations } from '@/lib/citation-order';
import { cn } from '@/lib/utils';
import type { Citation } from '@/types/citation';

interface CitationListProps {
  citations: Citation[];
  /** 模型正文里是否至少标注了一个本轮引用。 */
  annotated: boolean;
  onOpen: (citation: Citation) => void;
}

/**
 * 回答下方的「参考资料」。
 *
 * 挂在每轮最终回答下方，按 finalRank 升序（草稿按 K 编号）展示；默认 5 条，超出后展开。
 * 用 divide-y 列表而不是卡片，与过程时间线保持同一种语言。
 * 设计依据：设计文档 §11.3。
 */
export function CitationList({ citations, annotated, onOpen }: CitationListProps) {
  const [expandedSnippets, setExpandedSnippets] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  if (citations.length === 0) return null;

  const sorted = [...citations].sort(compareCitations);

  const visible = showAll ? sorted : sorted.slice(0, 5);
  const hidden = sorted.length - visible.length;
  const degraded = sorted.every((citation) => citation.rerankScore === null);

  function toggleSnippet(key: string) {
    setExpandedSnippets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className="mt-3 border-t border-border/50 pt-3" aria-label="参考资料">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-xs font-medium text-muted-foreground">
          {annotated ? `参考资料 · ${sorted.length}` : `本次检索到的资料 · ${sorted.length}`}
        </h2>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {!annotated && <span>模型未在回答中标注引用</span>}
          {degraded && <span className="text-warning">本轮检索已降级为向量排序</span>}
        </div>
      </div>

      <ul className="divide-y divide-border/50">
        {visible.map((citation) => {
          const key = citationKey(citation);
          const expanded = expandedSnippets.has(key);
          const meta = [
            citation.expertName,
            citation.kbName,
            citation.headingPath,
            citation.chunkTotal > 0 ? `第 ${citation.chunkOrdinal}/${citation.chunkTotal} 块` : null,
            citation.pageFrom && citation.pageFrom > 0
              ? `第 ${citation.pageFrom}${citation.pageTo && citation.pageTo !== citation.pageFrom ? `-${citation.pageTo}` : ''} 页`
              : null,
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <li key={key} className="py-3">
              <div className="flex items-start gap-3">
                <span className="surface-chip mt-0.5 inline-flex h-5 w-7 shrink-0 items-center justify-center rounded bg-primary/10 font-mono text-[11px] font-medium text-primary">
                  {citation.ref}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpen(citation)}
                      disabled={!citation.citationId}
                      className={cn(
                        'ui-interactive ui-focus-ring -my-3 min-w-0 line-clamp-1 py-3 text-left text-[13px] font-medium leading-5 md:-my-0 md:py-0',
                        citation.citationId
                          ? 'hover:text-primary hover:underline'
                          : 'cursor-default text-muted-foreground',
                      )}
                      aria-label={
                        citation.citationId
                          ? `查看引用 ${citation.ref} 详情：${citation.documentTitle}`
                          : undefined
                      }
                    >
                      {citation.documentTitle}
                    </button>
                    {!citation.citationId && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">详情暂不可用</span>
                    )}
                  </div>

                  <p className="mt-0.5 line-clamp-1 font-mono text-[11px] leading-4 tabular-nums text-muted-foreground sm:text-xs" title={meta}>{meta}</p>

                  <button
                    type="button"
                    onClick={() => toggleSnippet(key)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? '收起' : '展开'}引用 ${citation.ref} 的切片片段`}
                    title={expanded ? '收起片段' : '展开片段'}
                    className={cn(
                      'ui-interactive ui-focus-ring mt-1.5 block min-h-11 w-full border-l border-border/70 py-1 pl-2.5 text-left text-xs leading-relaxed text-muted-foreground hover:border-primary/40 hover:text-foreground md:py-0',
                      !expanded && 'line-clamp-2',
                    )}
                  >
                    {citation.snippet}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {sorted.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="ui-interactive ui-focus-ring -mx-1 mt-1 inline-flex min-h-11 items-center gap-1 rounded px-2 py-2 text-xs text-primary hover:underline md:min-h-0"
        >
          {showAll ? (
            <>
              <ChevronUp className="h-3 w-3" aria-hidden="true" />
              收起
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
              展开其余 {hidden} 条
            </>
          )}
        </button>
      )}
    </section>
  );
}