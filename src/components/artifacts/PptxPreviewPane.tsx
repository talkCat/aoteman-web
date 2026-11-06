'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Download,
  ExternalLink,
  FileWarning,
  Presentation,
  RotateCw,
} from 'lucide-react';

import type { ArtifactPreviewState } from '@/hooks/useArtifactPreview';
import {
  artifactContentUrl,
  artifactFileName,
  artifactPreviewUrl,
  type ArtifactItem,
} from '@/lib/artifacts';
import { cn } from '@/lib/utils';

/** 错误码 → 一句话（设计 §3.4）。文案底线：必须告诉用户「还能下载」。 */
const ERROR_TEXT: Record<string, string> = {
  PREVIEW_NOT_READY: '预览还在生成中，稍候会自动刷新。',
  SOURCE_NOT_FOUND: '源文件已不存在，可能已被清理。',
  UNSUPPORTED_FORMAT: '该格式暂不支持在线预览，可下载后用本地应用打开。',
  PREVIEW_DISABLED: '服务端未开启预览，可下载后用本地应用打开。',
  CONVERTER_UNAVAILABLE: '预览服务暂不可用，请联系管理员；文件仍可下载。',
  CONVERT_TIMEOUT: '生成超时，文件可能过于复杂；可重试或直接下载。',
  CONVERT_FAILED: '无法生成预览，文件可能已损坏；可重试或直接下载。',
  SOURCE_TOO_LARGE: '文件过大，暂不支持在线预览；可直接下载。',
  QUEUE_FULL: '预览排队中，稍后会自动重试。',
  NETWORK_ERROR: '与预览服务的连接中断，稍后可重试；文件仍可下载。',
  PREVIEW_FAILED: '没能生成预览，可重试或下载后用本地应用打开。',
};

const FALLBACK_ERROR_TEXT = '没能生成预览，可重试或下载后用本地应用打开。';

function errorText(code: string | null): string {
  if (!code) return FALLBACK_ERROR_TEXT;
  return ERROR_TEXT[code] ?? FALLBACK_ERROR_TEXT;
}

/** 主操作按钮：下载 PPTX。失败态、骨架态、信息卡都复用它。 */
function DownloadButton({
  artifact,
  userId,
  sessionId,
  demo,
  raised = false,
}: {
  artifact: ArtifactItem;
  userId: string;
  sessionId?: string;
  demo: boolean;
  raised?: boolean;
}) {
  if (demo) {
    return (
      <span
        title="静态预览不提供真实文件下载"
        className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-lg bg-primary/50 px-3.5 text-xs font-medium text-primary-foreground opacity-60"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        下载 PPTX
      </span>
    );
  }
  return (
    <a
      href={artifactContentUrl(userId, sessionId, artifact.workspacePath, true)}
      download
      className={cn(
        'ui-interactive ui-pressable ui-focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium',
        raised
          ? 'btn-raised bg-primary text-primary-foreground hover:bg-primary/90'
          : 'border border-line-1 bg-surface-2 text-fg-2 hover:bg-surface-3 hover:text-fg-1'
      )}
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      下载 PPTX
    </a>
  );
}

/** 老服务端 / 演示产物：保持「文件信息 + 下载」的静态卡，不伪造 PDF。 */
function StaticInfoCard({
  artifact,
  userId,
  sessionId,
  demo,
}: {
  artifact: ArtifactItem;
  userId: string;
  sessionId?: string;
  demo: boolean;
}) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center p-4">
      <div className="card-elevated w-full max-w-[640px] rounded-xl p-6">
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

        <p className="mt-5 flex items-start gap-1.5 border-t border-line-1 pt-4 text-[11px] leading-relaxed text-fg-4">
          <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {demo
            ? '静态预览不提供在线预览与真实文件下载；文件信息全部来自演示数据。'
            : '当前服务端未提供在线预览，下载后用本地应用打开。'}
        </p>

        <div className="mt-4">
          <DownloadButton artifact={artifact} userId={userId} sessionId={sessionId} demo={demo} />
        </div>
      </div>
    </div>
  );
}

/** 三张「纸」的骨架：主题色微光扫过，不用转圈 spinner 当主视觉。 */
function PreviewSkeleton({ converting }: { converting: boolean }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-5 rounded-xl border border-line-1 bg-surface-1 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="grid w-full max-w-[760px] grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map(index => (
          <div
            key={index}
            className="relative aspect-[16/10] overflow-hidden rounded-lg border border-line-1 bg-surface-2 shadow-sm"
            style={{ animationDelay: `${index * 160}ms` }}
          >
            <div
              className={cn(
                'absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-accent-base to-transparent',
                converting ? 'animate-pulse opacity-80' : 'opacity-40'
              )}
            />
            <div className="animate-pulse space-y-2 p-3">
              <div className="h-2 w-1/2 rounded bg-surface-3" />
              <div className="h-1.5 w-5/6 rounded bg-surface-3/70" />
              <div className="h-1.5 w-4/6 rounded bg-surface-3/60" />
              <div className="mt-3 h-12 rounded bg-surface-3/40" />
            </div>
          </div>
        ))}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-fg-2">
          {converting ? '正在生成预览…' : '正在准备预览…'}
        </p>
        <p className="mt-1 text-[11px] text-fg-4">
          {converting ? '可先下载，稍后再看' : '首次生成约 5–15 秒'}
        </p>
      </div>
    </div>
  );
}

/** 90s 未就绪：不判失败，给「重新检查」，也保留下载。 */
function TimeoutCard({
  artifact,
  userId,
  sessionId,
  demo,
  onRetry,
  retrying,
  canRetry,
}: {
  artifact: ArtifactItem;
  userId: string;
  sessionId?: string;
  demo: boolean;
  onRetry: () => void;
  retrying: boolean;
  canRetry: boolean;
}) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center p-4">
      <div className="card-elevated w-full max-w-[560px] rounded-xl p-6 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-accent-wash text-accent-base">
          <FileWarning className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 className="mt-3 text-sm font-semibold text-fg-1">仍在生成预览</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-fg-3">
          生成时间比预期长，可以继续留在画布，或稍后回来查看；文件随时可下载。
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying || !canRetry}
            title={canRetry ? undefined : '本次打开已重试 3 次，关闭画布重新打开可再试'}
            className="ui-interactive ui-pressable ui-focus-ring btn-raised inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            <RotateCw className={cn('h-3.5 w-3.5', retrying && 'animate-spin')} aria-hidden="true" />
            重新检查
          </button>
          <DownloadButton artifact={artifact} userId={userId} sessionId={sessionId} demo={demo} />
        </div>
      </div>
    </div>
  );
}

function FailedCard({
  artifact,
  userId,
  sessionId,
  demo,
  code,
  message,
  onRetry,
  retrying,
  canRetry,
}: {
  artifact: ArtifactItem;
  userId: string;
  sessionId?: string;
  demo: boolean;
  code: string | null;
  message: string | null;
  onRetry: () => void;
  retrying: boolean;
  canRetry: boolean;
}) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center p-4">
      <div className="w-full max-w-[560px] rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-fg-1">没能生成预览</h3>
            <p className="mt-1 text-xs leading-relaxed text-fg-3">{errorText(code)}</p>
            {message && message.trim() && message.trim() !== errorText(code) && (
              <p className="mt-1 break-all text-[11px] text-fg-4">{message}</p>
            )}
            {code && <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-fg-4">{code}</p>}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying || !canRetry}
            title={canRetry ? undefined : '本次打开已重试 3 次，关闭画布重新打开可再试'}
            className="ui-interactive ui-pressable ui-focus-ring btn-raised inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            <RotateCw className={cn('h-3.5 w-3.5', retrying && 'animate-spin')} aria-hidden="true" />
            重试
          </button>
          <DownloadButton artifact={artifact} userId={userId} sessionId={sessionId} demo={demo} raised />
        </div>
      </div>
    </div>
  );
}

/**
 * PDF iframe：包裹一层「纸」的轨道（深色模式下靠边框与内阴影做出浮起感）。
 *
 * 浏览器原生查看器自带缩放 / 翻页 / 下载，不再叠自己的工具条。
 * 20s 内没触发 load 时补一条「在新标签打开」的提示，应对内嵌 PDF 不可用的浏览器。
 */
function PdfFrame({ src, title }: { src: string; title: string }) {
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (loaded) return;
    const timer = window.setTimeout(() => setSlow(true), 20_000);
    return () => window.clearTimeout(timer);
  }, [loaded]);

  return (
    <div className="relative h-full min-h-[420px] rounded-xl border border-line-1 bg-surface-1 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="h-full overflow-hidden rounded-lg bg-white ring-1 ring-black/10">
        <iframe
          key={src}
          src={src}
          title={title}
          onLoad={() => setLoaded(true)}
          className="h-full w-full bg-white"
        />
      </div>
      {!loaded && slow && (
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-lg border border-line-1 bg-surface-0/95 px-3 py-2 text-[11px] text-fg-3 backdrop-blur">
          <span>PDF 加载较慢或浏览器不支持内嵌预览？</span>
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="ui-interactive ui-focus-ring inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-accent-base hover:bg-surface-2"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            在新标签打开
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * PPTX 预览区三态：ready → iframe；pending/converting → 骨架；failed → 失败卡。
 * none / 演示产物 → 静态信息卡（老服务端与 ?preview=1 不发请求）。
 */
export function PptxPreviewPane({
  artifact,
  userId,
  sessionId,
  preview,
  demo,
}: {
  artifact: ArtifactItem;
  userId: string;
  sessionId?: string;
  preview: ArtifactPreviewState;
  demo: boolean;
}) {
  const [retrying, setRetrying] = useState(false);

  const canRetry = preview.retriesLeft > 0;

  const handleRetry = () => {
    if (retrying || !canRetry) return;
    setRetrying(true);
    preview.retry();
    window.setTimeout(() => setRetrying(false), 600);
  };

  if (demo || preview.status === 'none') {
    return (
      <StaticInfoCard artifact={artifact} userId={userId} sessionId={sessionId} demo={demo} />
    );
  }

  if (preview.status === 'ready') {
    const src = artifactPreviewUrl(userId, sessionId, artifact.workspacePath, preview.version);
    return (
      <PdfFrame key={src} src={src} title={`${artifactFileName(artifact.workspacePath)} 预览`} />
    );
  }

  if (preview.timedOut) {
    return (
      <TimeoutCard
        artifact={artifact}
        userId={userId}
        sessionId={sessionId}
        demo={demo}
        onRetry={handleRetry}
        retrying={retrying}
        canRetry={canRetry}
      />
    );
  }

  if (preview.status === 'failed') {
    return (
      <FailedCard
        artifact={artifact}
        userId={userId}
        sessionId={sessionId}
        demo={demo}
        code={preview.errorCode}
        message={preview.message}
        onRetry={handleRetry}
        retrying={retrying}
        canRetry={canRetry}
      />
    );
  }

  return <PreviewSkeleton converting={preview.status === 'converting'} />;
}