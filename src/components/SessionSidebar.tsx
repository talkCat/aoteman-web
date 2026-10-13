'use client';

import { Folder, History, Loader2, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** 侧边栏会话项（与 useSessions 的 SessionSummary 兼容，只取渲染需要的字段）。 */
export type SessionListItem = {
  sessionId: string;
  title: string | null;
  updatedAt: number;
};

/** 把毫秒时间戳渲染成「刚刚 / N 分钟前 / 昨天 / N 天前 / M月D日」。 */
function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return '刚刚';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '昨天';
  if (days < 30) return `${days} 天前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 最左侧会话导航：顶部「＋ 新会话」，「项目」占位，「历史对话」接真实列表。
 *
 * 设计依据：doc/design/2026-10-13-用户会话列表与历史记录设计.md §6.3。
 * 删除 / 重命名为 P3，本期不做。
 */
export function SessionSidebar({
  sessions,
  currentSessionId,
  loading,
  onSelect,
  onNew,
  className,
}: {
  sessions: SessionListItem[];
  currentSessionId: string;
  loading?: boolean;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
  className?: string;
}) {
  return (
    <aside
      aria-label="项目与历史对话"
      className={cn(
        'flex w-60 shrink-0 flex-col border-r border-border/60 bg-background/60',
        className
      )}
    >
      <div className="border-b border-border/60 p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={onNew}
        >
          <MessageSquarePlus className="h-4 w-4" />
          新会话
        </Button>
      </div>

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

        {loading && sessions.length === 0 ? (
          <div className="flex items-center gap-2 px-1 py-2 text-[11px] text-muted-foreground/70">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            加载中…
          </div>
        ) : sessions.length === 0 ? (
          <p className="rounded-md bg-muted/50 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground/70">
            还没有历史对话，发送第一条消息后会出现在这里。
          </p>
        ) : (
          <ul className="space-y-1">
            {sessions.map((session) => {
              const active = session.sessionId === currentSessionId;
              return (
                <li key={session.sessionId}>
                  <button
                    type="button"
                    onClick={() => onSelect(session.sessionId)}
                    aria-current={active ? 'true' : undefined}
                    title={session.title?.trim() || '新会话'}
                    className={cn(
                      'w-full cursor-pointer rounded-md px-2.5 py-2 text-left transition-colors',
                      active
                        ? 'bg-primary/10 text-foreground'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    )}
                  >
                    <div className="truncate text-xs font-medium">
                      {session.title?.trim() || '新会话'}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                      {formatRelativeTime(session.updatedAt)}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
