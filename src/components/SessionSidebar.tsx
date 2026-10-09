'use client';

import { Folder, History } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 最左侧会话导航：计划放置「项目」与「历史对话」（按 session 区分）。
 * 本轮仅提供骨架与空态占位，数据接入后续再做。
 */
export function SessionSidebar({ className }: { className?: string }) {
  return (
    <aside
      aria-label="项目与历史对话"
      className={cn('flex w-60 shrink-0 flex-col border-r border-border/60 bg-background/60', className)}
    >
      <div className="border-b border-border/60 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Folder className="h-3.5 w-3.5" />
          项目
        </div>
        <p className="rounded-md bg-muted/50 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground/70">
          项目即将开放，用于归集同一主题下的多个会话。
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <History className="h-3.5 w-3.5" />
          历史对话
        </div>
        <p className="rounded-md bg-muted/50 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground/70">
          历史对话将按会话（session）列出，方便随时回溯与切换。
        </p>
      </div>
    </aside>
  );
}
