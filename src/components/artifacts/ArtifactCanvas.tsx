'use client';

import {
  FileText,
  Maximize2,
  MessageSquare,
  Minimize2,
  Presentation,
  X,
} from 'lucide-react';

import { ArtifactTabs } from '@/components/artifacts/ArtifactTabs';
import { MarkdownArtifactView } from '@/components/artifacts/MarkdownArtifactView';
import { PptxArtifactView } from '@/components/artifacts/PptxArtifactView';
import { artifactFileName, artifactKind, type ArtifactItem } from '@/lib/artifacts';
import { cn } from '@/lib/utils';

/**
 * 产物画布（P6/T6.2）。
 *
 * 三态由父组件控制，画布自身只负责「打开的是哪个产物 + 是否全屏」：
 * - chat：不渲染画布（父组件不挂载本组件）
 * - split：对话 392px + 画布占满剩余宽度
 * - canvas：对话列 hidden，画布占满
 *
 * 关键约束：切态只改父容器的宽度/显示，不改变对话 DOM 的挂载位置，
 * 否则进行中的 SSE 流式输出会被打断。
 */
export function ArtifactCanvas({
  artifact,
  artifacts = [],
  userId,
  sessionId,
  expanded,
  onToggleExpanded,
  onClose,
  onSelectArtifact,
  onShowConversation,
  className,
}: {
  artifact: ArtifactItem;
  /** 当前轮次的全部产物，用于顶部 Tabs；单产物时不显示 Tabs。 */
  artifacts?: ArtifactItem[];
  userId: string;
  sessionId?: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onClose: () => void;
  onSelectArtifact?: (artifact: ArtifactItem) => void;
  /** 移动端：把对话列以覆盖层方式拉回来，不复制 DOM。 */
  onShowConversation?: () => void;
  className?: string;
}) {
  const kind = artifactKind(artifact.workspacePath);

  const Icon = kind === 'pptx' ? Presentation : FileText;

  return (
    <aside
      aria-label="产物画布"
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden bg-surface-0',
        'border-l border-line-1',
        className
      )}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line-1 px-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-wash text-accent-base">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-fg-1">
            {artifactFileName(artifact.workspacePath)}
          </p>
          <p className="truncate text-[11px] text-fg-4">{artifact.workspacePath}</p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {onShowConversation && (
            <button
              type="button"
              onClick={onShowConversation}
              title="查看对话"
              aria-label="查看对话"
              className="ui-interactive ui-focus-ring inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-fg-3 hover:bg-surface-2 hover:text-fg-1 lg:hidden"
            >
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">对话</span>
            </button>
          )}
          <button
            type="button"
            onClick={onToggleExpanded}
            title={expanded ? '退出全屏画布' : '全屏画布'}
            aria-label={expanded ? '退出全屏画布' : '全屏画布'}
            className="ui-interactive ui-focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-3 hover:bg-surface-2 hover:text-fg-1"
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            title="关闭画布"
            aria-label="关闭画布"
            className="ui-interactive ui-focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-3 hover:bg-surface-2 hover:text-fg-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <ArtifactTabs
        artifacts={artifacts}
        currentPath={artifact.workspacePath}
        onSelect={item => onSelectArtifact?.(item)}
      />

      <div className="artifact-stage min-h-0 flex-1 overflow-y-auto">
        {kind === 'markdown' && (
          <MarkdownArtifactView artifact={artifact} userId={userId} sessionId={sessionId} />
        )}
        {kind === 'pptx' && (
          <PptxArtifactView artifact={artifact} userId={userId} sessionId={sessionId} />
        )}
        {kind === 'other' && (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-fg-3">
            <FileText className="h-6 w-6 text-fg-4" aria-hidden="true" />
            暂不支持在画布内预览该类型，请下载后查看。
          </div>
        )}
      </div>
    </aside>
  );
}
