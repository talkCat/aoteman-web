'use client';

import { Check } from 'lucide-react';

import { Progress } from '@/components/ui/progress';
import { STAGE_LABEL, STAGE_ORDER, STAGE_SHORT_LABEL, percentOfStage, stageIndex } from '@/lib/knowledge-format';
import { cn } from '@/lib/utils';
import type { IngestStage } from '@/types/knowledge';

/**
 * 入库四段进度：解析 → 切片 → 向量化 → 建索引。
 *
 * 阶段完全按后端 stage 原样映射，不合成假百分比；后端给 progress 时用它，
 * 不给时按阶段等分展示。设计依据：设计文档 §8.2。
 */
export function IngestPipeline({
  stage,
  progress,
  variant = 'full',
  ariaLabel,
  className,
}: {
  stage: IngestStage | null;
  progress: number | null;
  variant?: 'full' | 'compact';
  ariaLabel?: string;
  className?: string;
}) {
  const percent = percentOfStage(stage, progress);
  const current = stageIndex(stage);
  const label = stage ? STAGE_LABEL[stage] : '等待开始';

  if (variant === 'compact') {
    return (
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${label} ${percent}%`}
        aria-label={ariaLabel ?? label}
        className={cn('flex items-center gap-2', className)}
      >
        <span className="text-[11px] text-primary">
          {stage ? STAGE_SHORT_LABEL[stage] : '等待'} · {percent}%
        </span>
        <span aria-hidden="true" className="flex flex-1 items-center">
          <Progress value={percent} className="h-1 w-full" />
        </span>
      </div>
    );
  }

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${label} ${percent}%`}
      aria-label={ariaLabel ?? label}
      aria-live="polite"
      className={cn('flex items-center gap-2', className)}
    >
      {STAGE_ORDER.map((item, index) => {
        const done = index < current || (index === current && percent >= 100);
        const active = index === current && !done;
        return (
          <div key={item} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                'flex shrink-0 items-center gap-1.5 text-[11px] leading-4',
                done && 'text-success',
                active && 'text-primary',
                !done && !active && 'text-muted-foreground',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-3.5 w-3.5 items-center justify-center rounded-full border',
                  done && 'border-success/40 bg-success/10',
                  active && 'animate-pulse border-primary/40 bg-primary/10 motion-reduce:animate-none',
                  !done && !active && 'border-border',
                )}
              >
                {done ? (
                  <Check className="h-2.5 w-2.5" />
                ) : (
                  <span className={cn('h-1 w-1 rounded-full', active ? 'bg-primary' : 'bg-muted-foreground/40')} />
                )}
              </span>
              <span className="truncate">{STAGE_LABEL[item]}</span>
              {active && <span className="font-mono tabular-nums">{percent}%</span>}
            </span>
            {index < STAGE_ORDER.length - 1 && (
              <span
                aria-hidden="true"
                className={cn('h-px min-w-2 flex-1', done ? 'bg-success/40' : 'bg-border')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}