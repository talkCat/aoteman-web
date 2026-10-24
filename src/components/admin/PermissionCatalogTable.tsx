'use client';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TOOL_CLASS_LABELS } from '@/lib/permission-labels';
import { cn } from '@/lib/utils';
import type {
  PermissionBaselineBehavior,
  PermissionCatalogItem,
} from '@/types/permission';

const BASELINE_TEXT: Record<PermissionBaselineBehavior, string> = {
  allow: '放行',
  ask: '询问',
  deny: '拒绝',
};

function BaselineBadge({ behavior }: { behavior: PermissionBaselineBehavior }) {
  const dot =
    behavior === 'allow'
      ? 'bg-success'
      : behavior === 'ask'
        ? 'bg-warning'
        : 'bg-destructive';
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden="true" />
      {BASELINE_TEXT[behavior]}
    </Badge>
  );
}

function ConfigBadge({ configurable }: { configurable: boolean }) {
  if (configurable) {
    return (
      <Badge variant="secondary" className="font-normal">
        可配置
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-dashed font-normal text-muted-foreground">
      恒放行 · 不可配置
    </Badge>
  );
}

function descriptionFor(item: PermissionCatalogItem): string {
  if (!item.configurable) return '未接入权限引擎，恒放行、规则不生效';
  if (item.toolClass === 'DELETE') return '删除类默认询问，可进一步收紧为拒绝';
  if (item.toolClass === 'UNCLASSIFIED') return '未分类 · 按兜底策略处理';
  return '基线放行，可收紧为每次询问 / 拒绝';
}

/** 工具目录：桌面表格 + 移动端紧凑列表，均不产生页面级横向滚动。 */
export function PermissionCatalogTable({
  items,
  loading,
}: {
  items: PermissionCatalogItem[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg border border-border/70 bg-card" aria-busy="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton
            key={index}
            className={cn(
              'h-11 rounded-none border-b border-border/40 last:border-b-0',
              index % 2 === 1 && 'bg-muted/30',
            )}
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        目录里还没有工具。
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-border/70 bg-card md:block">
        <Table className="table-fixed text-[13px]" aria-label="工具权限目录">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[29%] px-3 text-xs">工具</TableHead>
              <TableHead className="w-[12%] px-3 text-xs">分类</TableHead>
              <TableHead className="w-[13%] px-3 text-xs">基线行为</TableHead>
              <TableHead className="w-[19%] px-3 text-xs">可配置</TableHead>
              <TableHead className="px-3 text-xs">说明</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.toolName}
                className={cn('h-11', !item.configurable && 'bg-muted/20 hover:bg-muted/30')}
              >
                <TableCell className="px-3 py-2.5">
                  <span
                    className="block truncate font-mono text-[12.5px]"
                    title={item.toolName}
                  >
                    {item.toolName}
                  </span>
                </TableCell>
                <TableCell className="px-3 py-2.5">
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    {TOOL_CLASS_LABELS[item.toolClass]}
                  </Badge>
                </TableCell>
                <TableCell className="px-3 py-2.5">
                  <BaselineBadge behavior={item.baselineBehavior} />
                </TableCell>
                <TableCell className="px-3 py-2.5">
                  <ConfigBadge configurable={item.configurable} />
                </TableCell>
                <TableCell
                  className={cn(
                    'px-3 py-2.5 text-xs',
                    item.configurable ? 'text-muted-foreground' : 'text-muted-foreground/70',
                  )}
                >
                  {descriptionFor(item)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/70 bg-card md:hidden">
        {items.map((item) => (
          <li
            key={item.toolName}
            className={cn('space-y-2 p-3', !item.configurable && 'bg-muted/20')}
          >
            <div className="flex items-start justify-between gap-2">
              <code className="min-w-0 break-all font-mono text-[12.5px] leading-snug">
                {item.toolName}
              </code>
              <span className="shrink-0">
                <ConfigBadge configurable={item.configurable} />
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="font-normal text-muted-foreground">
                {TOOL_CLASS_LABELS[item.toolClass]}
              </Badge>
              <BaselineBadge behavior={item.baselineBehavior} />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {descriptionFor(item)}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}