'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Download, FileText, Loader2 } from 'lucide-react';

import { Markdown } from '@/components/Markdown';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  artifactContentUrl,
  artifactFileName,
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

/**
 * 回合产物卡片 + 右侧 Markdown 预览抽屉。
 *
 * 见 doc/design/2026-10-15 智能体产物预览与沙箱适配设计.md §15.4：
 * 每个回合下方展示本轮推导出的 Markdown 产物，点击卡片在右侧 Sheet 内渲染。
 */
export function TurnArtifacts({
  artifacts,
  userId,
  sessionId,
}: {
  artifacts: ArtifactItem[];
  userId: string;
  sessionId?: string;
}) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = artifacts.find(item => item.workspacePath === openPath) ?? null;

  useEffect(() => {
    if (!active) return;
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
            onClick={() => setOpenPath(item.workspacePath)}
            title={`预览 ${artifactFileName(item.workspacePath)}`}
            className="flex max-w-full cursor-pointer items-center gap-2.5 rounded-xl border border-border/70 bg-card px-3 py-2 text-left shadow-soft transition-colors hover:border-primary/40 hover:bg-accent"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">
                {artifactFileName(item.workspacePath)}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {humanSize(item.size) ? `${humanSize(item.size)} · ` : ''}Markdown · 点击预览
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
                  <FileText className="h-4 w-4" />
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
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
                {!loading && !error && <Markdown content={content} />}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}