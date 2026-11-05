'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, BrainCircuit, MoreHorizontal, Plus, RefreshCw, Search, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/admin/EmptyState';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusBadge, type StatusTone } from '@/components/admin/StatusBadge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  apiErrorMessage,
  deleteExpert,
  fetchKnowledgeBaseSummaries,
  getExpertGrants,
  listAdminExperts,
  listAdminUsers,
  toAdminExpert,
  updateExpert,
  type ExpertCommand,
} from '@/lib/knowledge-api';
import { formatDateTime, initialOf } from '@/lib/knowledge-format';
import { cn } from '@/lib/utils';
import type { AdminExpertDetail, ExpertStatus, GrantUser } from '@/types/knowledge';

const STATUS_META: Record<ExpertStatus, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: '已发布', tone: 'success' },
  DRAFT: { label: '草稿', tone: 'warning' },
  DISABLED: { label: '已停用', tone: 'muted' },
  DELETED: { label: '已删除', tone: 'muted' },
};

type StatusFilter = 'ALL' | 'ACTIVE' | 'DRAFT' | 'DISABLED';

/**
 * 专家 PATCH 是全量覆盖：六个字段必须全传，漏传会被写空。
 * 列表页只改状态，所以先把原有字段原样铺开，再覆盖 status。
 */
function toExpertCommand(expert: AdminExpertDetail, status: ExpertCommand['status']): ExpertCommand {
  return {
    name: expert.name,
    description: expert.description ?? '',
    avatarUrl: expert.avatarUrl ?? '',
    welcomeMessage: expert.welcomeMessage ?? '',
    systemPrompt: expert.systemPrompt,
    status,
  };
}

/**
 * 专家模型列表。
 *
 * 专家是独立模块（提示词 + 知识库 + 技能 + MCP + 授权用户），不是知识库的附属物。
 * 列表用行式布局方便横向比较资源数量和授权范围，不做卡片墙。
 * 设计依据：设计文档 §9.1。
 */
export default function ExpertsPage() {
  const [experts, setExperts] = useState<AdminExpertDetail[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [deleteTarget, setDeleteTarget] = useState<AdminExpertDetail | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      setLoadError(null);
      setExperts(null);
    }
    try {
      // 列表接口只给 kbIds，授权数要逐专家取；内部使用、量大不了，直接并发即可。
      const [dtos, bases, users] = await Promise.all([
        listAdminExperts(),
        fetchKnowledgeBaseSummaries(),
        listAdminUsers(),
      ]);
      const grantIdLists = await Promise.all(
        dtos.map((item) => getExpertGrants(item.expertId).catch(() => [] as string[])),
      );

      const userById = new Map(users.map((user) => [user.userId, user]));
      const fallback = (userId: string): GrantUser => ({
        userId,
        username: userId,
        displayName: userId,
        email: null,
        roles: [],
        status: 'UNKNOWN',
      });

      setExperts(
        dtos.map((dto, index) =>
          toAdminExpert(dto, {
            bases,
            grants: (grantIdLists[index] ?? []).map(
              (userId) => userById.get(userId) ?? fallback(userId),
            ),
          }),
        ),
      );
    } catch (error) {
      if (!options.silent) {
        setLoadError(apiErrorMessage(error));
        setExperts(null);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  const visibleExperts = useMemo(() => {
    if (!experts) return [];
    const keyword = query.trim().toLowerCase();
    return experts
      .filter((expert) => (statusFilter === 'ALL' ? true : expert.status === statusFilter))
      .filter((expert) => {
        if (!keyword) return true;
        return (
          expert.name.toLowerCase().includes(keyword) ||
          (expert.description ?? '').toLowerCase().includes(keyword)
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [experts, query, statusFilter]);

  const totalCount = experts?.length ?? 0;
  const activeCount = experts?.filter((expert) => expert.status === 'ACTIVE').length ?? 0;
  const hasQuery = query.trim().length > 0;
  const hasFilters = hasQuery || statusFilter !== 'ALL';

  async function publish(expert: AdminExpertDetail) {
    if (!expert.systemPrompt.trim()) {
      toast.error('系统提示词为空，无法发布', { description: '专家需要一段角色与语气约束。' });
      return;
    }
    setBusyId(expert.expertId);
    try {
      await updateExpert(expert.expertId, toExpertCommand(expert, 'ACTIVE'));
      await load({ silent: true });
      const grants = expert.resources.grantCount;
      toast.success(`已发布「${expert.name}」`, {
        description:
          grants > 0
            ? `发布后，${grants} 位已授权用户可以在问答页选择它。`
            : '还没有被授权用户，发布后暂时无人可见。',
      });
    } catch (error) {
      toast.error('发布失败', { description: apiErrorMessage(error) });
    } finally {
      setBusyId(null);
    }
  }

  async function disable(expert: AdminExpertDetail) {
    setBusyId(expert.expertId);
    try {
      await updateExpert(expert.expertId, toExpertCommand(expert, 'DISABLED'));
      await load({ silent: true });
      toast.success('已停用专家', {
        description: `${expert.name}：授权关系保留，重新发布即可恢复。`,
      });
    } catch (error) {
      toast.error('停用失败', { description: apiErrorMessage(error) });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(expert: AdminExpertDetail) {
    setBusyId(expert.expertId);
    try {
      await deleteExpert(expert.expertId);
      setExperts((previous) =>
        previous ? previous.filter((item) => item.expertId !== expert.expertId) : previous,
      );
      setDeleteTarget(null);
      toast.success('已删除专家', {
        description: '历史会话中的专家名称快照仍会保留。',
      });
    } catch (error) {
      toast.error('删除专家失败', { description: apiErrorMessage(error) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="专家模型"
        description="每个专家由提示词、知识库与用户授权组成；发布后，被授权用户可在问答页选择一个或多个专家协同回答。"
        actions={
          <Button asChild>
            <Link href="/admin/experts/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              新建专家
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-[280px]">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称或描述"
            aria-label="搜索专家"
            className="h-11 pr-9 pl-8 md:h-9"
          />
          {hasQuery && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="ui-interactive ui-focus-ring absolute right-0 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded md:right-1.5 md:h-6 md:w-6 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="清除搜索"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
          <SelectTrigger className="h-11 w-[132px] md:h-9" aria-label="按状态筛选">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部状态</SelectItem>
            <SelectItem value="ACTIVE">已发布</SelectItem>
            <SelectItem value="DRAFT">草稿</SelectItem>
            <SelectItem value="DISABLED">已停用</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {experts
            ? hasFilters
              ? `显示 ${visibleExperts.length} / ${totalCount} 个专家`
              : `${totalCount} 个专家 · ${activeCount} 个已发布`
            : '加载中…'}
        </span>
      </div>

      {loadError ? (
        <div
          role="alert"
          className="surface-raised flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            重试
          </Button>
        </div>
      ) : null}

      {!experts ? (
        <div className="surface-raised overflow-hidden rounded-xl border border-border/70 bg-card" aria-busy="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 border-b border-border/50 px-4 py-3.5 last:border-b-0">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="ml-auto h-3 w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      ) : visibleExperts.length === 0 ? (
        <EmptyState
          title={
            hasQuery
              ? `没有匹配「${query.trim()}」的专家`
              : hasFilters
                ? '当前筛选下没有专家'
                : '还没有专家模型'
          }
          description={
            hasFilters
              ? '换个关键词或状态，也可以清除筛选后重试。'
              : '先建一个专家：写清角色提示词，绑定知识库，再授权给需要使用的人。'
          }
          action={
            hasFilters ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery('');
                  setStatusFilter('ALL');
                }}
              >
                清除筛选
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link href="/admin/experts/new">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  新建专家
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="surface-raised overflow-hidden rounded-xl border border-border/70 bg-card">
          <div className="hidden grid-cols-[minmax(0,1fr)_168px_76px_84px_96px_40px] items-center gap-3 border-b border-border/60 bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span>专家</span>
            <span>资源</span>
            <span className="text-right">授权</span>
            <span>状态</span>
            <span className="text-right">更新</span>
            <span className="sr-only">操作</span>
          </div>

          <div className="divide-y divide-border/50">
            {visibleExperts.map((expert) => {
              const meta = STATUS_META[expert.status];
              return (
                <div
                  key={expert.expertId}
                  className="ui-interactive ui-focus-row relative grid grid-cols-1 gap-2 px-4 py-3.5 hover:bg-accent/60 focus-within:bg-accent/40 md:grid-cols-[minmax(0,1fr)_168px_76px_84px_96px_40px] md:items-center md:gap-3"
                >
                  <div className="flex min-w-0 items-start gap-2.5 pr-12 md:pr-0">
                    <Avatar className="mt-0.5 h-8 w-8 border border-border/60">
                      {expert.avatarUrl ? <AvatarImage src={expert.avatarUrl} alt="" /> : null}
                      <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                        {initialOf(expert.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/experts/${expert.expertId}`}
                          data-row-link
                          className="truncate text-sm font-medium after:absolute after:inset-0 after:content-['']"
                        >
                          {expert.name}
                        </Link>
                        <span className="md:hidden">
                          <StatusBadge tone={meta.tone} label={meta.label} />
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {expert.description ?? '未填写描述'}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-xs tabular-nums text-muted-foreground md:hidden">
                        <ResourceCounts resources={expert.resources} className="whitespace-nowrap" />
                        <span className="whitespace-nowrap">
                          {expert.resources.grantCount} 人授权 · {formatDateTime(expert.updatedAt)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <ResourceCounts resources={expert.resources} className="hidden md:inline-flex" />
                  <span className="hidden text-right font-mono text-xs tabular-nums md:block">
                    {expert.resources.grantCount}
                  </span>
                  <span className="hidden md:block">
                    <StatusBadge tone={meta.tone} label={meta.label} />
                  </span>
                  <span className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground md:block">
                    {formatDateTime(expert.updatedAt)}
                  </span>

                  <div className="absolute right-1 top-1 z-10 flex justify-end md:relative md:right-auto md:top-auto md:justify-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 text-muted-foreground md:h-8 md:w-8"
                          aria-label={`专家「${expert.name}」的更多操作`}
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/experts/${expert.expertId}`}>编辑</Link>
                        </DropdownMenuItem>
                        {expert.status === 'DRAFT' && (
                          <DropdownMenuItem onSelect={() => publish(expert)}>
                            <Sparkles className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                            发布
                          </DropdownMenuItem>
                        )}
                        {expert.status === 'ACTIVE' && (
                          <DropdownMenuItem onSelect={() => disable(expert)}>停用</DropdownMenuItem>
                        )}
                        {expert.status === 'DISABLED' && (
                          <DropdownMenuItem onSelect={() => publish(expert)}>重新发布</DropdownMenuItem>
                        )}
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/experts/${expert.expertId}?tab=knowledge`}>管理知识库</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setDeleteTarget(expert)}
                        >
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-x-6 gap-y-2 text-xs leading-relaxed text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <BrainCircuit className="h-3.5 w-3.5" aria-hidden="true" />
          专家是独立模块，可在问答页组合使用；不同专家会按各自的知识库分别检索。
        </span>
        <span className={cn('text-warning')}>技能与 MCP 能力尚未开放，编辑页只做只读占位。</span>
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后不再出现在问答页；已授权用户和关联知识库不会被删除，历史会话中的名称快照仍会保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busyId !== null}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) void remove(deleteTarget);
              }}
            >
              {busyId ? '删除中…' : '删除专家'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** 资源计数：0 项压暗一档，避免三个「0」和真实数据抢同一层视觉权重。 */
function ResourceCounts({
  resources,
  className,
}: {
  resources: AdminExpertDetail['resources'];
  className?: string;
}) {
  const items = [
    { count: resources.knowledgeBaseCount, unit: '库' },
    { count: resources.skillCount, unit: '技能' },
    { count: resources.mcpCount, unit: 'MCP' },
  ];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground',
        className,
      )}
    >
      {items.map((item, index) => (
        <span key={item.unit} className="inline-flex items-center gap-1.5">
          {index > 0 && (
            <span aria-hidden="true" className="opacity-50">
              ·
            </span>
          )}
          <span className={cn(item.count === 0 && 'opacity-60')}>
            {item.count} {item.unit}
          </span>
        </span>
      ))}
    </span>
  );
}