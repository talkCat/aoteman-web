'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Download, FileWarning, Presentation } from 'lucide-react';

import { artifactContentUrl, artifactFileName, type ArtifactItem } from '@/lib/artifacts';
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
      className="ui-interactive ui-focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-3.5 text-xs font-medium text-fg-2 hover:bg-surface-3"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? '已复制' : '复制路径'}
    </button>
  );
}

/**
 * PPTX 产物视图（本期范围：文件信息 + 下载）。
 *
 * 为什么不做页面预览：PPTX 渲染需要服务端先转 PDF/图片，属于另一条链路；
 * 在没有真实转换服务之前，不做缩略图，也不伪造页数与版式（见 P6.0 红线）。
 * 承接位：后端提供 render 接口后，在卡片上方增加缩略图 / 翻页器即可。
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

  const rows = [
    { label: '文件名', value: artifactFileName(artifact.workspacePath) },
    { label: '大小', value: humanSize(artifact.size) },
    {
      label: '类型',
      value:
        artifact.mimeType ||
        artifact.contentType ||
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
    { label: '修改时间', value: formatTime(artifact.modifiedAt) },
    { label: '工作区路径', value: artifact.workspacePath },
  ];

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="card-elevated mx-auto w-full max-w-[640px] rounded-xl p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-wash text-accent-base">
            <Presentation className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-fg-1">
              {artifactFileName(artifact.workspacePath)}
            </h2>
            <p className="mt-0.5 text-[11px] text-fg-3">PowerPoint 演示文稿</p>
          </div>
        </div>

        <dl className="mt-5 space-y-2.5 border-t border-line-1 pt-4 text-xs">
          {rows.map(row => (
            <div key={row.label} className="flex gap-4">
              <dt className="w-20 shrink-0 text-fg-4">{row.label}</dt>
              <dd className="min-w-0 flex-1 break-all text-fg-2">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {demo ? (
            <span
              title="静态预览不提供真实文件下载"
              className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-lg bg-primary/50 px-3.5 text-xs font-medium text-primary-foreground opacity-60"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              下载 PPTX
            </span>
          ) : (
            <a
              href={artifactContentUrl(userId, sessionId, artifact.workspacePath, true)}
              download
              className="ui-interactive ui-pressable ui-focus-ring btn-raised inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              下载 PPTX
            </a>
          )}
          <CopyPathButton path={artifact.workspacePath} />
        </div>

        <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-fg-4">
          <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          本期不提供页面级预览，下载后用本地应用打开；文件信息全部来自产物接口，不做推断。
        </p>
      </div>
    </div>
  );
}
