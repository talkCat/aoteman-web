'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Download, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { findDemoCitation } from '@/lib/citation-demo';
import {
  apiErrorMessage,
  downloadCitationDocument,
  getCitationDetail,
  KnowledgeApiError,
} from '@/lib/knowledge-api';
import type { CitationDetail } from '@/types/citation';

/**
 * 引用详情抽屉。
 *
 * 列表阶段只消费 agent.citation 的快照；打开抽屉后才按 citationId 查询父块 / 相邻块 / 原文权限。
 * 预览模式（?preview=1）没有真实 citationId，继续使用 citation-demo 的静态详情。
 * 设计依据：前端设计 §11.4 / §11.5，接口清单 §6.2 / §6.3。
 */
export function CitationSheet({
  citationId,
  open,
  onOpenChange,
  isAdmin,
  preview = false,
  onRestoreFocus,
}: {
  citationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin?: boolean;
  /** 静态预览模式：详情取自 citation-demo，不请求控制面。 */
  preview?: boolean;
  /** Radix 关闭抽屉后回调，用于把焦点还给触发它的引用按钮（由调用方决定焦点落到哪） */
  onRestoreFocus?: () => void;
}) {
  const [detail, setDetail] = useState<CitationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  // 连续切换引用时只接受最后一次请求的结果，避免慢响应覆盖新引用。
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!open || !citationId) {
      requestIdRef.current += 1;
      setDetail(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (preview) {
      const demo = findDemoCitation(citationId);
      setDetail(demo);
      setError(demo ? null : '该引用不存在或已失效');
      setLoading(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setDetail(null);
    setError(null);
    setLoading(true);

    getCitationDetail(citationId)
      .then(next => {
        if (requestIdRef.current !== requestId) return;
        setDetail(next);
      })
      .catch((cause: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setError(
          cause instanceof KnowledgeApiError && cause.status === 404
            ? '该引用不存在或已失效'
            : apiErrorMessage(cause),
        );
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  }, [citationId, open, preview]);

  async function handleDownload() {
    if (!citationId || !detail || preview || downloading) return;
    setDownloading(true);
    try {
      const response = await downloadCitationDocument(citationId);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filenameFromDisposition(
        response.headers.get('content-disposition'),
        detail.citation.fileName || '原文',
      );
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // 先让浏览器接管下载，再释放 blob URL。
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (cause: unknown) {
      toast.error(apiErrorMessage(cause));
    } finally {
      setDownloading(false);
    }
  }

  const parent = detail?.parent ?? null;
  const meta = detail
    ? [
        detail.citation.kbName,
        detail.citation.chunkTotal > 0
          ? `第 ${detail.citation.chunkOrdinal}/${detail.citation.chunkTotal} 块`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* 抽屉只有标题与结构化内容，没有描述文案：显式声明，避免 Radix 反复告警 */}
      <SheetContent
        side="right"
        aria-describedby={undefined}
        className="flex w-full flex-col p-0 sm:max-w-[480px]"
        onCloseAutoFocus={event => {
          event.preventDefault();
          onRestoreFocus?.();
        }}
      >
        <SheetTitle className="sr-only">引用详情</SheetTitle>

        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            正在加载引用详情…
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {error}
          </div>
        ) : !detail ? (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
            引用已失效
          </div>
        ) : (
          <>
            <div className="border-b border-border/60 px-5 py-4 pr-12">
              <div className="flex items-center gap-2">
                <span className="surface-chip inline-flex h-5 shrink-0 items-center rounded bg-primary/10 px-1.5 font-mono text-[11px] font-medium text-primary">
                  {detail.citation.ref}
                </span>
                <h2 className="min-w-0 truncate text-sm font-semibold">{detail.citation.fileName}</h2>
              </div>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">{meta}</p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {detail.accessRevoked && (
                <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
                  你已失去该知识库的访问权限，以下是回答当时的快照。
                </div>
              )}
              {detail.documentDeleted && (
                <div className="mb-4 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  原文已删除，仅保留当时的快照片段。
                </div>
              )}

              {detail.citation.headingPath && (
                <section>
                  <h4 className="text-[11px] font-medium text-muted-foreground">章节路径</h4>
                  <p className="mt-1 text-xs leading-relaxed">{detail.citation.headingPath}</p>
                </section>
              )}

              <section className="mt-4">
                <h4 className="text-[11px] font-medium text-muted-foreground">快照片段</h4>
                <div className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-foreground/90">
                  {detail.citation.snippet}
                </div>
              </section>

              {parent && (
                <Collapsible className="group mt-4">
                  <CollapsibleTrigger className="ui-interactive ui-focus-ring flex w-full items-center justify-between rounded-md border border-border/60 px-3 py-2 text-xs text-foreground/90 hover:bg-accent">
                    <span>所属章节全文</span>
                    <ChevronDown
                      className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                      aria-hidden="true"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                    {parent.content}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {isAdmin && (detail.citation.vectorScore !== null || detail.citation.rerankScore !== null) && (
                <div className="mt-4 flex items-start gap-2 rounded-md border border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="font-medium text-foreground/80">检索得分（管理员可见）</span>
                    <span className="ml-2 font-mono">
                      向量 {detail.citation.vectorScore === null ? '—' : detail.citation.vectorScore.toFixed(2)}
                    </span>
                    <span className="mx-1" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono">
                      重排 {detail.citation.rerankScore === null ? '—' : detail.citation.rerankScore.toFixed(2)}
                    </span>
                  </span>
                </div>
              )}
            </div>

            <div className="border-t border-border/60 px-5 py-3">
              {!detail.accessRevoked && !detail.documentDeleted ? (
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={preview || downloading}
                    title={preview ? '预览模式不提供原文下载' : undefined}
                    onClick={handleDownload}
                  >
                    {downloading ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {downloading ? '下载中…' : '下载原文'}
                  </Button>
                  {/*
                    详情接口只返回 prev/next chunkId，没有「按 chunkId 查询」的接口；
                    先禁用并说明原因，不用静态 toast 冒充已对接的跳转。
                  */}
                  <div
                    className="flex items-center gap-1"
                    title="相邻块跳转待后端提供按 chunkId 查询的接口"
                  >
                    <span className="mr-1 h-5 w-px bg-border" aria-hidden="true" />
                    <Button variant="ghost" size="sm" className="gap-1 px-2" disabled>
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      上一块
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-1 px-2" disabled>
                      下一块
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">当前状态不提供原文下载与相邻块浏览。</p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** 从 Content-Disposition 解析文件名，优先 RFC 5987 的 filename*。 */
function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ''));
    } catch {
      return fallback;
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || fallback;
}
