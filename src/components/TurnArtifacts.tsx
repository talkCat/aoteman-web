'use client';

import { useId, useState } from 'react';
import { ChevronDown, FileText, Layers, PanelRight, Presentation } from 'lucide-react';

import { ArtifactInlinePreview } from '@/components/artifacts/ArtifactInlinePreview';
import {
  artifactFileName,
  artifactKind,
  artifactKindLabel,
  artifactSizeLabel,
  type ArtifactItem,
} from '@/lib/artifacts';
import { cn } from '@/lib/utils';

/** PPTX 用演示文稿图标，其余沿用文档图标；仅影响卡片标识，不改变能力判定。 */
function ArtifactTypeIcon({ kind, className }: { kind: string; className?: string }) {
  return kind === 'pptx' ? <Presentation className={className} /> : <FileText className={className} />;
}

/**
 * 回合产物卡片 + 原地快捷预览。
 *
 * 设计：doc/design/2026-11-06-本轮产物尾部快捷预览.md
 * - 卡片只做「展开 / 收起」预览，一次只开一个；
 * - 深入阅读（大纲、阅读宽度、PPTX 新标签）走右侧画布，入口是卡片右侧独立按钮，
 *   与卡片主按钮并列而不是嵌套——按钮套按钮在键盘与读屏下都是坏结构；
 * - 预览能力按 kind 分发：markdown / text / pptx 内嵌，other 只给下载。
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
  /** 传入后卡片右侧出现「在画布中打开」按钮。 */
  onOpen?: (artifact: ArtifactItem) => void;
}) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  // 每个回合各自一块预览区：同一页面可能同时展开多条回合，id 必须唯一。
  const previewId = useId();

  if (artifacts.length === 0) return null;

  const active = artifacts.find(item => item.workspacePath === openPath) ?? null;

  return (
    <section className="mb-4 mt-1" aria-label="本轮产物">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-4">
        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-medium text-fg-3">本轮产物</span>
        <span className="rounded-full bg-surface-2 px-1.5 py-px tabular-nums">{artifacts.length}</span>
        <span className="hidden sm:inline">点击卡片即可快速预览</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {artifacts.map(item => {
          const kind = artifactKind(item.workspacePath, item.mimeType);
          const name = artifactFileName(item.workspacePath);
          const size = artifactSizeLabel(item.size);
          const expanded = active?.workspacePath === item.workspacePath;

          return (
            <div
              key={item.id}
              className={cn(
                'group flex max-w-full items-stretch overflow-hidden rounded-xl border bg-surface-1 transition-colors',
                expanded
                  ? 'border-accent-line bg-surface-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                  : 'border-line-1 hover:border-accent-line hover:bg-surface-2'
              )}
            >
              <button
                type="button"
                onClick={() =>
                  setOpenPath(current => (current === item.workspacePath ? null : item.workspacePath))
                }
                aria-expanded={expanded}
                aria-controls={expanded ? previewId : undefined}
                title={expanded ? `收起 ${name}` : `快速预览 ${name}`}
                className="ui-interactive ui-focus-ring flex min-w-0 items-center gap-2.5 px-3 py-2 text-left"
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    kind === 'pptx' ? 'bg-accent-wash text-accent-base' : 'bg-primary/10 text-primary'
                  )}
                >
                  <ArtifactTypeIcon kind={kind} className="h-4 w-4" />
                </span>
                <span className="min-w-0 max-w-[min(260px,54vw)]">
                  <span className="block truncate text-xs font-medium text-fg-1">{name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-fg-4">
                    <span className="shrink-0 rounded bg-surface-3 px-1 py-px font-medium uppercase tracking-wide text-fg-3">
                      {artifactKindLabel(kind)}
                    </span>
                    {size && <span className="shrink-0 tabular-nums">{size}</span>}
                    <span className="truncate">{expanded ? '收起预览' : '快速预览'}</span>
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    'ml-0.5 h-3.5 w-3.5 shrink-0 text-fg-4 transition-transform',
                    expanded && 'rotate-180 text-accent-base'
                  )}
                />
              </button>

              {onOpen && (
                <button
                  type="button"
                  onClick={() => {
                    // 切到画布前先收起尾部预览：同一份内容不在两处同时铺开。
                    setOpenPath(null);
                    onOpen(item);
                  }}
                  title={`在画布中打开 ${name}`}
                  aria-label={`在画布中打开 ${name}`}
                  className="ui-interactive ui-focus-ring flex w-9 shrink-0 items-center justify-center border-l border-line-1 text-fg-4 hover:bg-surface-3 hover:text-fg-1"
                >
                  <PanelRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {active && (
        <div id={previewId}>
          <ArtifactInlinePreview
            artifact={active}
            userId={userId}
            sessionId={sessionId}
            onOpenInCanvas={
              onOpen
                ? item => {
                    // 切到画布即收起尾部预览：同一份内容不在两处同时铺开。
                    setOpenPath(null);
                    onOpen(item);
                  }
                : undefined
            }
            onClose={() => setOpenPath(null)}
          />
        </div>
      )}
    </section>
  );
}