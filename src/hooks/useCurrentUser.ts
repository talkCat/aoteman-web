'use client';

import { useEffect, useState } from 'react';

import type { AuthUser } from '@/lib/auth';

export type CurrentUserState = {
  /** 已登录用户；未登录 / 控制面不可达时为 null。 */
  user: AuthUser | null;
  /** 首次 /api/auth/me 请求是否已结束（含失败）。 */
  ready: boolean;
};

/**
 * 读取当前登录用户（BFF /api/auth/me → 控制面 /api/user/me）。
 *
 * Token 只存在 httpOnly Cookie，前端读不到，只能走 BFF。
 * 由顶栏 UserMenu 与聊天页身份初始化共用，避免两处重复请求逻辑。
 */
export function useCurrentUser(): CurrentUserState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (res) => {
        if (!alive) return;
        setUser(res.ok ? ((await res.json()) as AuthUser) : null);
      })
      .catch(() => {
        if (alive) setUser(null);
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { user, ready };
}
