"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, MoreHorizontal, ShieldCheck, User as UserIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { AuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

type UserMenuProps = {
  /** icon：顶栏圆形头像；row：左侧 rail 底部整行用户卡（原型同款）。 */
  variant?: "icon" | "row";
  /** 外层已拿到用户（含静态预览的演示身份）时直接传入，避免重复请求与预览态空白。 */
  user?: AuthUser | null;
  /** 会话 ID，仅 showIdentity 时展示。 */
  sessionId?: string;
  /** 在菜单里展示 userId / sessionId（原只读身份卡的能力，便于排查）。 */
  showIdentity?: boolean;
};

/**
 * 问答页用户入口：顶栏头像 / Rail 底部用户卡共用同一份菜单。
 * 菜单含身份、角色、只读 ID、管理后台与登出；未登录（且无预览身份）时不渲染。
 */
export function UserMenu({ variant = "icon", user: userProp, sessionId, showIdentity }: UserMenuProps) {
  const router = useRouter();
  const { user: currentUser, ready } = useCurrentUser();
  // 外层传入优先（undefined 才回退到 hook，null 表示明确未登录）
  const user = userProp !== undefined ? userProp : currentUser;

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  if (!user || (userProp === undefined && !ready)) return null;

  const label = user.displayName?.trim() || user.username;
  const isAdmin = Array.isArray(user.roles) && user.roles.includes("ADMIN");
  const roleLabel = isAdmin ? "管理员" : "普通用户";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "row" ? (
          <button
            type="button"
            className="rail-user ui-interactive ui-focus-ring"
            title={label}
            aria-label={`账号：${label}`}
          >
            <span className="avatar-gradient" aria-hidden="true">
              {label.slice(0, 1)}
            </span>
            <span className="rail-user-copy">
              <strong>{label}</strong>
              <small>{roleLabel}</small>
            </span>
            <span className="rail-user-more" aria-hidden="true">
              <MoreHorizontal className="h-4 w-4" />
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="topbar-icon ui-interactive ui-focus-ring h-10 w-10 sm:h-[30px] sm:w-[30px]"
            title={label}
            aria-label={`账号：${label}`}
          >
            <span className="avatar-gradient topbar-avatar" aria-hidden="true">
              {label.slice(0, 1)}
            </span>
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === "row" ? "start" : "end"}
        side={variant === "row" ? "top" : "bottom"}
        sideOffset={8}
        className={cn("p-1", variant === "row" ? "w-64" : "w-56")}
      >
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium leading-none">{label}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.username}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
          {isAdmin ? <ShieldCheck className="h-3.5 w-3.5" /> : <UserIcon className="h-3.5 w-3.5" />}
          {roleLabel}
        </div>
        {showIdentity && (
          <>
            <DropdownMenuSeparator />
            <div className="space-y-1.5 px-2 py-1.5">
              <div>
                <span className="block text-[10px] text-muted-foreground">用户ID（登录身份）</span>
                <code className="mt-0.5 block truncate rounded bg-muted px-1.5 py-1 font-mono text-[10px] text-muted-foreground" title={user.userId}>
                  {user.userId || "—"}
                </code>
              </div>
              {sessionId && (
                <div>
                  <span className="block text-[10px] text-muted-foreground">会话ID（本次会话）</span>
                  <code className="mt-0.5 block truncate rounded bg-muted px-1.5 py-1 font-mono text-[10px] text-muted-foreground" title={sessionId}>
                    {sessionId}
                  </code>
                </div>
              )}
            </div>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/admin" className="cursor-pointer">
            <LayoutDashboard className="h-4 w-4" />
            管理后台
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
