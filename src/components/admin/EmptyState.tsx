import type { ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** 空态：一句事实 + 一个下一步动作，不用插画。设计文档 §5.5。 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      <p className="text-balance text-sm font-medium">{title}</p>
      {description && <p className="max-w-md text-pretty text-xs leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** 错误态：说明发生了什么 + 重试，不用「出错了」这种空话。 */
export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-5 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <p className="flex items-start gap-2 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {message}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          重试
        </Button>
      )}
    </div>
  );
}