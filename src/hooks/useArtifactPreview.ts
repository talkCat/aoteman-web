'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchArtifactPreviewStatus,
  requestArtifactPreview,
  type ArtifactItem,
  type PreviewStatus,
} from '@/lib/artifacts';

export interface ArtifactPreviewState {
  status: PreviewStatus;
  errorCode: string | null;
  message: string | null;
  version: number;
  /** 90s 内仍未就绪：停止轮询，等用户「重新检查」。 */
  timedOut: boolean;
  /** 本次打开还剩几次手动重试（设计 §2.4：每次打开最多 3 次，防止打爆转换队列）。 */
  retriesLeft: number;
  retry: () => void;
}

/**
 * 轮询节奏（设计 §4.1）：1.5s 起，钳在 1–3s；连续 20 次未完成后退避到 5s；
 * 90s（只计前台时间）仍未就绪就停表，交给用户手动重新检查。
 */
const DEFAULT_INTERVAL_MS = 1500;
const MIN_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 3000;
const SLOW_INTERVAL_MS = 5000;
const SLOW_AFTER_POLLS = 20;
const TIMEOUT_MS = 90_000;
/** 网络抖动不立刻判死：连续 3 次失败才展示失败态。 */
const MAX_NETWORK_ERRORS = 3;
const RETRY_THROTTLE_MS = 500;
/** 每次打开画布最多手动重试 3 次（设计 §2.4）。 */
const MAX_RETRIES = 3;
const HIDDEN_SLEEP_MS = 1000;

function clampInterval(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_INTERVAL_MS;
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, value));
}

function initialStatus(artifact: ArtifactItem): PreviewStatus {
  if (artifact.previewStatus) return artifact.previewStatus;
  // 服务端声明了 pdf 通道但没给状态：按待转换处理，打开画布时踢一次。
  if (artifact.previewKind === 'pdf') return 'pending';
  // 老服务端没有预览字段：保持现有「文件信息 + 下载」行为，不发请求。
  return 'none';
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * PPTX 预览状态机：触发转换 → 轮询 → 终态。
 *
 * 几个刻意的选择：
 * - 用 setTimeout 递归而不是 setInterval，避免慢请求下重叠；
 * - 以 workspacePath / modifiedAt 为界重开状态机，切换产物时旧响应一律丢弃；
 * - 失败态不自动重试（转换失败重试成本高），只有用户点「重试」才重置；
 * - 关闭画布只停轮询，不取消服务端转换：下次打开直接命中结果。
 */
export function useArtifactPreview({
  userId,
  sessionId,
  artifact,
  enabled,
}: {
  userId: string;
  sessionId?: string;
  artifact: ArtifactItem;
  enabled: boolean;
}): ArtifactPreviewState {
  const workspacePath = artifact.workspacePath;
  const modifiedAt = artifact.modifiedAt || 0;
  const hintStatus = initialStatus(artifact);
  const hintErrorCode = artifact.previewErrorCode ?? null;

  const [status, setStatus] = useState<PreviewStatus>(hintStatus);
  const [errorCode, setErrorCode] = useState<string | null>(hintErrorCode);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState<number>(modifiedAt);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [retriesLeft, setRetriesLeft] = useState(MAX_RETRIES);
  const retriesLeftRef = useRef(MAX_RETRIES);

  const retryRequestedRef = useRef(false);
  const lastRetryAtRef = useRef(0);

  // 切换产物（或同一产物被重新生成）时先对齐展示状态，
  // 避免 effect 重开前的一帧里还挂着上一个产物的错误码 / 版本号。
  useEffect(() => {
    setStatus(hintStatus);
    setErrorCode(hintErrorCode);
    setMessage(null);
    setVersion(modifiedAt);
    setTimedOut(false);
    retriesLeftRef.current = MAX_RETRIES;
    setRetriesLeft(MAX_RETRIES);
  }, [workspacePath, modifiedAt, hintStatus, hintErrorCode]);

  useEffect(() => {
    if (!enabled) return;

    const retryRequested = retryRequestedRef.current;
    retryRequestedRef.current = false;

    // 老服务端 / 演示 / 已就绪：无事可做；失败态等用户主动重试。
    if (!retryRequested && (hintStatus === 'none' || hintStatus === 'ready')) return;
    if (!retryRequested && hintStatus === 'failed') return;

    setTimedOut(false);
    if (retryRequested) {
      setStatus('pending');
      setErrorCode(null);
      setMessage(null);
    }

    const controller = new AbortController();
    let disposed = false;
    let timer: number | null = null;
    let sleeping: (() => void) | null = null;
    let pollCount = 0;
    let networkErrors = 0;
    let interval = clampInterval(DEFAULT_INTERVAL_MS);

    // 90s 上限只计前台时间：用户切到后台不算超时。
    let activeMs = 0;
    // 用函数而不是内联比较：visibilityState 会在 await 期间变化，
    // 内联比较会让 TS 把类型窄化成 "visible" 而报「无重叠比较」。
    const isHidden = () => document.visibilityState === 'hidden';
    let activeSince: number | null = isHidden() ? null : Date.now();
    const activeElapsed = () =>
      activeMs + (activeSince === null ? 0 : Date.now() - activeSince);
    const pauseActive = () => {
      if (activeSince === null) return;
      activeMs += Date.now() - activeSince;
      activeSince = null;
    };
    const resumeActive = () => {
      if (activeSince === null) activeSince = Date.now();
    };

    const wake = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (sleeping) {
        const resolve = sleeping;
        sleeping = null;
        resolve();
      }
    };

    const sleep = (ms: number) =>
      new Promise<void>(resolve => {
        sleeping = resolve;
        timer = window.setTimeout(() => {
          timer = null;
          sleeping = null;
          resolve();
        }, ms);
      });

    const onVisibilityChange = () => {
      if (isHidden()) {
        pauseActive();
        // 暂停轮询：只清定时器，保留 sleep 的 promise，回前台再唤醒。
        if (timer !== null) {
          window.clearTimeout(timer);
          timer = null;
        }
        return;
      }
      resumeActive();
      // 回前台立即补查一次（wake 会打断当前 sleep）。
      wake();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const run = async () => {
      // 1) 用户点了「重试」：先把 failed 重置为 pending，再走正常触发。
      if (retryRequested) {
        try {
          const reset = await fetchArtifactPreviewStatus(userId, sessionId, workspacePath, {
            retry: true,
            signal: controller.signal,
          });
          if (disposed) return;
          if (reset.previewStatus === 'none') {
            setStatus('none');
            return;
          }
        } catch (error) {
          if (disposed || isAbortError(error)) return;
          // 重置失败不致命：下面仍会尝试触发，交给轮询的网络错误阈值兜底。
        }
      }

      // 2) 触发一次转换（服务端单飞，重复调用安全）。
      try {
        const kick = await requestArtifactPreview(userId, sessionId, workspacePath, {
          signal: controller.signal,
        });
        if (disposed) return;

        if (kick.previewStatus === 'ready') {
          setStatus('ready');
          setErrorCode(null);
          setMessage(null);
          setVersion(modifiedAt);
          return;
        }
        if (kick.previewStatus === 'none') {
          setStatus('none');
          return;
        }
        if (!kick.ok) {
          setStatus('failed');
          setErrorCode(kick.errorCode ?? 'PREVIEW_FAILED');
          setMessage(kick.message);
          return;
        }
        if (kick.previewStatus) setStatus(kick.previewStatus);
        interval = clampInterval(kick.retryAfterMs || DEFAULT_INTERVAL_MS);
      } catch (error) {
        if (disposed || isAbortError(error)) return;
        // 触发失败不直接判死：记一次网络错误，继续由轮询兜底。
        networkErrors += 1;
      }

      // 3) 轮询到终态。
      while (!disposed) {
        if (isHidden()) {
          await sleep(HIDDEN_SLEEP_MS);
          continue;
        }
        if (activeElapsed() >= TIMEOUT_MS) {
          setTimedOut(true);
          return;
        }

        await sleep(interval);
        if (disposed) return;
        if (activeElapsed() >= TIMEOUT_MS) {
          setTimedOut(true);
          return;
        }
        if (isHidden()) continue;

        try {
          const result = await fetchArtifactPreviewStatus(userId, sessionId, workspacePath, {
            signal: controller.signal,
          });
          if (disposed) return;

          networkErrors = 0;
          pollCount += 1;

          if (result.previewStatus === 'ready') {
            setStatus('ready');
            setErrorCode(null);
            setMessage(null);
            setVersion(result.modifiedAt || result.updatedAt || modifiedAt);
            return;
          }
          if (result.previewStatus === 'failed') {
            setStatus('failed');
            setErrorCode(result.errorCode ?? 'PREVIEW_FAILED');
            setMessage(result.message);
            return;
          }
          if (result.previewStatus === 'none') {
            setStatus('none');
            return;
          }

          setStatus(result.previewStatus === 'pending' ? 'pending' : 'converting');
          if (result.errorCode) setErrorCode(result.errorCode);
          if (result.message) setMessage(result.message);

          if (pollCount >= SLOW_AFTER_POLLS) {
            interval = Math.min(SLOW_INTERVAL_MS, Math.max(interval * 1.5, MAX_INTERVAL_MS));
          } else {
            interval = clampInterval(result.retryAfterMs || interval);
          }
        } catch (error) {
          if (disposed || isAbortError(error)) return;
          networkErrors += 1;
          if (networkErrors >= MAX_NETWORK_ERRORS) {
            setStatus('failed');
            setErrorCode('NETWORK_ERROR');
            setMessage('与预览服务的连接中断，稍后可重试');
            return;
          }
        }
      }
    };

    void run();

    return () => {
      disposed = true;
      controller.abort();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timer !== null) window.clearTimeout(timer);
      if (sleeping) {
        const resolve = sleeping;
        sleeping = null;
        resolve();
      }
    };
  }, [enabled, workspacePath, modifiedAt, hintStatus, hintErrorCode, userId, sessionId, attempt]);

  const retry = useCallback(() => {
    if (retriesLeftRef.current <= 0) return;
    const now = Date.now();
    if (now - lastRetryAtRef.current < RETRY_THROTTLE_MS) return;
    lastRetryAtRef.current = now;
    retriesLeftRef.current -= 1;
    setRetriesLeft(retriesLeftRef.current);
    retryRequestedRef.current = true;
    setStatus('pending');
    setErrorCode(null);
    setMessage(null);
    setTimedOut(false);
    setAttempt(value => value + 1);
  }, []);

  return { status, errorCode, message, version, timedOut, retriesLeft, retry };
}