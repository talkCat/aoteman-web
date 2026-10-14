'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Download,
  Loader2,
  PackageOpen,
  RefreshCw,
  Store,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  fetchSkills,
  installSkill,
  uninstallSkill,
  type SkillItem,
} from '@/lib/skills';

type Filter = 'all' | 'installed';

/** 技能来源 → 面向用户的中文文案。 */
function sourceLabel(source: string): string {
  const normalized = (source || '').toLowerCase();
  if (normalized === 'mysql' || normalized === 'marketplace') return '广场';
  if (normalized === 'builtin') return '内置';
  return source || '—';
}

/**
 * 技能广场面板：查看技能目录、浏览已安装状态、一键安装 / 卸载。
 *
 * - 数据统一走 BFF /api/skills，页面不直连数据面；
 * - userId 由聊天页传入（真实登录用户，未登录回退 anonymous）；
 * - 安装 / 卸载成功后整体刷新列表，以服务端结果为唯一状态源。
 * 设计依据：doc/design/2026-10-14-技能广场前端.md。
 */
export function SkillMarketPanel({
  open,
  onOpenChange,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}) {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSkills(await fetchSkills(userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载技能列表失败');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const toggle = async (skill: SkillItem) => {
    setBusyName(skill.name);
    try {
      if (skill.installed) {
        await uninstallSkill(skill.name, userId);
        toast.success('已卸载技能', { description: skill.name });
      } else {
        await installSkill(skill.name, userId);
        toast.success('已安装技能', { description: skill.name });
      }
      await load();
    } catch (err) {
      toast.error(skill.installed ? '卸载失败' : '安装失败', {
        description: err instanceof Error ? err.message : '请稍后重试',
      });
    } finally {
      setBusyName(null);
    }
  };

  const installedCount = skills.filter(s => s.installed).length;
  const visible = filter === 'installed' ? skills.filter(s => s.installed) : skills;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <DialogTitle className="flex items-center gap-2">
                <Store className="h-5 w-5 text-primary" />
                技能广场
              </DialogTitle>
              <DialogDescription>
                安装后，智能体即可在对话中按技能名加载使用。
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => void load()}
              disabled={loading}
              title="刷新"
              aria-label="刷新技能列表"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </DialogHeader>

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                filter === 'all'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              全部{skills.length > 0 ? `（${skills.length}）` : ''}
            </button>
            <button
              type="button"
              onClick={() => setFilter('installed')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                filter === 'installed'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              已安装（{installedCount}）
            </button>
          </div>
          <Badge variant="secondary">{installedCount} 个已安装</Badge>
        </div>

        <ScrollArea className="mt-3 max-h-[60vh] pr-1">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="rounded-xl border border-border/70 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                  <Skeleton className="mt-3 h-4 w-full" />
                  <Skeleton className="mt-2 h-4 w-2/3" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                <RefreshCw className="h-3.5 w-3.5" />
                重试
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center text-muted-foreground">
              <PackageOpen className="h-10 w-10 opacity-40" />
              <p className="text-sm">
                {filter === 'installed' ? '你还没有安装任何技能' : '技能广场暂未上架技能'}
              </p>
              {filter === 'installed' && (
                <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
                  去看全部技能
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3 pb-1">
              {visible.map(skill => {
                const busy = busyName === skill.name;
                return (
                  <div
                    key={skill.name}
                    className={cn(
                      'rounded-xl border border-border/70 p-4 transition-colors',
                      skill.installed && 'border-success/30 bg-success/5'
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-semibold">{skill.name}</h3>
                          {skill.installed && (
                            <Badge variant="secondary" className="shrink-0 gap-1">
                              <Check className="h-3 w-3" />
                              已安装
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>来源</span>
                          <Badge variant="outline" className="text-[10px]">
                            {sourceLabel(skill.source)}
                          </Badge>
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={skill.installed ? 'outline' : 'default'}
                        className="shrink-0"
                        disabled={busy}
                        onClick={() => void toggle(skill)}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : skill.installed ? (
                          <Trash2 className="h-3.5 w-3.5" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        <span className="ml-1.5">{skill.installed ? '卸载' : '安装'}</span>
                      </Button>
                    </div>
                    {skill.description && (
                      <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                        {skill.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
