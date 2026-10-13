'use client';

import { useState } from 'react';
import { Check, Folder, History, Loader2, MessageSquarePlus, Pencil, Trash2, X } from 'lucide-react';
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
 * 每项支持：点击切换、hover 显示「重命名 / 删除」、双击标题行内改名（P3）。
 * 设计依据：doc/design/2026-10-13-会话删除与标题重命名设计.md §5。
 */
export function SessionSidebar({
  sessions,
  currentSessionId,
  loading,
  onSelect,
  onNew,
  onDelete,
  onRename,
  className,
}: {
  sessions: SessionListItem[];
  currentSessionId: string;
  loading?: boolean;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
  /** 删除会话（通常由上层做二次确认之外的副作用，如删当前会话后新建） */
  onDelete?: (sessionId: string) => void | Promise<void>;
  /** 重命名会话标题，返回是否成功 */
  onRename?: (sessionId: string, title: string) => void | Promise<unknown>;
  className?: string;
}) {
  // 行内重命名状态：正在编辑的会话 id 与草稿标题
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  // 正在执行删除 / 重命名的会话 id，用于禁用按钮防重复提交
  const [busyId, setBusyId] = useState<string | null>(null);

  const canDelete = typeof onDelete === 'function';
  const canRename = typeof onRename === 'function';

  const startEdit = (session: SessionListItem) => {
    setEditingId(session.sessionId);
    setDraftTitle(session.title?.trim() || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftTitle('');
  };

  const commitEdit = async (sessionId: string) => {
    const next = draftTitle.trim();
    // 空标题不提交（服务端也会 400），直接退出编辑
    if (!next || !onRename) {
      cancelEdit();
      return;
    }
    setBusyId(sessionId);
    try {
      await onRename(sessionId, next);
    } finally {
      setBusyId(null);
      cancelEdit();
    }
  };

  const handleDelete = async (session: SessionListItem) => {
    if (!onDelete) return;
    const label = session.title?.trim() || '新会话';
    if (!window.confirm(`确定删除会话「${label}」？此操作不可恢复。`)) return;
    setBusyId(session.sessionId);
    try {
      await onDelete(session.sessionId);
    } finally {
      setBusyId(null);
    }
  };

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
              const busy = busyId === session.sessionId;
              const label = session.title?.trim() || '新会话';

              if (editingId === session.sessionId) {
                return (
                  <li key={session.sessionId}>
                    <div className="flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-1.5">
                      <input
                        autoFocus
                        value={draftTitle}
                        maxLength={100}
                        placeholder="会话标题"
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void commitEdit(session.sessionId);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEdit();
                          }
                        }}
                        className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => void commitEdit(session.sessionId)}
                        title="保存"
                        aria-label="保存标题"
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        title="取消"
                        aria-label="取消重命名"
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              }

              return (
                <li key={session.sessionId} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(session.sessionId)}
                    onDoubleClick={() => canRename && startEdit(session)}
                    aria-current={active ? 'true' : undefined}
                    title={label}
                    className={cn(
                      'w-full cursor-pointer rounded-md px-2.5 py-2 text-left transition-colors',
                      canRename || canDelete ? 'pr-14' : '',
                      active
                        ? 'bg-primary/10 text-foreground'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    )}
                  >
                    <div className="truncate text-xs font-medium">{label}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                      {formatRelativeTime(session.updatedAt)}
                    </div>
                  </button>

                  {(canRename || canDelete) && (
                    <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100">
                      {canRename && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => startEdit(session)}
                          title="重命名"
                          aria-label="重命名会话"
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDelete(session)}
                          title="删除"
                          aria-label="删除会话"
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
