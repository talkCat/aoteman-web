'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Download, ExternalLink } from 'lucide-react';

import { PptxPreviewPane } from '@/components/artifacts/PptxPreviewPane';
import { useArtifactPreview } from '@/hooks/useArtifactPreview';
import {
  artifactContentUrl,
  artifactPreviewUrl,
  type ArtifactItem,
} from '@/lib/artifacts';
import { isDemoArtifact } from '@/lib/artifact-demo';

/** 人类可读体积。 */
function humanSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

/** 复制工作区路径：画布和本地终端之间来回切换时用得上。 */
function CopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(path);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
      title="复制工作区路径"
      aria-label="复制工作区路径"
      className="ui-interactive ui-focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-3 hover:bg-surface-2 hover:text-fg-1"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/**
 * PPTX 产物视图：预览区（PDF / 骨架 / 失败）+ 底部紧凑信息条。
 *
 * 设计依据：doc/design/2026-11-06-PPTX转PDF预览-前端对接方案.md
 * - 服务端把 PPTX 转成 PDF，前端用 iframe 走浏览器原生查看器（第一版零新增依赖）；
 * - 任何预览异常都保留下载入口，下载与预览状态解耦；
 * - 演示产物（?preview=1）不发任何请求，也不伪造 PDF。
 */
export function PptxArtifactView({
  artifact,
  userId,
  sessionId,
}: {
  artifact: ArtifactItem;
  userId: string;
  sessionId?: string;
}) {
  const demo = isDemoArtifact(artifact.workspacePath);
  const preview = useArtifactPreview({ userId, sessionId, artifact, enabled: !demo });
  const canOpenInNewTab = !demo && preview.status === 'ready';
  const previewSrc = artifactPreviewUrl(
    userId,
    sessionId,
    artifact.workspacePath,
    preview.version
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 sm:p-4">
      <div className="min-h-0 flex-1">
        <PptxPreviewPane
          artifact={artifact}
          userId={userId}
          sessionId={sessionId}
          preview={preview}
          demo={demo}
        />
      </div>

      {/* 底部信息条：文件信息降级为辅助，主视觉留给预览区。 */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line-1 bg-surface-1 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-fg-4">
          <span className="shrink-0 font-medium text-fg-3">PPTX</span>
          <span className="shrink-0">{humanSize(artifact.size)}</span>
          <span className="hidden shrink-0 sm:inline">· {formatTime(artifact.modifiedAt)}</span>
          <span
            className="hidden min-w-0 flex-1 truncate font-mono md:block"
            title={artifact.workspacePath}
          >
            {artifact.workspacePath}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <CopyPathButton path={artifact.workspacePath} />

          {canOpenInNewTab ? (
            <a
              href={previewSrc}
              target="_blank"
              rel="noreferrer"
              title="在新标签打开 PDF 预览"
              className="ui-interactive ui-focus-ring inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-fg-3 hover:bg-surface-2 hover:text-fg-1"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">新标签</span>
            </a>
          ) : (
            <span
              title={demo ? '静态预览不提供真实文件' : '预览就绪后可在新标签打开'}
              aria-disabled="true"
              className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-md px-2 text-xs font-medium text-fg-4 opacity-50"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">新标签</span>
            </span>
          )}

          {demo ? (
            <span
              title="静态预览不提供真实文件下载"
              className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-lg bg-primary/50 px-3 text-xs font-medium text-primary-foreground opacity-60"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              下载 PPTX
            </span>
          ) : (
            <a
              href={artifactContentUrl(userId, sessionId, artifact.workspacePath, true)}
              download
              title="下载原始 PPTX"
              className="ui-interactive ui-pressable ui-focus-ring btn-raised inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              下载 PPTX
            </a>
          )}
        </div>
      </div>
    </div>
  );
}