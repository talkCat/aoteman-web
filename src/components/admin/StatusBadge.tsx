import { cn } from '@/lib/utils';

export type StatusTone = 'success' | 'warning' | 'primary' | 'destructive' | 'muted' | 'neutral';

const TONE_DOT: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  primary: 'bg-primary',
  destructive: 'bg-destructive',
  muted: 'bg-muted-foreground/50',
  neutral: 'bg-muted-foreground/35',
};

const TONE_SURFACE: Record<StatusTone, string> = {
  success: 'border-success/25 bg-success/10 text-foreground/85 dark:text-foreground/90',
  warning: 'border-warning/30 bg-warning/10 text-foreground/85 dark:text-foreground/90',
  primary: 'border-primary/25 bg-primary/10 text-foreground/85 dark:text-foreground/90',
  destructive: 'border-destructive/25 bg-destructive/10 text-foreground/85 dark:text-foreground/90',
  muted: 'border-border/60 bg-muted/55 text-muted-foreground',
  neutral: 'border-border/60 bg-muted/40 text-muted-foreground',
};

/**
 * 状态徽标：圆点 + 文字双重编码，不只靠颜色区分。
 * 底色用 10% 语义色填充 + 顶部内高光，让它从表格行上微微凸起；
 * 文字统一用前景色，规避语义色在暗色模式下的对比度问题。
 */
export function StatusBadge({
  tone,
  label,
  pulse = false,
  title,
  className,
}: {
  tone: StatusTone;
  label: string;
  pulse?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'surface-chip inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] leading-4',
        TONE_SURFACE[tone],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          TONE_DOT[tone],
          pulse && 'animate-pulse motion-reduce:animate-none',
        )}
      />
      {label}
    </span>
  );
}
