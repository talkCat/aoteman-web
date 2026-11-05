'use client';

import { initialOf } from '@/lib/knowledge-format';
import type { ExpertRef } from '@/types/knowledge';

/**
 * 用户消息上的专家快照。
 *
 * 只读展示发送当时的专家名称；专家改名或删除后历史消息保持不变。
 * 旧数据只有 expertIds 时，useSSEStream 会补上占位名「专家」。
 * 设计依据：设计文档 §10.4。
 */
export function UserMessageExperts({ experts }: { experts?: ExpertRef[] }) {
  if (!experts || experts.length === 0) return null;

  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-primary-foreground">
      {experts.map((expert) => (
        <span key={`${expert.expertId}-${expert.name}`} className="inline-flex items-center gap-1">
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary-foreground/15 text-[9px] font-medium"
            aria-hidden="true"
          >
            {initialOf(expert.name)}
          </span>
          {expert.name}
        </span>
      ))}
    </div>
  );
}