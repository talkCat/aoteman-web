"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck, User as UserIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AuthUser } from "@/lib/auth";

/**
 * 顶栏用户菜单：显示当前登录用户并提供登出。
 * 未登录 / 加载中一律不渲染，保证「内嵌 / 未登录」场景的顶栏与原样一致（软守卫，见设计 §3.6）。
 */
export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (!alive) return;
        setUser(res.ok ? ((await res.json()) as AuthUser) : null);
      })
      .catch(() => {
        if (alive) setUser(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  if (loading || !user) return null;

  const label = user.displayName?.trim() || user.username;
  const isAdmin = Array.isArray(user.roles) && user.roles.includes("ADMIN");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          title={label}
          aria-label={"账号：" + label}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold uppercase text-primary">
            {label.slice(0, 1)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium leading-none">{label}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.username}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
          {isAdmin ? <ShieldCheck className="h-3.5 w-3.5" /> : <UserIcon className="h-3.5 w-3.5" />}
          {isAdmin ? "管理员" : "普通用户"}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
