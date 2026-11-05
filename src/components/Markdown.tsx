'use client';

import { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Pluggable } from 'unified';

import { CitationRef } from '@/components/chat/CitationRef';
import { remarkCitations } from '@/lib/remark-citations';
import { cn } from '@/lib/utils';
import type { Citation } from '@/types/citation';

const baseComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-5 text-lg font-semibold tracking-tight first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2.5 mt-5 text-base font-semibold tracking-tight first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mb-2 mt-4 text-sm font-semibold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-1.5 mt-3 text-sm font-medium first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-2 leading-7 first:mt-0 last:mb-0">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-7 marker:text-muted-foreground">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-border pl-3 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit">
      {children}
    </pre>
  ),
  code: ({ className, children }) => (
    <code className={cn('rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]', className)}>
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-muted/50 px-2 py-1 text-left font-medium">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
};

export function Markdown({
  content,
  className,
  citations,
  onCitationClick,
}: {
  content: string;
  className?: string;
  /** 本轮 agent.citation 快照。只有这里存在的 [K*] 才会渲染为可点击徽标。 */
  citations?: Citation[];
  onCitationClick?: (citation: Citation) => void;
}) {
  const citationMap = useMemo(() => {
    const map = new Map<string, Citation>();
    (citations ?? []).forEach((citation) => map.set(citation.ref.toUpperCase(), citation));
    return map;
  }, [citations]);

  const remarkPlugins = useMemo<Pluggable[]>(() => {
    if (citationMap.size === 0) return [remarkGfm];
    return [remarkGfm, [remarkCitations, { refs: Array.from(citationMap.keys()) }] as Pluggable];
  }, [citationMap]);

  const components = useMemo<Components>(
    () => ({
      ...baseComponents,
      a: ({ href, children }) => {
        const match = href?.match(/^#citation-(k\d+)$/i);
        if (match) {
          const citation = citationMap.get(match[1].toUpperCase());
          if (citation) {
            return <CitationRef citation={citation} onActivate={onCitationClick} />;
          }
          return <span>{children}</span>;
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {children}
          </a>
        );
      },
    }),
    [citationMap, onCitationClick],
  );

  return (
    <div className={cn('text-sm leading-7 text-foreground', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}