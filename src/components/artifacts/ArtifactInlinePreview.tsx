'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  FileText,
  Loader2,
  PanelRight,
  Presentation,
  RotateCw,
  X,
} from 'lucide-react';

import { Markdown } from '@/components/Markdown';
import { CopyArtifactButton } from '@/components/artifacts/MarkdownArtifactView';
import { PptxArtifactView } from '@/components/artifacts/PptxArtifactView';
import { TextArtifactView } from '@/components/artifacts/TextArtifactView';
import { demoArtifactContent, isDemoArtifact } from '@/lib/artifact-demo';
import {
  artifactContentUrl,
  artifactFileName,
  artifactKind,
  artifactKindLabel,
  fetchArtifactContent,
  type ArtifactItem,
} from '@/lib/artifacts';

/**
 * Markdown 快捷预览：取正文 + 复制 / 下载，限高内部滚动。
 *
 * 不做大纲与阅读宽度切换——那些是画布的职责，尾部预览只解决「扫一眼」。
 */
function InlineMarkdown({
  artifact,
  userId,
  sessionId,
}: {
  artifact: ArtifactItem;
  userId: string;
  sessionId?: string;
}) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const demo = isDemoArtifact(artifact.workspacePath);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setContent('');

    // 演示产物直接读本地内容，不向后端发请求（与服务端未启动时的走查路径一致）。
    const demoContent = demoArtifactContent(artifact.workspacePath);
    if (demoContent !== null) {
      setContent(demoContent);
      setLoading(false);
      return;
    }

    fetchArtifactContent(userId, sessionId, artifact.workspacePath)
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
  }, [artifact.workspacePath, userId, sessionId, reloadKey]);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line-1 px-4 py-1 text-[10.5px] text-fg-4">
        <span className="uppercase tracking-wide">Markdown</span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <CopyArtifactButton content={content} title="复制 Markdown 全文" />
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
              title={`下载 ${artifactFileName(artifact.workspacePath)}`}
              className="ui-interactive ui-focus-ring inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-fg-3 hover:bg-surface-2 hover:text-fg-1"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">下载</span>
            </a>
          )}
        </div>
      </div>

      <div className="max-h-[min(58vh,520px)] overflow-y-auto px-4 py-3">
        {loading && (
          <div className="flex items-center gap-2 py-4 text-xs text-fg-3">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            正在加载产物内容…
          </div>
        )}

        {!loading && error && (
          <div className="py-3">
            <div className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="leading-relaxed">{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setReloadKey(key => key + 1)}
              className="ui-interactive ui-focus-ring mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-1 bg-surface-2 px-3 text-xs font-medium text-fg-2 hover:bg-surface-3 hover:text-fg-1"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              重试
            </button>
          </div>
        )}

        {!loading && !error && (
          <Markdown content={content} className="text-sm break-words" />
        )}
      </div>
    </div>
  );
}

/** 其它二进制类型：不内嵌，只给下载兜底。 */
function UnsupportedPreview({
  artifact,
  userId,
  sessionId,
}: {
  artifact: ArtifactItem;
  userId: string;
  sessionId?: string;
}) {
  const demo = isDemoArtifact(artifact.workspacePath);

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <p className="text-xs leading-relaxed text-fg-3">该类型暂不支持在线预览，下载后用本地应用打开。</p>
      {demo ? (
        <span className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-lg bg-primary/50 px-3.5 text-xs font-medium text-primary-foreground opacity-60">
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          下载文件
        </span>
      ) : (
        <a
          href={artifactContentUrl(userId, sessionId, artifact.workspacePath, true)}
          download
          className="ui-interactive ui-pressable ui-focus-ring btn-raised inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          下载文件
        </a>
      )}
    </div>
  );
}

/**
 * 对话尾部「本轮产物」的快捷预览壳（设计：doc/design/2026-11-06-本轮产物尾部快捷预览.md）。
 *
 * 只负责外壳与类型分发，正文加载交给各类型视图：
 * - markdown → InlineMarkdown（react-markdown 渲染）
 * - text     → TextArtifactView variant="inline"
 * - pptx     → PptxArtifactView（PPTX → PDF 通道，含骨架 / 失败 / 重试）
 * - other    → 下载兜底
 */
export function ArtifactInlinePreview({
  artifact,
  userId,
  sessionId,
  onOpenInCanvas,
  onClose,
}: {
  artifact: ArtifactItem;
  userId: string;
  sessionId?: string;
  /** 走「深入研究」时切到右侧画布；不传则不显示入口。 */
  onOpenInCanvas?: (artifact: ArtifactItem) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const kind = artifactKind(artifact.workspacePath, artifact.mimeType);
  const name = artifactFileName(artifact.workspacePath);
  const Icon = kind === 'pptx' ? Presentation : FileText;

  // 展开后确保预览在视口内（对话区是内部滚动容器，block: 'nearest' 不会连带滚动整页）。
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    containerRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }, [artifact.workspacePath]);

  return (
    <div
      ref={containerRef}
      className="card-elevated mt-2 animate-message-in overflow-hidden rounded-xl"
      aria-label={`${name} 快捷预览`}
    >
      <header className="flex items-center gap-2 border-b border-line-1 px-3 py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-wash text-accent-base">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-fg-1" title={artifact.workspacePath}>
          {name}
        </p>
        <span className="hidden shrink-0 rounded bg-surface-3 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-fg-3 sm:inline">
          {artifactKindLabel(kind)}
        </span>

        <div className="flex shrink-0 items-center gap-0.5">
          {onOpenInCanvas && (
            <button
              type="button"
              onClick={() => onOpenInCanvas(artifact)}
              title="在画布中打开"
              className="ui-interactive ui-focus-ring inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-fg-3 hover:bg-surface-2 hover:text-fg-1"
            >
              <PanelRight className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden md:inline">画布</span>
              <span className="sr-only md:hidden">在画布中打开</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="收起预览"
            aria-label="收起预览"
            className="ui-interactive ui-focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-3 hover:bg-surface-2 hover:text-fg-1"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="bg-surface-0/60">
        {kind === 'markdown' && (
          <InlineMarkdown artifact={artifact} userId={userId} sessionId={sessionId} />
        )}
        {kind === 'text' && (
          <TextArtifactView
            artifact={artifact}
            userId={userId}
            sessionId={sessionId}
            variant="inline"
          />
        )}
        {kind === 'pptx' && (
          <div className="h-[min(60vh,520px)] min-h-[420px]">
            <PptxArtifactView artifact={artifact} userId={userId} sessionId={sessionId} />
          </div>
        )}
        {kind === 'other' && (
          <UnsupportedPreview artifact={artifact} userId={userId} sessionId={sessionId} />
        )}
      </div>
    </div>
  );
}