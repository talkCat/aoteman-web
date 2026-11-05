'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileText, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { formatBytes } from '@/lib/knowledge-format';
import { cn } from '@/lib/utils';
import type { ChunkStrategy } from '@/types/knowledge';

const MAX_SIZE = 50 * 1024 * 1024;

const STRATEGY_OPTIONS: { value: ChunkStrategy; label: string }[] = [
  { value: 'AUTO', label: '自动' },
  { value: 'TOC', label: '目录层级' },
  { value: 'FIXED', label: '固定长度' },
];

type Stage = 'select' | 'uploading' | 'done';

/**
 * 上传 .docx。
 *
 * 上传走 `uploadDocument`（内部是 XMLHttpRequest，能拿到真实的上传进度）。
 * 服务端返回 202 即视为进入入库队列，后续阶段由详情页轮询任务接口推进。
 * 设计依据：接口清单 §3.1 / §3.6。
 */
export function UploadDocumentDialog({
  open,
  onOpenChange,
  defaultStrategy = 'AUTO',
  acceptStrategy = true,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStrategy?: ChunkStrategy;
  acceptStrategy?: boolean;
  onUpload: (input: {
    file: File;
    strategy: ChunkStrategy;
    onProgress: (percent: number) => void;
  }) => Promise<void>;
}) {
  const [stage, setStage] = useState<Stage>('select');
  const [file, setFile] = useState<File | null>(null);
  const [strategy, setStrategy] = useState<ChunkStrategy>(defaultStrategy);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  /** 防止重复提交：失败后会复位，成功则保持到对话框关闭。 */
  const uploadedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    uploadedRef.current = false;
    setStage('select');
    setFile(null);
    setStrategy(defaultStrategy);
    setProgress(0);
    setError(null);
  }, [open, defaultStrategy]);

  function pick(next: File | null) {
    if (!next) return;
    const name = next.name.toLowerCase();
    if (name.endsWith('.doc')) {
      setError('Word 的 .doc 格式暂不支持，请在 Word 中另存为 .docx 后再上传。');
      return;
    }
    if (name.endsWith('.pdf')) {
      setError('PDF 二期支持，当前只接受 .docx。');
      return;
    }
    if (!name.endsWith('.docx')) {
      setError('只支持 .docx 文件。');
      return;
    }
    if (next.size > MAX_SIZE) {
      setError(`文件 ${formatBytes(next.size)}，超过 50 MB 上限。请拆分后再上传。`);
      return;
    }
    setError(null);
    setFile(next);
  }

  async function startUpload() {
    if (!file || uploadedRef.current) return;
    uploadedRef.current = true;
    setStage('uploading');
    setProgress(0);
    setError(null);

    try {
      await onUpload({ file, strategy, onProgress: setProgress });
      setStage('done');
    } catch (uploadError) {
      uploadedRef.current = false;
      setStage('select');
      setError(uploadError instanceof Error ? uploadError.message : '上传失败，请稍后重试');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // 移动端做成底部 Sheet：通用 DialogContent 自带 left/top 50% 与 translate(-50%,-50%)，
          // 只覆盖 inset 会把 375px 宽的弹窗拽出屏幕左侧（left 变负值），必须同时重置位移。
          'max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none',
          'max-sm:max-h-[90dvh] max-sm:overflow-y-auto max-sm:[translate:0_0] max-sm:rounded-t-xl max-sm:rounded-b-none',
          'max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]',
          // 入场/退场方向同样改成自下而上，避免沿用居中弹窗的「从左侧 1/2 处滑入」。
          'max-sm:data-[state=open]:slide-in-from-left-0 max-sm:data-[state=open]:slide-in-from-bottom-4',
          'max-sm:data-[state=open]:zoom-in-100',
          'max-sm:data-[state=closed]:slide-out-to-left-0 max-sm:data-[state=closed]:slide-out-to-bottom-4',
          'max-sm:data-[state=closed]:zoom-out-100',
          'sm:max-w-[480px]',
        )}
      >
        <DialogHeader>
          <DialogTitle>{stage === 'done' ? '已提交入库' : '上传文档'}</DialogTitle>
          <DialogDescription>
            {stage === 'done'
              ? '文档已进入解析队列，可以在列表中查看四段入库进度。'
              : '仅支持 .docx，单文件不超过 50 MB。上传后自动解析、切片、向量化并写入索引。'}
          </DialogDescription>
        </DialogHeader>

        {stage === 'select' && (
          <div className="space-y-4">
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                pick(event.dataTransfer.files?.[0] ?? null);
              }}
              className={cn(
                'ui-interactive ui-focus-ring flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-9 text-center',
                dragOver && 'border-primary bg-primary/5',
              )}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Upload className="h-5 w-5" aria-hidden="true" />
              </span>
              {file ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {formatBytes(file.size)}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium">把 .docx 拖到这里，或点击选择文件</p>
                  <p className="text-[11px] text-muted-foreground">仅支持 .docx，≤ 50 MB</p>
                </>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".docx"
              aria-label="选择 .docx 文件"
              className="hidden"
              onChange={(event) => {
                pick(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
            />

            {error && (
              <p role="alert" className="rounded-md bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            {acceptStrategy && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">切片策略</p>
                <RadioGroup
                  value={strategy}
                  onValueChange={(value) => setStrategy(value as ChunkStrategy)}
                  className="grid grid-cols-3 gap-2"
                >
                  {STRATEGY_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      htmlFor={`strategy-${option.value}`}
                      className={cn(
                        'ui-interactive ui-focus-row flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-2 text-xs hover:border-primary/40',
                        strategy === option.value && 'border-primary/60 bg-primary/5',
                      )}
                    >
                      <RadioGroupItem id={`strategy-${option.value}`} value={option.value} data-row-link className="h-3.5 w-3.5" />
                      {option.label}
                    </label>
                  ))}
                </RadioGroup>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  自动：识别到目录就按层级切父子块，识别不到按固定长度切。
                </p>
              </div>
            )}
          </div>
        )}

        {stage === 'uploading' && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{file?.name}</span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {Math.round(progress)}%
              </span>
            </div>
            <Progress value={progress} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground">正在上传…</p>
          </div>
        )}

        {stage === 'done' && (
          <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 px-4 py-5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{file?.name}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                已进入入库队列，解析开始后会在列表内实时推进。
              </p>
            </div>
          </div>
        )}

        {/* 移动端横排：主操作（最后一个按钮）占满剩余宽度，符合底部 Sheet 的拇指可达区。 */}
        <DialogFooter className="max-sm:flex-row max-sm:items-center max-sm:gap-2 max-sm:[&>button:last-child]:flex-1">
          {stage === 'select' && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button onClick={() => void startUpload()} disabled={!file}>
                上传
              </Button>
            </>
          )}
          {stage === 'uploading' && (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              后台继续
            </Button>
          )}
          {stage === 'done' && (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  uploadedRef.current = false;
                  setFile(null);
                  setProgress(0);
                  setStage('select');
                }}
              >
                再传一份
              </Button>
              <Button onClick={() => onOpenChange(false)}>完成</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}