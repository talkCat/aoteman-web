'use client';

import { Download, FileText, FolderOpen, Presentation } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { isDemoArtifact } from '@/lib/artifact-demo';
import {
  artifactContentUrl,
  artifactFileName,
  artifactKind,
  artifactKindLabel,
  type ArtifactItem,
} from '@/lib/artifacts';

/** 人类可读体积；未知大小返回空串，避免列表里出现误导性的 0 B。 */
function humanSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

/** PPTX 用演示文稿图标，其余沿用文档图标。 */
function ArtifactIcon({ kind }: { kind: string }) {
  return kind === 'pptx' ? (
    <Presentation className="h-4 w-4" aria-hidden="true" />
  ) : (
    <FileText className="h-4 w-4" aria-hidden="true" />
  );
}

/**
 * 工作区产物总入口。
 *
 * 为什么需要它：本轮产物卡片依赖 write_file / edit_file 的路径推导，
 * 而 PPTX 由 PPT 技能通过 execute 执行脚本生成，且历史产物可能不属于当前会话的任何一轮，
 * 只靠卡片会让这些文件在 UI 上完全不可达。这里直接消费 /api/artifacts 的元数据，
 * 只做「打开画布 / 下载」，不推断页数、缩略图等未提供的信息。
 */
export function WorkspaceArtifactsSheet({
  open,
  onOpenChange,
  artifacts,
  userId,
  sessionId,
  onOpenArtifact,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifacts: ArtifactItem[];
  userId: string;
  sessionId?: string;
  onOpenArtifact: (artifact: ArtifactItem) => void;
}) {
  // 最近修改的排在前面；modifiedAt 缺失时保持接口原顺序（后端已按时间倒序）。
  const sorted = [...artifacts].sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[440px]"
        aria-describedby={undefined}
      >
        <div className="border-b border-line-1 px-5 py-4 pr-14">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" aria-hidden="true" />
            <SheetTitle className="text-sm font-semibold text-fg-1">工作区产物</SheetTitle>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] tabular-nums text-fg-3">
              {artifacts.length}
            </span>
          </div>
          <SheetDescription className="mt-1 text-[11px] leading-relaxed text-fg-3">
            Markdown / 文本可在线预览，PPTX 支持转 PDF 预览与下载。
          </SheetDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {sorted.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-fg-4">
                <FolderOpen className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium text-fg-2">暂无产物</p>
              <p className="text-[11px] leading-relaxed text-fg-4">
                在对话中生成 Markdown 或 PPTX 后，会出现在这里。
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {sorted.map(item => {
                const kind = artifactKind(item.workspacePath, item.mimeType);
                const size = humanSize(item.size);
                const time = formatTime(item.modifiedAt);
                return (
                  <li
                    key={item.id}
                    className="group flex items-center gap-2 rounded-xl border border-line-1 bg-surface-1 px-2.5 py-2 transition-colors hover:border-accent-line hover:bg-surface-2"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenArtifact(item)}
                      title={`打开 ${artifactFileName(item.workspacePath)}`}
                      className="ui-interactive ui-focus-ring flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1 text-left"
                    >
                      <span
                        className={
                          kind === 'pptx'
                            ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-wash text-accent-base'
                            : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'
                        }
                      >
                        <ArtifactIcon kind={kind} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-fg-1">
                          {artifactFileName(item.workspacePath)}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10.5px] text-fg-4">
                          {item.workspacePath}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-fg-3">
                          <span className="rounded bg-surface-3 px-1.5 py-px font-medium uppercase tracking-wide">
                            {artifactKindLabel(kind)}
                          </span>
                          {size && <span className="tabular-nums">{size}</span>}
                          {time && <span className="truncate">{time}</span>}
                        </span>
                      </span>
                    </button>
                    {item.downloadable && !isDemoArtifact(item.workspacePath) && (
                      <a
                        href={artifactContentUrl(userId, sessionId, item.workspacePath, true)}
                        download
                        title={`下载 ${artifactFileName(item.workspacePath)}`}
                        className="ui-interactive ui-focus-ring inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-3 hover:bg-surface-3 hover:text-fg-1"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">下载 {artifactFileName(item.workspacePath)}</span>
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}