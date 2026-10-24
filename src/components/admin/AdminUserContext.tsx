'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { AuthUser } from '@/lib/auth';

/**
 * 管理后台的登录用户上下文。
 *
 * 由 admin/layout.tsx 在完成页面级登录校验后注入，子页面直接复用，
 * 避免每个页面重复请求 /api/auth/me。
 */
const AdminUserContext = createContext<AuthUser | null>(null);

export function AdminUserProvider({
  user,
  children,
}: {
  user: AuthUser;
  children: ReactNode;
}) {
  return <AdminUserContext.Provider value={user}>{children}</AdminUserContext.Provider>;
}

/** 仅在 AdminUserProvider 内部使用；布局保证 user 一定存在。 */
export function useAdminUser(): AuthUser {
  const user = useContext(AdminUserContext);
  if (!user) {
    throw new Error('useAdminUser 必须在 AdminUserProvider 内使用');
  }
  return user;
}