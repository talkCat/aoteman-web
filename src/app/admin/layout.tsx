'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BrainCircuit,
  FlaskConical,
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
import { DEMO_ADMIN_USER, resetDemoState } from '@/lib/knowledge-demo';
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

const PREVIEW_STORAGE_KEY = 'aoteman-admin-preview';

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

  // 静态预览：控制面未启动时也能走查页面。带 ?preview=1 进入，标记存 sessionStorage，
  // 之后站内跳转保持；生产构建下整段逻辑被 NODE_ENV 判断裁掉，不影响真实鉴权。
  const [devPreview, setDevPreview] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    try {
      const wantsPreview = new URLSearchParams(window.location.search).get('preview') === '1';
      if (wantsPreview) {
        window.sessionStorage.setItem(PREVIEW_STORAGE_KEY, '1');
        setDevPreview(true);
        return;
      }
      setDevPreview(window.sessionStorage.getItem(PREVIEW_STORAGE_KEY) === '1');
    } catch {
      setDevPreview(false);
    }
  }, [pathname]);

  const activeUser = user ?? (devPreview ? DEMO_ADMIN_USER : null);

  useEffect(() => {
    if (!devPreview && ready && !user) {
      router.replace('/login');
    }
  }, [devPreview, ready, user, router]);

  function exitPreview() {
    try {
      window.sessionStorage.removeItem(PREVIEW_STORAGE_KEY);
    } catch {
      // 忽略。
    }
    setDevPreview(false);
    router.replace('/admin/knowledge');
  }

  function resetPreviewData() {
    resetDemoState();
    window.location.reload();
  }

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

        <aside className="surface-sidebar hidden w-[220px] shrink-0 flex-col lg:flex">
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
                    'ui-interactive ui-focus-ring-inset relative flex items-start gap-2.5 rounded-md px-3 py-2.5 text-sm',
                    active
                      ? 'bg-primary/10 text-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.45)]'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-2 h-[calc(100%-1rem)] w-0.5 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                  )}
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-medium">{item.label}</span>
                    <span
                      className={cn(
                        'mt-0.5 block text-[11px]',
                        active ? 'text-primary' : 'text-muted-foreground',
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
              知识库与专家由管理员统一维护，授权到用户；v1 没有组织与角色维度。
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="z-30 shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-xl">
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
              className="flex items-center gap-1 overflow-x-auto border-t border-border/50 px-3 py-2 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
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
                      'ui-interactive ui-focus-ring flex min-h-11 min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium sm:flex-none sm:basis-auto sm:px-3',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <Icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {devPreview && (
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-warning/30 bg-warning/10 px-4 py-1.5 text-[11px] text-foreground/80 sm:px-6">
                <span className="flex items-center gap-1.5">
                  <FlaskConical className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                  <span className="sm:hidden">静态预览</span>
                  <span className="hidden sm:inline">静态预览：使用本地演示数据，未连接控制面。</span>
                </span>
                <span className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={resetPreviewData}
                    className="ui-interactive ui-focus-ring -mx-1 inline-flex min-h-11 items-center rounded-sm px-1 py-1.5 underline underline-offset-2 hover:text-foreground md:-my-1.5 md:min-h-8"
                  >
                    重置演示数据
                  </button>
                  <button
                    type="button"
                    onClick={exitPreview}
                    className="ui-interactive ui-focus-ring -mx-1 inline-flex min-h-11 items-center rounded-sm px-1 py-1.5 underline underline-offset-2 hover:text-foreground md:-my-1.5 md:min-h-8"
                  >
                    退出预览
                  </button>
                </span>
              </div>
            )}
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
