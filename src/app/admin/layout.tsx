'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Package,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { AdminUserProvider } from '@/components/admin/AdminUserContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  {
    href: '/admin/permissions',
    label: '权限规则',
    description: '工具基线 / 本人规则',
    icon: ShieldCheck,
  },
  {
    href: '/admin/skills',
    label: '技能管理',
    description: '广场 / 安装 / 发布',
    icon: Package,
  },
] as const;

function currentPage(pathname: string): { title: string; href: string } {
  if (pathname.startsWith('/admin/skills')) {
    return { title: '技能管理', href: '/admin/skills' };
  }
  return { title: '权限规则', href: '/admin/permissions' };
}

/**
 * 管理后台外壳：桌面 220px sticky 左栏，移动端顶部水平 Tab。
 * 页面级登录校验 + 子页面共享当前用户，未知用户回登录页（软守卫）。
 * 设计依据：2026-10-24-智能体后台管理模块设计.md §3 / §4.1 / §6。
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready } = useCurrentUser();
  const mainRef = useRef<HTMLElement>(null);
  const page = currentPage(pathname);

  useEffect(() => {
    if (ready && !user) {
      router.replace('/login');
    }
  }, [ready, user, router]);

  // 管理后台的滚动容器是 main，路由切换后手动回到顶部。
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  if (!ready || !user) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm" role="status">
          {ready ? '未登录，正在前往登录页…' : '正在验证登录状态…'}
        </p>
      </div>
    );
  }

  return (
    <AdminUserProvider user={user}>
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        <a
          href="#admin-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-card focus:ring-2 focus:ring-ring"
        >
          跳到管理内容
        </a>

        <aside className="hidden w-[220px] shrink-0 flex-col border-r border-border/60 bg-muted/20 lg:flex">
          <div className="flex h-14 items-center gap-2.5 border-b border-border/60 px-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="text-sm font-semibold tracking-tight">aoteman</div>
              <div className="text-[11px] text-muted-foreground">管理后台</div>
            </div>
          </div>

          <nav aria-label="管理后台导航" className="flex-1 space-y-1 p-3">
            {NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-start gap-2.5 rounded-md px-3 py-2.5 text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-medium">{item.label}</span>
                    <span
                      className={cn(
                        'mt-0.5 block text-[11px]',
                        active ? 'text-primary/70' : 'text-muted-foreground/70',
                      )}
                    >
                      {item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-border/60 p-4">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              规则与技能均只作用于当前账号；管理员不会因此获得他人规则的代管能力。
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="z-30 shrink-0 border-b border-border/60 bg-background/85 backdrop-blur">
            <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary lg:hidden">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <h1 className="truncate text-sm font-semibold tracking-tight">{page.title}</h1>
                <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
                <Breadcrumb className="hidden min-w-0 sm:block">
                  <BreadcrumbList className="gap-1.5 text-xs sm:gap-1.5">
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link href="/">工作台</Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <span className="text-muted-foreground">管理</span>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{page.title}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 px-2"
                  asChild
                  title="返回工作台"
                >
                  <Link href="/">
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">返回工作台</span>
                  </Link>
                </Button>
                <ThemeToggle />
                <UserMenu />
              </div>
            </div>

            <nav
              aria-label="管理后台导航"
              className="grid grid-cols-2 gap-1 border-t border-border/50 px-3 py-2 lg:hidden"
            >
              {NAV_ITEMS.map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-w-0 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </header>

          <main
            id="admin-main"
            ref={mainRef}
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-y-auto focus:outline-none"
          >
            <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AdminUserProvider>
  );
}
