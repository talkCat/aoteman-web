'use client';

import { Check, Download, Loader2, Package, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type { SkillItem } from '@/types/skill';

/** 技能来源 -> 面向用户的中文文案。 */
function sourceLabel(source: string): string {
  const normalized = (source || '').toLowerCase();
  if (normalized === 'mysql' || normalized === 'marketplace' || normalized === 'aoteman-marketplace') {
    return '广场';
  }
  if (normalized === 'builtin') return '内置';
  return source || '—';
}

export function SkillCard({
  skill,
  busy,
  adminBusy,
  isAdmin,
  onInstall,
  onUninstall,
  onDownload,
  onRemove,
}: {
  skill: SkillItem;
  busy: boolean;
  adminBusy: boolean;
  isAdmin: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const disabled = busy || adminBusy;

  return (
    <article className="flex min-h-[196px] min-w-0 flex-col bg-card transition-colors hover:bg-accent/10">
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Package className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="min-w-0 break-all font-mono text-[13px] font-semibold leading-snug">
                {skill.name}
              </h3>
              {skill.installed && (
                <Badge
                  variant="outline"
                  className="shrink-0 gap-1 border-success/30 bg-success/10 font-normal text-success"
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                  已安装
                </Badge>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              来源 · {sourceLabel(skill.source)}
            </p>
          </div>
        </div>

        <p className="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-muted-foreground">
          {skill.description || '暂无描述'}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5">
        <span className="text-[11px] text-muted-foreground">
          {skill.installed ? '已安装 · 下一轮可见' : '未安装'}
        </span>

        {skill.installed ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs"
                disabled={disabled}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                卸载
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>卸载「{skill.name}」？</AlertDialogTitle>
                <AlertDialogDescription>
                  卸载后该技能会立即从你的下一轮对话中消失，可随时从广场重新安装。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onUninstall}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  确认卸载
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button
            size="sm"
            className="h-8 px-2.5 text-xs"
            disabled={disabled}
            onClick={onInstall}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            安装
          </Button>
        )}
      </div>

      {isAdmin && (
        <div className="flex items-center gap-1 border-t border-border/60 bg-muted/20 px-2 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-muted-foreground"
            disabled={disabled}
            onClick={onDownload}
          >
            {adminBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            下载
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'ml-auto h-7 px-2 text-[11px] text-muted-foreground',
                  'hover:text-destructive',
                )}
                disabled={disabled}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                下架
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>下架「{skill.name}」？</AlertDialogTitle>
                <AlertDialogDescription>
                  将删除技能主数据、资源以及所有用户的安装关系，此操作不可撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onRemove}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  确认下架
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </article>
  );
}