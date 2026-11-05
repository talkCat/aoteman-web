'use client';

import type { Citation } from '@/types/citation';

/**
 * 正文里的引用徽标。只有本轮 citations 里存在的 ref 才会被 markdown 插件转成链接，
 * 因此这里不需要处理「编造的 K9」。
 */
export function CitationRef({
  citation,
  onActivate,
}: {
  citation: Citation;
  onActivate?: (citation: Citation) => void;
}) {
  const label = `引用 ${citation.ref}：${citation.documentTitle}${
    citation.headingPath ? ` ${citation.headingPath}` : ''
  }`;

  return (
    <button
      type="button"
      aria-label={label}
      title={`${citation.kbName} · ${citation.documentTitle}`}
      onClick={() => onActivate?.(citation)}
      className="surface-chip ui-interactive ui-focus-ring relative inline-flex items-center rounded bg-primary/10 px-1 py-px align-baseline font-mono text-[11px] font-medium text-primary after:absolute after:-inset-x-3 after:-inset-y-2 after:content-[''] hover:bg-primary/15"
    >
      {citation.ref}
    </button>
  );
}