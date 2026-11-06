'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { apiErrorMessage, listUserExperts as fetchUserExperts } from '@/lib/knowledge-api';
import type { UserExpertSummary } from '@/types/knowledge';

export const MAX_EXPERTS = 5;

function readStoredIds(key: string): string[] {
  if (typeof window === 'undefined' || !key) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * 问答页专家多选状态。
 *
 * 选择只影响下一轮：记忆到 localStorage['aoteman:experts:' + userId]，
 * 进入页面时与「已发布且已授权」列表求交集；被移除的专家静默丢弃并提示一次。
 *
 * 请求 GET /api/experts（控制面已按 ACTIVE + 授权过滤）。
 */
export function useExpertSelection(userId: string) {
  const [experts, setExperts] = useState<UserExpertSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const storageKey = userId ? `aoteman:experts:${userId}` : '';
  const persistRef = useRef(false);
  // 请求序号：切换用户 / 手动重载时，旧响应不得覆盖新状态。
  const requestRef = useRef(0);

  useEffect(() => {
    requestRef.current += 1;
    const requestId = requestRef.current;

    // 切换用户先清空，避免上一账号的专家短暂串到新账号。
    persistRef.current = false;
    setReady(false);
    setExperts([]);
    setSelectedIds([]);
    setError(null);

    if (!userId) {
      setLoading(false);
      setReady(true);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const available = await fetchUserExperts();
        if (cancelled || requestRef.current !== requestId) return;

        setExperts(available);

        const stored = readStoredIds(storageKey);
        const availableIds = new Set(available.map((expert) => expert.expertId));
        const valid = stored.filter((id) => availableIds.has(id)).slice(0, MAX_EXPERTS);
        const removed = stored.length - valid.length;

        setSelectedIds(valid);
        setReady(true);
        persistRef.current = true;

        if (removed > 0) {
          toast.info(`有 ${removed} 个专家已不可用，已自动移除`);
        }
      } catch (err) {
        // 过期请求不弹 toast，也不保留上一个账号的专家。
        if (cancelled || requestRef.current !== requestId) return;
        setExperts([]);
        setSelectedIds([]);
        setError(apiErrorMessage(err));
      } finally {
        if (!cancelled && requestRef.current === requestId) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, storageKey, reloadToken]);

  useEffect(() => {
    if (!ready || !persistRef.current || !storageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(selectedIds));
    } catch {
      // 隐私模式 / 配额不足时忽略：本次会话内的选择仍然有效。
    }
  }, [selectedIds, ready, storageKey]);

  const selectedExperts = useMemo(
    () =>
      selectedIds
        .map((id) => experts.find((expert) => expert.expertId === id))
        .filter((expert): expert is UserExpertSummary => Boolean(expert)),
    [selectedIds, experts],
  );

  const toggle = useCallback((expertId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(expertId)) return prev.filter((id) => id !== expertId);
      if (prev.length >= MAX_EXPERTS) {
        toast.info(`最多同时选择 ${MAX_EXPERTS} 个专家`);
        return prev;
      }
      return [...prev, expertId];
    });
  }, []);

  const remove = useCallback((expertId: string) => {
    setSelectedIds((prev) => prev.filter((id) => id !== expertId));
  }, []);

  const clear = useCallback(() => setSelectedIds([]), []);
  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  return {
    experts,
    selectedIds,
    selectedExperts,
    ready,
    loading,
    error,
    reload,
    toggle,
    remove,
    clear,
    maxReached: selectedIds.length >= MAX_EXPERTS,
  };
}