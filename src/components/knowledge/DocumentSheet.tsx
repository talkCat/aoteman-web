'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Download, FileText, RefreshCw } from 'lucide-react';

import { StatusBadge, type StatusTone } from '@/components/admin/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { apiErrorMessage, listChunks, toChunk, type ChunkPageDto } from '@/lib/knowledge-api';
import {
  STAGE_LABEL,
  STRATEGY_LABEL,
  formatBytes,
  formatDateTime,
  formatFullDateTime,
} from '@/lib/knowledge-format';
import { cn } from '@/lib/utils';
import type {
  DocumentStatus,
  KnowledgeChunk,
  KnowledgeDocumentSummary,
  KnowledgeDocumentVersion,
} from '@/types/knowledge';

const DOC_STATUS: Record<DocumentStatus, { label: string; tone: StatusTone }> = {
  READY: { label: '可检索', tone: 'success' },
  PROCESSING: { label: '入库中', tone: 'primary' },
  UPLOADED: { label: '待入库', tone: 'muted' },
  FAILED: { label: '入库失败', tone: 'destructive' },
};

const VERSION_STATUS: Record<KnowledgeDocumentVersion['status'], { label: string; tone: StatusTone }> = {
  READY: { label: '就绪', tone: 'success' },
  PROCESSING: { label: '处理中', tone: 'primary' },
  PENDING: { label: '排队中', tone: 'muted' },
  FAILED: { label: '失败', tone: 'destructive' },
};

const PAGE_SIZE = 20;

/**
 * 文档详情抽屉：版本历史 + 父子切片预览。
 *
 * 切片按「版本 + 类型 + 页码」走服务端分页（接口清单 §3.5），不在前端一次性拉全量。
 * 管理员验证切片质量的唯一入口，所以必须显示 headingPath / ordinal / charCount。
 * 设计依据：设计文档 §7.6。
 */
export function DocumentSheet({
  open,
  onOpenChange,
  doc,
  versions,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: KnowledgeDocumentSummary | null;
  /** 该文档的版本列表（父组件已按 documentId 过滤）。 */
  versions: KnowledgeDocumentVersion[];
  onRetry?: (doc: KnowledgeDocumentSummary) => void;
}) {
  const [chunkType, setChunkType] = useState<'PARENT' | 'CHILD'>('CHILD');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [chunkPage, setChunkPage] = useState<ChunkPageDto | null>(null);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [chunksError, setChunksError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const docVersions = useMemo(
    () => (doc ? versions.filter((item) => item.documentId === doc.documentId) : []),
    [doc, versions],
  );

  const currentVersion =
    docVersions.find((item) => item.isCurrent) ?? docVersions[0] ?? null;
  const selectedVersion =
    docVersions.find((item) => item.versionId === selectedVersionId) ?? currentVersion;

  // 换文档 / 重新打开时重置视图状态。
  useEffect(() => {
    setChunkType('CHILD');
    setPage(1);
    setExpanded(new Set());
    setChunkPage(null);
    setChunksError(null);
    setSelectedVersionId(null);
  }, [doc?.documentId, open]);

  // 默认选中当前召回版本；历史版本由用户点击切换。
  useEffect(() => {
    if (!open || !doc || selectedVersionId) return;
    const fallback = docVersions.find((item) => item.isCurrent) ?? docVersions[0];
    if (fallback) setSelectedVersionId(fallback.versionId);
  }, [open, doc, docVersions, selectedVersionId]);

  useEffect(() => {
    if (!open || !doc || !selectedVersionId) {
      setChunkPage(null);
      return;
    }
    let cancelled = false;
    setLoadingChunks(true);
    setChunksError(null);
    listChunks(doc.documentId, {
      versionId: selectedVersionId,
      type: chunkType,
      page,
      size: PAGE_SIZE,
    })
      .then((result) => {
        if (!cancelled) setChunkPage(result);
      })
      .catch((error) => {
        if (cancelled) return;
        setChunkPage(null);
        setChunksError(apiErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoadingChunks(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, doc, selectedVersionId, chunkType, page, reloadKey]);

  const chunks: KnowledgeChunk[] = useMemo(
    () =>
      chunkPage
        ? chunkPage.items.map((item) => toChunk(item, selectedVersionId ?? '', chunkPage.total))
        : [],
    [chunkPage, selectedVersionId],
  );

  const totalPages = Math.max(1, Math.ceil((chunkPage?.total ?? 0) / (chunkPage?.size ?? PAGE_SIZE)));
  const status = doc ? DOC_STATUS[doc.status] : null;

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
        <SheetHeader className="space-y-2 border-b border-border/60 px-5 py-4 text-left">
          <div className="flex items-start gap-2 pr-8">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <SheetTitle className="truncate text-base">{doc?.fileName ?? '文档详情'}</SheetTitle>
              <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                {doc && status && <StatusBadge tone={status.tone} label={status.label} />}
                {doc && (
                  <>
                    <span className="font-mono tabular-nums">版本 v{doc.versionNo}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{formatBytes(doc.fileSize)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{STRATEGY_LABEL[doc.strategy ?? 'AUTO']}</span>
                    {doc.tocDetected && doc.headingLevels ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>识别 {doc.headingLevels} 级标题</span>
                      </>
                    ) : null}
                  </>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {doc && (
            <section aria-labelledby="doc-info-heading">
              <h3 id="doc-info-heading" className="mb-2 text-xs font-medium text-muted-foreground">
                文档信息
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div className="min-w-0">
                  <dt className="text-[11px] text-muted-foreground">文档 ID</dt>
                  <dd className="truncate font-mono text-[11px]">{doc.documentId}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">切片数</dt>
                  <dd className="font-mono tabular-nums">
                    {doc.status === 'READY' ? doc.chunkCount ?? 0 : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">更新时间</dt>
                  <dd className="font-mono tabular-nums">{formatFullDateTime(doc.updatedAt)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">当前阶段</dt>
                  <dd>{doc.stage ? STAGE_LABEL[doc.stage] : doc.status === 'READY' ? '已完成' : '—'}</dd>
                </div>
              </dl>

              {doc.status === 'FAILED' && doc.failureMessage && (
                <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2">
                  <p className="text-[11px] leading-relaxed text-destructive">
                    失败于 {doc.stage ? STAGE_LABEL[doc.stage] : '未知阶段'}（{doc.failureCode ?? 'UNKNOWN'}）：
                    {doc.failureMessage}
                  </p>
                  {onRetry && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 h-7 border-primary/40 text-primary"
                      onClick={() => onRetry(doc)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      重新入库
                    </Button>
                  )}
                </div>
              )}
            </section>
          )}

          <section aria-labelledby="doc-versions-heading">
            <div className="mb-2 flex items-center justify-between">
              <h3 id="doc-versions-heading" className="text-xs font-medium text-muted-foreground">
                版本历史
              </h3>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {docVersions.length} 个版本
              </span>
            </div>

            {docVersions.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-[11px] text-muted-foreground">
                暂无版本记录。
              </p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border">
                {docVersions.map((version) => {
                  const meta = VERSION_STATUS[version.status];
                  const active = version.versionId === selectedVersion?.versionId;
                  return (
                    <li key={version.versionId}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedVersionId(version.versionId);
                          setPage(1);
                          setExpanded(new Set());
                        }}
                        aria-pressed={active}
                        className={cn(
                          'ui-interactive ui-focus-row flex w-full items-start gap-3 px-3 py-2.5 text-left',
                          active ? 'bg-primary/5' : 'hover:bg-accent/60',
                        )}
                      >
                        <span className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                          v{version.versionNo}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge tone={meta.tone} label={meta.label} />
                            {version.isCurrent && (
                              <span className="rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">
                                当前召回
                              </span>
                            )}
                            {active && !version.isCurrent && (
                              <span className="rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                                预览中
                              </span>
                            )}
                            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                              {version.chunkCount === null ? '—' : `${version.chunkCount} 块`}
                            </span>
                            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                              {formatDateTime(version.createdAt)}
                            </span>
                          </div>
                          {version.failureMessage && (
                            <p className="mt-1 text-[11px] leading-relaxed text-destructive">
                              {version.failureMessage}
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="doc-chunks-heading">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 id="doc-chunks-heading" className="text-xs font-medium text-muted-foreground">
                切片预览
                {selectedVersion && (
                  <span className="ml-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                    v{selectedVersion.versionNo}
                  </span>
                )}
              </h3>
              <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="切片类型">
                {(['PARENT', 'CHILD'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={chunkType === type}
                    onClick={() => {
                      setChunkType(type);
                      setPage(1);
                      setExpanded(new Set());
                    }}
                    className={cn(
                      'ui-interactive ui-focus-ring min-h-11 rounded px-3 py-1.5 text-[11px] md:min-h-0 md:px-2 md:py-1',
                      chunkType === type
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {type === 'PARENT' ? '父块' : '子块'}
                  </button>
                ))}
              </div>
            </div>

            {chunksError ? (
              <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3">
                <p className="flex items-center gap-1.5 text-[11px] text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {chunksError}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7"
                  onClick={() => setReloadKey((key) => key + 1)}
                >
                  重试
                </Button>
              </div>
            ) : loadingChunks && !chunkPage ? (
              <div className="space-y-2" aria-busy="true">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : chunks.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-3 py-6 text-center">
                <p className="text-[11px] text-muted-foreground">
                  {selectedVersion && selectedVersion.status !== 'READY'
                    ? '该版本尚未完成入库，暂时没有切片。'
                    : '该版本没有切片'}
                </p>
                {doc && doc.tocDetected === false && (doc.strategy ?? 'AUTO') === 'AUTO' && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    未识别到标题结构，已按固定长度切片。
                  </p>
                )}
              </div>
            ) : (
              <ul className="space-y-2">
                {chunks.map((chunk) => {
                  const isOpen = expanded.has(chunk.chunkId);
                  return (
                    <li key={chunk.chunkId} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="rounded bg-background px-1 font-mono text-[10px] uppercase text-muted-foreground">
                          {chunk.chunkType}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                          {chunk.headingPath ?? '（无标题）'}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                          ord {chunk.ordinal}
                        </span>
                      </div>
                      <p
                        className={cn(
                          'mt-1.5 whitespace-pre-wrap text-[12px] leading-6 text-foreground/85',
                          !isOpen && 'line-clamp-3',
                        )}
                      >
                        {chunk.content}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tabular-nums text-muted-foreground">
                        <span>{chunk.charCount} 字</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          第 {chunk.ordinal}/{chunk.ordinalTotal} 块
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleExpanded(chunk.chunkId)}
                          className="ui-interactive ui-focus-ring relative -my-2 -mr-1 ml-auto inline-flex min-h-9 items-center rounded px-1 py-2 text-primary underline-offset-2 after:absolute after:-inset-x-1 after:-inset-y-1 after:content-[''] hover:underline"
                        >
                          {isOpen ? '收起' : '展开全文'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {!chunksError && (chunkPage?.total ?? 0) > 0 && (
              <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-mono tabular-nums">
                  第 {chunkPage?.page ?? page}/{totalPages} 页 · 共 {chunkPage?.total ?? 0} 块
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    disabled={page === 1 || loadingChunks}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    aria-label="上一页"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    disabled={page >= totalPages || loadingChunks}
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    aria-label="下一页"
                  >
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-5 py-3">
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            建议先抽查父块标题是否覆盖了完整章节。
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-11 shrink-0 md:h-8"
            disabled
            title="管理员下载原文接口尚未开放"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            下载原文
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}