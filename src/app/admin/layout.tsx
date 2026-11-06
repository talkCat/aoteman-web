'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BrainCircuit,
  LibraryBig,
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
  {
    href: '/admin/knowledge',
    label: '知识库',
    description: '文档 / 切片 / 授权',
    icon: LibraryBig,
  },
  {
    href: '/admin/experts',
    label: '专家模型',
    description: '提示词 / 知识库 / 授权',
    icon: BrainCircuit,
  },
] as const;

/** 按最长前缀匹配，避免 /admin/experts/new 落到别的标题（设计 §3.2）。 */
function currentPage(pathname: string): { title: string; href: string } {
  const matched = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname.startsWith(item.href));
  return matched
    ? { title: matched.label, href: matched.href }
    : { title: '权限规则', href: '/admin/permissions' };
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
  const mobileNavRef = useRef<HTMLElement>(null);
  // 移动端 Tab 超出屏宽时，把被截断的一侧淡出：激活项居中会把左右多余的 Tab
  // 硬切在屏幕边缘，看起来像渲染错误而不是「还能滑动」。
  const [navOverflow, setNavOverflow] = useState({ start: false, end: false });
  const page = currentPage(pathname);

  const activeUser = user;

  useEffect(() => {
    if (ready && !user) {
      router.replace('/login');
    }
  }, [ready, user, router]);

  // 管理后台的滚动容器是 main，路由切换后手动回到顶部。
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // 移动端顶部 Tab 是可横向滚动的：把当前模块滚到中间，
  // 否则从侧栏点进「专家模型」时，激活项会停在屏幕外看不见。
  // 依赖 ready：首屏先渲染登录校验占位，shell 出现时 pathname 不会变，
  // 只盯 pathname 会漏掉这一次布局。
  useEffect(() => {
    const nav = mobileNavRef.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const navRect = nav.getBoundingClientRect();
      if (navRect.width === 0) return; // 桌面端 nav 隐藏，跳过。
      const activeRect = active.getBoundingClientRect();
      nav.scrollBy({
        left: activeRect.left - navRect.left - (navRect.width - activeRect.width) / 2,
        behavior: 'smooth',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, ready]);

  useEffect(() => {
    const nav = mobileNavRef.current;
    if (!nav) return;
    const update = () => {
      const max = nav.scrollWidth - nav.clientWidth;
      const start = nav.scrollLeft > 4;
      const end = max > 4 && nav.scrollLeft < max - 4;
      setNavOverflow((current) => (current.start === start && current.end === end ? current : { start, end }));
    };
    update();
    nav.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => {
      nav.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [ready, pathname]);

  if (!ready || !activeUser) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm" role="status">
          {ready ? '未登录，正在前往登录页…' : '正在验证登录状态…'}
        </p>
      </div>
    );
  }

  // 只遮掉真正被截断的那一侧；容器不溢出时不加 mask，避免误伤首尾 Tab 的圆角与焦点环。
  const navMask =
    navOverflow.start || navOverflow.end
      ? `linear-gradient(to right, ${
          navOverflow.start ? 'transparent 0, #000 24px' : '#000 0'
        }, ${navOverflow.end ? '#000 calc(100% - 24px), transparent 100%' : '#000 100%'})`
      : undefined;

  return (
    <AdminUserProvider user={activeUser}>
      <div className="app-canvas flex h-dvh overflow-hidden text-foreground">
        <a
          href="#admin-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-card focus:ring-2 focus:ring-ring"
        >
          跳到管理内容
        </a>

        <aside className="surface-sidebar hidden w-[232px] shrink-0 flex-col lg:flex">
          <div className="flex h-14 items-center gap-2.5 px-4">
            <span className="rail-logo" aria-hidden="true" />
            <div className="min-w-0 leading-tight">
              <div className="text-sm font-semibold tracking-tight">灵犀</div>
              <div className="text-[11px] text-fg-4">控制台</div>
            </div>
          </div>

          <div className="px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-fg-4">
            治理台
          </div>

          <nav aria-label="管理后台导航" className="flex-1 space-y-0.5 px-2 py-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  data-active={active}
                  className={cn(
                    'ui-interactive ui-focus-ring-inset nav-item flex min-h-11 items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-sm',
                    active
                      ? 'bg-accent-wash text-fg-1'
                      : 'text-fg-2 hover:bg-surface-2 hover:text-fg-1',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                      active ? 'bg-primary/14 text-primary' : 'bg-surface-2 text-fg-3',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium leading-tight">{item.label}</span>
                    <span
                      className={cn(
                        'mt-0.5 block truncate text-[10.5px] leading-tight',
                        active ? 'text-fg-3' : 'text-fg-4',
                      )}
                    >
                      {item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="px-3 pb-3">
            <Link
              href="/"
              className="ui-interactive ui-focus-ring flex items-center gap-2 rounded-[10px] bg-surface-2/60 px-3 py-2 text-xs text-fg-3 hover:bg-surface-2 hover:text-fg-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              返回对话工作台
            </Link>
            <p className="mt-2 px-1 text-[10px] leading-relaxed text-fg-4">
              知识库与专家按用户授权 · v1 无组织维度
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="glass-bar z-30 shrink-0 border-b border-line-1">
            <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary lg:hidden">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <h1 className="truncate text-sm font-semibold tracking-tight lg:sr-only">{page.title}</h1>
                <span className="hidden h-4 w-px bg-line-2 sm:block lg:hidden" aria-hidden="true" />
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
                  className="h-11 w-11 justify-center gap-1.5 px-0 md:h-9 md:w-auto md:px-2"
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
              ref={mobileNavRef}
              aria-label="管理后台导航"
              className="flex items-center gap-1 overflow-x-auto border-t border-line-1 px-3 py-2 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
              style={{ maskImage: navMask, WebkitMaskImage: navMask }}
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
                      'ui-interactive ui-focus-ring flex min-h-11 min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 rounded-[10px] px-2 py-2 text-[13px] font-medium sm:flex-none sm:basis-auto sm:px-3',
                      active
                        ? 'bg-accent-wash text-fg-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]'
                        : 'text-fg-3 hover:bg-surface-2 hover:text-fg-1',
                    )}
                  >
                    <Icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
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
            <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AdminUserProvider>
  );
}
