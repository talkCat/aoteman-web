import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * 管理页标题区：眉标 + 标题 + 一句话说明 + 右侧主动作 + 可选 3D 主视觉。
 * 设计依据：2026-11-04-知识库与专家模型前端设计.md §5.1、
 * 2026-11-05-整体UI交互风格切换调整计划.md §P4（品牌素材接入）。
 * 3D 素材只做装饰：`aria-hidden`，不进无障碍树，也不承载任何业务信息。
 */
export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel = '返回知识库',
  eyebrow,
  art,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  eyebrow?: string;
  art?: { src: string; width: number; height: number };
  className?: string;
}) {
  // 只有纯文本标题走渐变；带徽标等富节点的标题保持实色，避免渐变作用到子节点。
  const gradientTitle = typeof title === 'string';

  return (
    <div className={cn('space-y-3', className)}>
      {backHref && (
        <Link
          href={backHref}
          className="ui-interactive ui-focus-ring -mx-1 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-sm px-1 py-1.5 text-xs text-muted-foreground hover:text-foreground md:-my-1.5 md:min-h-9"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {backLabel}
        </Link>
      )}
      <div className="flex items-start justify-between gap-4 sm:gap-6">
        <div className="min-w-0 max-w-xl">
          {eyebrow && (
            <p className="page-eyebrow">
              <span className="pulse-dot" aria-hidden="true" />
              {eyebrow}
            </p>
          )}
          <h2
            className={cn(
              'text-balance text-[22px] font-semibold leading-tight tracking-[-0.01em]',
              eyebrow && 'mt-2',
            )}
          >
            <span className={gradientTitle ? 'page-title-gradient' : undefined}>{title}</span>
          </h2>
          {description && (
            <p className="mt-1.5 text-pretty text-[13px] leading-relaxed text-fg-3">{description}</p>
          )}
          {art && actions && (
            <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
        {art ? (
          <div
            aria-hidden="true"
            className="brand-art-frame mr-1 hidden h-[124px] w-[124px] shrink-0 md:grid xl:h-[136px] xl:w-[136px]"
          >
            <span className="brand-art-glow" />
            <Image
              src={art.src}
              width={art.width}
              height={art.height}
              alt=""
              priority
              className="brand-art brand-art-float"
            />
          </div>
        ) : (
          actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 pt-0.5">{actions}</div>
          )
        )}
      </div>
    </div>
  );
}