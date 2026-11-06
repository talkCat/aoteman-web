'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Download, Loader2, RotateCw } from 'lucide-react';

import { CopyArtifactButton } from '@/components/artifacts/MarkdownArtifactView';
import { demoArtifactContent, isDemoArtifact } from '@/lib/artifact-demo';
import {
  artifactContentUrl,
  artifactFileName,
  artifactSizeLabel,
  fetchArtifactContent,
  type ArtifactItem,
} from '@/lib/artifacts';
import { cn } from '@/lib/utils';

/** 取扩展名做大写徽标（JSON / YAML / PY…），取不到时退回 TEXT。 */
function extensionLabel(workspacePath: string): string {
  const name = artifactFileName(workspacePath);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : 'TEXT';
}

/**
 * 纯文本产物阅读器（快捷预览 / 画布共用）。
 *
 * 与 Markdown 视图的区别：不做任何语法解析，原样等宽输出。
 * 这样 JSON / 日志 / CSV / 源码这类「机器产出的文本」不会被 Markdown 规则改写。
 *
 * - variant="inline"：对话尾部快捷预览，限高内部滚动；
 * - variant="canvas"：画布内，跟随外层滚动。
 */
export function TextArtifactView({
  artifact,
  userId,
  sessionId,
  variant = 'canvas',
}: {
  artifact: ArtifactItem;
  userId: string;
  sessionId?: string;
  variant?: 'inline' | 'canvas';
}) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const inline = variant === 'inline';
  const demo = isDemoArtifact(artifact.workspacePath);
  const size = artifactSizeLabel(artifact.size);

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

  const lineCount = content ? content.split(/\r?\n/).length : 0;

  return (
    <div className={cn('flex min-h-0 flex-col', inline && 'max-h-[min(58vh,520px)]')}>
      <div className="flex shrink-0 items-center gap-2 border-b border-line-1 px-3 py-1.5 text-[10.5px] text-fg-4">
        <span className="rounded bg-surface-3 px-1.5 py-px font-medium uppercase tracking-wide text-fg-3">
          {extensionLabel(artifact.workspacePath)}
        </span>
        {lineCount > 0 && <span className="tabular-nums">{lineCount} 行</span>}
        {size && <span className="hidden tabular-nums sm:inline">{size}</span>}

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <CopyArtifactButton content={content} title="复制文本全文" />
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

      <div className={cn('min-h-0 flex-1 overflow-auto', !inline && 'max-h-[calc(100vh-14rem)]')}>
        {loading && (
          <div className="flex items-center gap-2 px-4 py-6 text-xs text-fg-3">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            正在加载产物内容…
          </div>
        )}

        {!loading && error && (
          <div className="px-4 py-5">
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

        {!loading && !error && content.trim().length === 0 && (
          <p className="px-4 py-6 text-xs text-fg-4">（空文件）</p>
        )}

        {!loading && !error && content.trim().length > 0 && (
          <pre className="w-max min-w-full whitespace-pre px-4 py-3 font-mono text-[12px] leading-relaxed text-fg-2">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}