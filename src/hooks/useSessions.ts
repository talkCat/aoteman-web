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

  return { sessions, loading, error, refresh };
}
