import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * 管理页标题区：标题 + 一句话说明 + 右侧主动作。
 * 设计依据：2026-11-04-知识库与专家模型前端设计.md §5.1。
 */
export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel = '返回知识库',
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {backHref && (
        <Link
          href={backHref}
          className="ui-interactive ui-focus-ring -mx-1 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-sm px-1 py-1.5 text-xs md:-my-1.5 md:min-h-9 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-balance text-xl font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-1 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}