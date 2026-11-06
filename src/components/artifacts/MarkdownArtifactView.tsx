'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  ListTree,
  Loader2,
} from 'lucide-react';

import { Markdown } from '@/components/Markdown';
import { demoArtifactContent, isDemoArtifact } from '@/lib/artifact-demo';
import { artifactContentUrl, fetchArtifactContent, type ArtifactItem } from '@/lib/artifacts';
import { cn } from '@/lib/utils';

type WidthMode = 'comfortable' | 'wide' | 'full';

const WIDTH_OPTIONS: Array<{ value: WidthMode; label: string; className: string }> = [
  { value: 'comfortable', label: '舒适', className: 'max-w-[720px]' },
  { value: 'wide', label: '宽', className: 'max-w-[880px]' },
  { value: 'full', label: '全宽', className: 'max-w-none' },
];

interface HeadingItem {
  id: string;
  level: number;
  text: string;
  line: number;
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 只提取 h1~h3，跳过围栏代码块；行号用于和 react-markdown 的节点位置对齐。 */
function extractHeadings(markdown: string): HeadingItem[] {
  const lines = markdown.split(/\r?\n/);
  const used = new Map<string, number>();
  const headings: HeadingItem[] = [];
  let inFence = false;

  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const match = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (!match) return;

    const level = match[1].length;
    const text = stripInlineMarkdown(match[2].replace(/\s+#+\s*$/, ''));
    if (!text) return;

    const base = `md-h-${index + 1}-${slugify(text) || 'section'}`;
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    headings.push({
      id: seen === 0 ? base : `${base}-${seen + 1}`,
      level,
      text,
      line: index + 1,
    });
  });

  return headings;
}

/**
 * 画布内的 Markdown 阅读视图：取内容 + 大纲 + 三档阅读宽度 + 复制/下载。
 *
 * 本期不做编辑与保存——画布是「看结果」的地方，改内容交给对话（见 P6.0 范围红线）。
 */
export function MarkdownArtifactView({
  artifact,
  userId,
  sessionId,
}: {
  artifact: ArtifactItem;
  userId: string;
  sessionId?: string;
}) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [widthMode, setWidthMode] = useState<WidthMode>('comfortable');

  const demo = isDemoArtifact(artifact.workspacePath);
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setContent('');

    // 静态预览：本地演示正文，不请求服务端
    const demoContent = demoArtifactContent(artifact.workspacePath);
    if (demoContent !== null) {
      setContent(demoContent);
      setLoading(false);
      return;
    }

    fetchArtifactContent(userId, sessionId, artifact.workspacePath)
      .then(text => {
        if (!alive) return;
        setContent(text);
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
  }, [artifact.workspacePath, userId, sessionId]);

  const headings = useMemo(() => extractHeadings(content), [content]);
  const anchorMap = useMemo(
    () => new Map(headings.map(heading => [heading.line, heading.id])),
    [headings]
  );
  const widthClass = WIDTH_OPTIONS.find(option => option.value === widthMode)?.className ?? '';

  function scrollToHeading(id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-6 py-10 text-sm text-fg-3">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载产物内容…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-4 mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-5 sm:mx-8">
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
        {!demo && (
          <a
            href={artifactContentUrl(userId, sessionId, artifact.workspacePath, true)}
            download
            className="ui-interactive ui-focus-ring mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-xs font-medium text-fg-2 hover:bg-surface-3"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            下载原文件
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-full items-start">
      {outlineOpen && headings.length > 0 && (
        <nav
          aria-label="文档大纲"
          className="sticky top-0 hidden h-[calc(100dvh-7rem)] w-56 shrink-0 self-start overflow-y-auto border-r border-line-1 bg-surface-0/92 px-3 py-4 backdrop-blur-xl xl:block"
        >
          <p className="mb-2 px-1 text-[11px] font-medium tracking-wide text-fg-4">大纲</p>
          <ul className="space-y-0.5">
            {headings.map(heading => (
              <li key={heading.id} style={{ paddingLeft: (heading.level - 1) * 10 }}>
                <button
                  type="button"
                  onClick={() => scrollToHeading(heading.id)}
                  className="ui-interactive ui-focus-ring block w-full truncate rounded px-1.5 py-1 text-left text-xs text-fg-3 hover:bg-surface-2 hover:text-fg-1"
                  title={heading.text}
                >
                  {heading.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line-1 bg-surface-0/92 px-3 py-2 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setOutlineOpen(open => !open)}
            aria-pressed={outlineOpen}
            className={cn(
              'ui-interactive ui-focus-ring inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium',
              outlineOpen ? 'bg-accent-wash text-accent-base' : 'text-fg-3 hover:bg-surface-2 hover:text-fg-1'
            )}
            title="显示 / 隐藏大纲"
          >
            <ListTree className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">大纲</span>
          </button>

          <div
            role="group"
            aria-label="阅读宽度"
            className="flex items-center rounded-md bg-surface-2 p-0.5"
          >
            {WIDTH_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setWidthMode(option.value)}
                aria-pressed={widthMode === option.value}
                className={cn(
                  'ui-interactive ui-focus-ring rounded px-2 py-1 text-[11px] font-medium',
                  widthMode === option.value
                    ? 'bg-surface-1 text-fg-1 shadow-sm'
                    : 'text-fg-4 hover:text-fg-2'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-0.5">
            <CopyArtifactButton content={content} />
            {demo ? (
              <span
                title="静态预览不提供真实文件下载"
                className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-md px-2 text-xs font-medium text-fg-4 opacity-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">下载</span>
              </span>
            ) : (
              <a
                href={artifactContentUrl(userId, sessionId, artifact.workspacePath, true)}
                download
                title="下载 Markdown"
                className="ui-interactive ui-focus-ring inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-fg-3 hover:bg-surface-2 hover:text-fg-1"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">下载</span>
              </a>
            )}
          </div>
        </div>

        {outlineOpen && headings.length > 0 && (
          <div className="border-b border-line-1 bg-surface-1/50 px-3 py-2 xl:hidden">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {headings.map(heading => (
                <button
                  key={heading.id}
                  type="button"
                  onClick={() => scrollToHeading(heading.id)}
                  className="ui-interactive ui-focus-ring shrink-0 rounded-full border border-line-1 px-2.5 py-1 text-[11px] text-fg-3 hover:bg-surface-2 hover:text-fg-1"
                >
                  {heading.text}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="px-4 py-6 sm:px-8">
          <article
            ref={articleRef}
            aria-label="Markdown 产物正文"
            className={cn('card-elevated mx-auto w-full rounded-xl px-5 py-7 sm:px-8', widthClass)}
          >
            <Markdown content={content} headingAnchors={anchorMap} className="break-words" />
          </article>
        </div>
      </div>
    </div>
  );
}

/** 复制按钮：成功态 1.6s 后自动回落，不额外弹 toast。 */
export function CopyArtifactButton({
  content,
  title = '复制 Markdown 全文',
}: {
  content: string;
  /** 纯文本 / 其它产物复用时替换按钮提示。 */
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      disabled={!content}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(content);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
      title={title}
      className="ui-interactive ui-focus-ring inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-fg-3 hover:bg-surface-2 hover:text-fg-1 disabled:opacity-40"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? '已复制' : '复制'}
    </button>
  );
}
