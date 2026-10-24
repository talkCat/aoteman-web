'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type {
  PermissionBaselineBehavior,
  PermissionCatalogItem,
  PermissionToolClass,
} from '@/types/permission';

type PostureCell = {
  key: string;
  label: string;
  behavior: PermissionBaselineBehavior | null;
  isFallback?: boolean;
};

const CORE_CELLS: { key: string; label: string; toolClass: PermissionToolClass }[] = [
  { key: 'READ', label: 'READ', toolClass: 'READ' },
  { key: 'WRITE', label: 'WRITE', toolClass: 'WRITE' },
  { key: 'EXECUTE', label: 'EXECUTE', toolClass: 'EXECUTE' },
  { key: 'DELETE', label: 'DELETE', toolClass: 'DELETE' },
];

const BEHAVIOR_TEXT: Record<PermissionBaselineBehavior, string> = {
  allow: '放行',
  ask: '询问',
  deny: '拒绝',
};

function aggregateBaseline(
  catalog: PermissionCatalogItem[],
  toolClass: PermissionToolClass,
): PermissionBaselineBehavior | null {
  const behaviors = new Set(
    catalog.filter((item) => item.toolClass === toolClass).map((item) => item.baselineBehavior),
  );
  if (behaviors.size === 0) return null;
  return behaviors.size === 1 ? [...behaviors][0] : null;
}

function toneOf(behavior: PermissionBaselineBehavior | null): { cell: string; dot: string } {
  if (behavior === 'allow') return { cell: 'bg-success/10', dot: 'bg-success' };
  if (behavior === 'ask') return { cell: 'bg-warning/10', dot: 'bg-warning' };
  if (behavior === 'deny') return { cell: 'bg-destructive/10', dot: 'bg-destructive' };
  return { cell: 'bg-muted/40', dot: 'bg-muted-foreground/40' };
}

/**
 * 权限态势条：把平台基线策略压缩成一条可扫读的横条。
 * 四类基线来自 catalog；「其他」是未登记工具的兜底策略（询问），
 * 逐工具的真实行为以下方目录为准。
 */
export function PermissionPosture({
  catalog,
  loading,
}: {
  catalog: PermissionCatalogItem[];
  loading?: boolean;
}) {
  const unconfigurable = catalog.filter((item) => !item.configurable);
  const cells: PostureCell[] = [
    ...CORE_CELLS.map((cell) => ({
      key: cell.key,
      label: cell.label,
      behavior: aggregateBaseline(catalog, cell.toolClass),
    })),
    { key: 'OTHER', label: '其他', behavior: 'ask', isFallback: true },
  ];

  return (
    <section aria-labelledby="permission-posture-heading" className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-1.5">
        <h2 id="permission-posture-heading" className="text-sm font-semibold tracking-tight">
          平台默认策略
        </h2>
        <span className="text-[11px] text-muted-foreground">基线 + 兜底</span>
      </div>

      <div
        role="list"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border/70 bg-border sm:grid-cols-3 lg:grid-cols-5"
      >
        {loading
          ? cells.map((cell) => <Skeleton key={cell.key} className="h-[62px] rounded-none" />)
          : cells.map((cell) => {
              const tone = toneOf(cell.behavior);
              return (
                <div
                  key={cell.key}
                  role="listitem"
                  className={cn(
                    'flex min-h-[62px] flex-col justify-center gap-1 px-3 py-3',
                    tone.cell,
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} aria-hidden="true" />
                    <span className="font-mono tracking-wide">{cell.label}</span>
                    {cell.isFallback && (
                      <span className="text-[10px] font-normal text-muted-foreground/80">兜底</span>
                    )}
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {cell.behavior ? BEHAVIOR_TEXT[cell.behavior] : '未登记'}
                  </span>
                </div>
              );
            })}
      </div>

      <div className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
        <p>
          可在「我的规则」中把可配置工具收紧为「每次询问 / 拒绝」；shell 内删除不会弹确认，子 Agent
          不继承询问。
        </p>
        <p>
          「其他」是未登记工具的兜底策略；INTERACT / COORDINATION 类当前放行
          {unconfigurable.length > 0 && (
            <>
              ，{unconfigurable.length} 个未接管工具（如{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">skill_manage</code>
              ）恒放行且不可配置
            </>
          )}
          。逐项行为以工具目录为准。
        </p>
      </div>
    </section>
  );
}