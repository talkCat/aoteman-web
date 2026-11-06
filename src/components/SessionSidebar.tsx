"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { BrandWordmark } from "@/components/BrandWordmark";
import { UserMenu } from "@/components/UserMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

/** 侧边栏会话项（与 useSessions 的 SessionSummary 兼容，只取渲染需要的字段）。 */
export type SessionListItem = {
  sessionId: string;
  title: string | null;
  updatedAt: number;
};

/** 把毫秒时间戳渲染成「刚刚 / N 分钟前 / 昨天 / N 天前 / M月D日」。 */
function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "刚刚";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 最左侧会话导航（对齐原型 01 的 chat-rail）：
 * 品牌区 → 开启新对话 → 按「今天 / 更早」分组的真实会话列表 → 管理后台入口 + 用户卡。
 *
 * 每项支持：点击切换、悬停「…」菜单重命名 / 删除、双击标题行内改名。
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
  user,
  sessionId,
  canManage,
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
  /** 当前登录用户：用于底部用户卡；未登录时不渲染（不伪造身份）。 */
  user?: AuthUser | null;
  sessionId?: string;
  /** 是否展示「管理后台」入口（仅登录用户 / 预览态可见）。 */
  canManage?: boolean;
  className?: string;
}) {
  // 行内重命名状态：正在编辑的会话 id 与草稿标题
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  // 正在执行删除 / 重命名的会话 id，用于禁用按钮防重复提交
  const [busyId, setBusyId] = useState<string | null>(null);

  const canDelete = typeof onDelete === "function";
  const canRename = typeof onRename === "function";

  // 会话按自然日分组：今天 / 更早。时间戳缺失时归入「更早」。
  const groups = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const boundary = startOfToday.getTime();
    return [
      { key: "today", label: "今天", items: sessions.filter((s) => (s.updatedAt || 0) >= boundary) },
      { key: "earlier", label: "更早", items: sessions.filter((s) => (s.updatedAt || 0) < boundary) },
    ].filter((group) => group.items.length > 0);
  }, [sessions]);

  const startEdit = (session: SessionListItem) => {
    setEditingId(session.sessionId);
    setDraftTitle(session.title?.trim() || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftTitle("");
  };

  const commitEdit = async (targetSessionId: string) => {
    const next = draftTitle.trim();
    // 空标题不提交（服务端也会 400），直接退出编辑
    if (!next || !onRename) {
      cancelEdit();
      return;
    }
    setBusyId(targetSessionId);
    try {
      await onRename(targetSessionId, next);
    } finally {
      setBusyId(null);
      cancelEdit();
    }
  };

  const handleDelete = async (session: SessionListItem) => {
    if (!onDelete) return;
    const label = session.title?.trim() || "新会话";
    if (!window.confirm(`确定删除会话「${label}」？此操作不可恢复。`)) return;
    setBusyId(session.sessionId);
    try {
      await onDelete(session.sessionId);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <aside aria-label="会话导航" className={cn("chat-rail flex shrink-0 flex-col", className)}>
      <div className="rail-brand">
        <Link href="/" className="rail-brand-link ui-focus-ring rounded-lg" aria-label="灵犀 Lumi 首页">
          <BrandWordmark />
        </Link>
      </div>

      <button
        type="button"
        className="rail-new-chat ui-interactive ui-focus-ring ui-pressable"
        onClick={onNew}
      >
        <span className="rail-new-chat-ico" aria-hidden="true">
          <Plus className="h-3.5 w-3.5" />
        </span>
        <span className="rail-new-chat-label">开启新对话</span>
        <kbd className="rail-kbd" aria-hidden="true">
          ⌘K
        </kbd>
      </button>

      <div className="rail-scroll">
        {loading && sessions.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-3 text-[11px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            加载中…
          </div>
        ) : sessions.length === 0 ? (
          <p className="rail-empty">还没有历史对话，发送第一条消息后会出现在这里。</p>
        ) : (
          groups.map((group) => (
            <div key={group.key}>
              <div className="rail-label">{group.label}</div>
              <nav aria-label={`${group.label}的会话`}>
                <ul className="conversation-list">
                  {group.items.map((session) => {
                    const active = session.sessionId === currentSessionId;
                    const busy = busyId === session.sessionId;
                    const label = session.title?.trim() || "新会话";

                    if (editingId === session.sessionId) {
                      return (
                        <li key={session.sessionId}>
                          <div className="conv-edit">
                            <input
                              autoFocus
                              value={draftTitle}
                              maxLength={100}
                              placeholder="会话标题"
                              onChange={(e) => setDraftTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void commitEdit(session.sessionId);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelEdit();
                                }
                              }}
                              className="ui-interactive ui-focus-field min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-[11.5px] text-foreground outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => void commitEdit(session.sessionId)}
                              title="保存"
                              aria-label="保存标题"
                              className="conv-edit-btn ui-interactive ui-focus-ring"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              title="取消"
                              aria-label="取消重命名"
                              className="conv-edit-btn ui-interactive ui-focus-ring"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </li>
                      );
                    }

                    return (
                      <li key={session.sessionId}>
                        <div className={cn("conv-item", active && "is-active")}>
                          <button
                            type="button"
                            onClick={() => onSelect(session.sessionId)}
                            onDoubleClick={() => canRename && startEdit(session)}
                            aria-current={active ? "true" : undefined}
                            data-active={active ? "true" : undefined}
                            title={label}
                            className="conv-hit ui-focus-ring-inset"
                          >
                            <span className="conv-ico" aria-hidden="true">
                              {busy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <MessageSquare className="h-3.5 w-3.5" />
                              )}
                            </span>
                            <span className="conv-copy">
                              <strong>{label}</strong>
                              <small>{formatRelativeTime(session.updatedAt)}</small>
                            </span>
                          </button>

                          {(canRename || canDelete) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  disabled={busy}
                                  title="会话操作"
                                  aria-label={`会话「${label}」的操作`}
                                  className="conv-more ui-interactive ui-focus-ring disabled:opacity-50"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" side="bottom" className="w-36">
                                {canRename && (
                                  <DropdownMenuItem onSelect={() => startEdit(session)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                    重命名
                                  </DropdownMenuItem>
                                )}
                                {canRename && canDelete && <DropdownMenuSeparator />}
                                {canDelete && (
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      void handleDelete(session);
                                    }}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    删除
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>
          ))
        )}
      </div>

      <div className="rail-foot">
        {canManage && (
          <Link href="/admin" className="admin-entry ui-interactive ui-focus-ring">
            <span className="admin-entry-ico" aria-hidden="true">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </span>
            <span className="admin-entry-copy">
              <strong>管理后台</strong>
              <small>技能 · MCP · 知识库</small>
            </span>
            <span className="admin-entry-arrow" aria-hidden="true">
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        )}
        <UserMenu variant="row" user={user} sessionId={sessionId} showIdentity />
      </div>
    </aside>
  );
}
