'use client';

import { FileText, Presentation } from 'lucide-react';

import { artifactFileName, artifactKind, type ArtifactItem } from '@/lib/artifacts';
import { cn } from '@/lib/utils';

/**
 * 画布顶部产物 Tabs（P6/T6.2）。
 *
 * 只列可切换的产物；同一个文件不重复出现。单产物时不渲染，
 * 避免给用户一个没有意义的切换控件。
 */
export function ArtifactTabs({
  artifacts,
  currentPath,
  onSelect,
}: {
  artifacts: ArtifactItem[];
  currentPath: string;
  onSelect: (artifact: ArtifactItem) => void;
}) {
  if (artifacts.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label="本轮产物"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line-1 bg-surface-0/70 px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {artifacts.map(artifact => {
        const active = artifact.workspacePath === currentPath;
        const Icon = artifactKind(artifact.workspacePath) === 'pptx' ? Presentation : FileText;
        return (
          <button
            key={artifact.id || artifact.workspacePath}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(artifact)}
            title={artifact.workspacePath}
            className={cn(
              'ui-interactive ui-focus-ring inline-flex h-8 max-w-[220px] shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs',
              active
                ? 'bg-surface-2 font-medium text-fg-1'
                : 'text-fg-3 hover:bg-surface-2/70 hover:text-fg-1'
            )}
          >
            <Icon
              className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-accent-base' : 'text-fg-4')}
              aria-hidden="true"
            />
            <span className="truncate">{artifactFileName(artifact.workspacePath)}</span>
          </button>
        );
      })}
    </div>
  );
}
