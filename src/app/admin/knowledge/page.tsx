'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, MoreHorizontal, Plus, RefreshCw, Search, X } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/admin/EmptyState';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusBadge, type StatusTone } from '@/components/admin/StatusBadge';
import { NewKnowledgeBaseDialog } from '@/components/knowledge/NewKnowledgeBaseDialog';
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
  createKnowledgeBase,
  deleteKnowledgeBase,
  fetchKnowledgeBaseSummaries,
} from '@/lib/knowledge-api';
import { GLOBAL_EMBEDDING } from '@/lib/knowledge-config';
import { formatCount, formatDateTime } from '@/lib/knowledge-format';
import type { KnowledgeBaseStatus, KnowledgeBaseSummary } from '@/types/knowledge';

type SortKey = 'updated' | 'name' | 'documents';

const STATUS_META: Record<KnowledgeBaseStatus, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: '启用', tone: 'success' },
  DISABLED: { label: '停用', tone: 'muted' },
  DELETED: { label: '已删除', tone: 'muted' },
};

/** 列表接口不聚合切片数，未知时显示占位而不是 0（0 会被误读成「空库」）。 */
function chunkLabel(value: number | null): string {
  return value === null ? '—' : formatCount(value);
}

/**
 * 知识库列表。
 * 设计依据：2026-11-04-知识库与专家模型前端设计.md §6。
 * 数据来源：GET /api/admin/knowledge/bases（经 BFF）。
 */
export default function KnowledgeListPage() {
  const router = useRouter();
  const [bases, setBases] = useState<KnowledgeBaseSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBaseSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setBases(await fetchKnowledgeBaseSummaries());
    } catch (error) {
      setLoadError(apiErrorMessage(error));
      setBases(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleBases = useMemo(() => {
    if (!bases) return [];
    const keyword = query.trim().toLowerCase();
    return bases
      // 后端列表接口不过滤软删（接口清单 §2.2），这里再兜一层。
      .filter((base) => base.status !== 'DELETED')
      .filter((base) => {
        if (!keyword) return true;
        return (
          base.name.toLowerCase().includes(keyword) ||
          (base.description ?? '').toLowerCase().includes(keyword)
        );
      })
      .sort((a, b) => {
        if (sortKey === 'name') return a.name.localeCompare(b.name, 'zh-CN');
        if (sortKey === 'documents') return b.documentCount - a.documentCount;
        return b.updatedAt - a.updatedAt;
      });
  }, [bases, query, sortKey]);

  async function handleCreate(input: {
    name: string;
    description: string;
    strategy: KnowledgeBaseSummary['strategy'];
  }) {
    try {
      const created = await createKnowledgeBase({
        name: input.name,
        description: input.description || null,
        chunkStrategy: input.strategy,
      });
      toast.success('已创建知识库', { description: created.name });
      router.push(`/admin/knowledge/${created.kbId}`);
    } catch (error) {
      toast.error('创建知识库失败', { description: apiErrorMessage(error) });
      throw error;
    }
  }

  async function deleteBase(base: KnowledgeBaseSummary) {
    setDeleting(true);
    try {
      await deleteKnowledgeBase(base.kbId);
      setBases((current) => (current ? current.filter((item) => item.kbId !== base.kbId) : current));
      setDeleteTarget(null);
      toast.success('已删除知识库', { description: `${base.name}：历史引用快照仍保留` });
    } catch (error) {
      toast.error('删除知识库失败', { description: apiErrorMessage(error) });
    } finally {
      setDeleting(false);
    }
  }

  const totalCount = bases?.filter((base) => base.status !== 'DELETED').length ?? 0;
  const hasQuery = query.trim().length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="知识库"
        description="管理 20–30 个知识库，供专家模型与直接授权用户检索。文档只收 .docx，切片结果在这里核对。"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            新建知识库
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
            aria-label="搜索知识库"
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
        <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
          <SelectTrigger className="h-11 w-[132px] md:h-9" aria-label="排序方式">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">最近更新</SelectItem>
            <SelectItem value="name">名称</SelectItem>
            <SelectItem value="documents">文档数</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {bases
            ? hasQuery
              ? `显示 ${visibleBases.length} / ${totalCount} 个知识库`
              : `${totalCount} 个知识库`
            : loadError
              ? '加载失败'
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
      ) : !bases ? (
        <div className="surface-raised overflow-hidden rounded-xl border border-border/70 bg-card" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 border-b border-border/50 px-4 py-3.5 last:border-b-0">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="ml-auto h-3 w-10" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      ) : visibleBases.length === 0 ? (
        <EmptyState
          title={hasQuery ? `没有匹配「${query.trim()}」的知识库` : '还没有知识库'}
          description={hasQuery ? '换个关键词，也可以清除筛选后重试。' : '先建一个库，再上传 .docx 文档。'}
          action={
            hasQuery ? (
              <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                清除筛选
              </Button>
            ) : (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                新建知识库
              </Button>
            )
          }
        />
      ) : (
        <div className="surface-raised overflow-hidden rounded-xl border border-border/70 bg-card">
          <div className="hidden grid-cols-[minmax(0,1fr)_64px_80px_88px_96px_112px_40px] items-center gap-3 border-b border-border/60 bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
            <span>名称</span>
            <span className="text-right">文档</span>
            <span className="text-right">切片</span>
            <span className="text-right">授权用户</span>
            <span>状态</span>
            <span className="text-right">更新</span>
            <span className="sr-only">操作</span>
          </div>

          <div className="divide-y divide-border/50">
            {visibleBases.map((base) => {
              const meta = STATUS_META[base.status];
              return (
                <div
                  key={base.kbId}
                  className="ui-interactive ui-focus-row relative grid grid-cols-1 gap-2 px-4 py-3.5 hover:bg-accent/60 focus-within:bg-accent/40 md:grid-cols-[minmax(0,1fr)_64px_80px_88px_96px_112px_40px] md:items-center md:gap-3"
                >
                  <div className="min-w-0 pr-12 md:pr-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/knowledge/${base.kbId}`}
                        data-row-link
                        className="truncate text-sm font-medium after:absolute after:inset-0 after:content-['']"
                      >
                        {base.name}
                      </Link>
                      <span className="md:hidden">
                        <StatusBadge tone={meta.tone} label={meta.label} />
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {base.description ?? '未填写描述'}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground md:hidden">
                      <span className="whitespace-nowrap font-mono tabular-nums">
                        {formatCount(base.documentCount)} 份文档 · {chunkLabel(base.chunkCount)} 块
                      </span>
                      <span className="whitespace-nowrap font-mono tabular-nums">
                        {formatCount(base.grantCount)} 人授权 · {formatDateTime(base.updatedAt)}
                      </span>
                    </p>
                  </div>

                  <span className="hidden text-right font-mono text-xs tabular-nums md:block">
                    {formatCount(base.documentCount)}
                  </span>
                  <span className="hidden text-right font-mono text-xs tabular-nums md:block">
                    {chunkLabel(base.chunkCount)}
                  </span>
                  <span className="hidden text-right font-mono text-xs tabular-nums md:block">
                    {formatCount(base.grantCount)}
                  </span>
                  <span className="hidden md:block">
                    <StatusBadge tone={meta.tone} label={meta.label} />
                  </span>
                  <span className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground md:block">
                    {formatDateTime(base.updatedAt)}
                  </span>

                  <div className="absolute right-1 top-1 z-10 flex justify-end md:relative md:right-auto md:top-auto md:justify-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 text-muted-foreground md:h-8 md:w-8"
                          aria-label={`知识库「${base.name}」的更多操作`}
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onSelect={() => router.push(`/admin/knowledge/${base.kbId}?tab=grants`)}>
                          授权用户
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => router.push(`/admin/knowledge/${base.kbId}?tab=settings`)}>
                          设置
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setDeleteTarget(base)}
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

      <p className="text-xs leading-relaxed text-muted-foreground">
        切片策略：自动会识别目录，识别不到时按固定长度切；建库后可在设置里调整。
      </p>

      <NewKnowledgeBaseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        embedding={GLOBAL_EMBEDDING}
        onCreate={handleCreate}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${formatCount(deleteTarget.documentCount)} 份文档将不再参与检索，历史引用仍保留快照。此操作不可撤销。`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) void deleteBase(deleteTarget);
              }}
            >
              {deleting ? '删除中…' : '删除知识库'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}