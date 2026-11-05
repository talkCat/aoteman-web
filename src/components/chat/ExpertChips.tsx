'use client';

import { X } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initialOf } from '@/lib/knowledge-format';
import { cn } from '@/lib/utils';
import type { UserExpertSummary } from '@/types/knowledge';

/**
 * 已选专家 chips。超过 3 个时横向滚动而不是换行，避免把输入框顶下去。
 * 设计依据：设计文档 §10.1。
 */
export function ExpertChips({
  experts,
  onRemove,
  className,
}: {
  experts: UserExpertSummary[];
  onRemove: (expertId: string) => void;
  className?: string;
}) {
  if (experts.length === 0) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 overflow-x-auto border-b border-border/50 px-1 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      aria-label="已选择的专家"
    >
      {experts.map((expert) => (
        <span
          key={expert.expertId}
          className="surface-chip inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 pl-1 pr-1.5 text-xs text-primary md:h-7"
        >
          <Avatar className="h-5 w-5">
            {expert.avatarUrl && <AvatarImage src={expert.avatarUrl} alt="" />}
            <AvatarFallback className="bg-primary/15 text-[10px] font-medium text-primary">
              {initialOf(expert.name)}
            </AvatarFallback>
          </Avatar>
          <span className="max-w-[8rem] truncate">{expert.name}</span>
          <button
            type="button"
            onClick={() => onRemove(expert.expertId)}
            aria-label={`移除${expert.name}`}
            className="ui-interactive ui-focus-ring -m-4 rounded-full p-4 text-primary/70 hover:bg-primary/15 hover:text-primary md:-m-1 md:p-1"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}