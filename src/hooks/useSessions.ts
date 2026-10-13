'use client';

import { useCallback, useEffect, useState } from 'react';

/** 与数据面 ConversationSummary 对齐的会话列表项（见设计 §4.1）。 */
export type SessionSummary = {
  sessionId: string;
  /** 首条用户消息前 30 字；老会话 / 空会话为 null */
  title: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
};

export type SessionsState = {
  sessions: SessionSummary[];
  loading: boolean;
  error: string | null;
  /** 手动重新拉取（首条消息落库后调一次，让新会话出现在列表里） */
  refresh: () => void;
  /** 删除会话（BFF DELETE → 数据面），成功后自动刷新列表；失败返回 false */
  remove: (sessionId: string) => Promise<boolean>;
  /** 重命名会话标题（BFF PATCH → 数据面，服务端 trim + 截断 100 字），成功后自动刷新列表 */
  rename: (sessionId: string, title: string) => Promise<boolean>;
};

/**
 * 拉取当前登录用户的会话列表。
 *
 * 走 BFF /api/sessions（→ 数据面 GET /api/sessions），按最近活跃倒序。
 * 设计依据：doc/design/2026-10-13-用户会话列表与历史记录设计.md §6。
 */
export function useSessions(userId: string, limit = 50): SessionsState {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const refresh = useCallback(() => setReloadTick((tick) => tick + 1), []);

  // 删除会话：成功后 refresh()，让侧边栏移除该项。失败时把错误写进 error 供上层提示。
  const remove = useCallback(
    async (sessionId: string): Promise<boolean> => {
      if (!userId) return false;
      try {
        const res = await fetch(
          `/api/sessions/${encodeURIComponent(sessionId)}?userId=${encodeURIComponent(userId)}`,
          { method: 'DELETE' }
        );
        if (!res.ok) throw new Error(`删除会话失败: ${res.status}`);
        refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : '删除会话失败');
        return false;
      }
    },
    [userId, refresh]
  );

  // 重命名标题：服务端强制覆盖，且不刷新 updated_at（列表不重排）。
  const rename = useCallback(
    async (sessionId: string, title: string): Promise<boolean> => {
      if (!userId) return false;
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, title }),
        });
        if (!res.ok) throw new Error(`重命名会话失败: ${res.status}`);
        refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : '重命名会话失败');
        return false;
      }
    },
    [userId, refresh]
  );

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    setError(null);

    fetch(`/api/sessions?userId=${encodeURIComponent(userId)}&limit=${limit}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok) throw new Error(`加载会话列表失败: ${res.status}`);
        const data = (await res.json()) as SessionSummary[];
        if (!alive) return;
        setSessions(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : '加载会话列表失败');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [userId, limit, reloadTick]);

  return { sessions, loading, error, refresh, remove, rename };
}
