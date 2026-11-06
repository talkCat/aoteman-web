'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Download, FileText, Loader2, Presentation } from 'lucide-react';

import { Markdown } from '@/components/Markdown';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  artifactContentUrl,
  artifactFileName,
  artifactKind,
  fetchArtifactContent,
  type ArtifactItem,
} from '@/lib/artifacts';

/** 人类可读体积。 */
function humanSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** PPTX 用演示文稿图标，其余沿用文档图标；仅影响卡片标识，不改变能力判定。 */
function ArtifactTypeIcon({ kind, className }: { kind: string; className?: string }) {
  return kind === 'pptx' ? <Presentation className={className} /> : <FileText className={className} />;
}

/**
 * 回合产物卡片 + 右侧预览抽屉（Markdown 内嵌渲染，PPTX 只提供下载）。
 *
 * 见 doc/design/2026-10-15 智能体产物预览与沙箱适配设计.md §15.4：
 * 每个回合下方展示本轮推导出的产物，点击卡片在右侧 Sheet 内打开。
 */
export function TurnArtifacts({
  artifacts,
  userId,
  sessionId,
  onOpen,
}: {
  artifacts: ArtifactItem[];
  userId: string;
  sessionId?: string;
  /** 传入后点击卡片改为在画布中打开；不传则沿用右侧抽屉预览。 */
  onOpen?: (artifact: ArtifactItem) => void;
}) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = artifacts.find(item => item.workspacePath === openPath) ?? null;

  useEffect(() => {
    if (!active) return;
    // PPTX 不请求正文：服务端对非下载请求返回 415，抽屉只展示文件信息与下载入口。
    if (artifactKind(active.workspacePath) !== 'markdown') {
      setLoading(false);
      setError(null);
      setContent('');
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    setContent('');
    fetchArtifactContent(userId, sessionId, active.workspacePath)
      .then(text => {
        if (alive) setContent(text);
      })
      .catch(err => {
        if (alive) setError(err instanceof Error ? err.message : '加载产物内容失败');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [active, userId, sessionId]);

  if (artifacts.length === 0) return null;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {artifacts.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => (onOpen ? onOpen(item) : setOpenPath(item.workspacePath))}
            title={`预览 ${artifactFileName(item.workspacePath)}`}
            className="ui-interactive ui-focus-ring group flex max-w-full cursor-pointer items-center gap-2.5 rounded-xl border border-line-1 bg-surface-1 px-3 py-2 text-left hover:border-accent-line hover:bg-surface-2"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ArtifactTypeIcon kind={artifactKind(item.workspacePath)} className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">
                {artifactFileName(item.workspacePath)}
              </span>
              <span className="block truncate text-[11px] text-fg-3">
                {humanSize(item.size) ? `${humanSize(item.size)} · ` : ''}
                {artifactKind(item.workspacePath) === 'pptx' ? 'PPTX' : 'Markdown'} ·{' '}
                {onOpen ? '在画布打开' : '点击预览'}
              </span>
            </span>
          </button>
        ))}
      </div>

      <Sheet
        open={active !== null}
        onOpenChange={open => {
          if (!open) setOpenPath(null);
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          <SheetTitle className="sr-only">
            {active ? artifactFileName(active.workspacePath) : '产物预览'}
          </SheetTitle>
          {active && (
            <>
              <div className="flex items-center gap-3 border-b border-border px-4 py-3 pr-12">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ArtifactTypeIcon kind={artifactKind(active.workspacePath)} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {artifactFileName(active.workspacePath)}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {active.workspacePath}
                  </p>
                </div>
                <a
                  href={artifactContentUrl(userId, sessionId, active.workspacePath, true)}
                  download
                  title="下载"
                  className="ui-interactive ui-focus-ring inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                  下载
                </a>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {loading && (
                  <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在加载产物内容…
                  </div>
                )}
                {!loading && error && (
                  <div className="flex items-center gap-2 py-6 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </div>
                )}
                {!loading && !error && artifactKind(active.workspacePath) === 'markdown' && (
                  <Markdown content={content} />
                )}
                {!loading && !error && artifactKind(active.workspacePath) !== 'markdown' && (
                  <div className="rounded-xl border border-line-1 bg-surface-1 px-5 py-8 text-center">
                    <p className="text-sm text-fg-2">该产物不支持内嵌预览，请下载后查看。</p>
                    <a
                      href={artifactContentUrl(userId, sessionId, active.workspacePath, true)}
                      download
                      className="ui-interactive ui-focus-ring mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      <Download className="h-3.5 w-3.5" />
                      下载文件
                    </a>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}