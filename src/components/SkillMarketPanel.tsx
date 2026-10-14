'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  Check,
  Download,
  Loader2,
  PackageOpen,
  RefreshCw,
  Store,
  Trash2,
  Upload,
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
  uploadSkill,
  downloadSkillPackage,
  deleteSkill,
  type SkillItem,
} from '@/lib/skills';

type Filter = 'all' | 'installed';

/** 技能来源 -> 面向用户的中文文案。 */
function sourceLabel(source: string): string {
  const normalized = (source || '').toLowerCase();
  if (normalized === 'mysql' || normalized === 'marketplace') return '广场';
  if (normalized === 'builtin') return '内置';
  return source || '—';
}

/**
 * 技能广场面板：查看技能目录、浏览已安装状态、一键安装/卸载。
 * P2 新增管理员能力：上传/覆盖（zip）、下载打包、下架技能。
 *
 * - 数据统一走 BFF /api/skills，页面不直连数据面；
 * - userId 由聊天页传入（真实登录用户，未登录回退 anonymous）；
 * - isAdmin 来自控制面登录用户的 roles，仅 ADMIN 可见管理操作；
 * - 安装/卸载成功或管理员操作后整体刷新列表，以服务端结果作为唯一状态源。
 * 设计依据：doc/design/2026-10-14-技能广场前端设计.md。
 */
export function SkillMarketPanel({
  open,
  onOpenChange,
  userId,
  isAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  isAdmin: boolean;
}) {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [adminBusyName, setAdminBusyName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const name = await uploadSkill(file);
      toast.success('技能已上传/覆盖', { description: name });
      await load();
    } catch (err) {
      toast.error('上传失败', {
        description: err instanceof Error ? err.message : '请稍后重试',
      });
    } finally {
      setUploading(false);
    }
  };

  const downloadPackage = async (skill: SkillItem) => {
    setAdminBusyName(skill.name);
    try {
      await downloadSkillPackage(skill.name);
      toast.success('已下载技能包', { description: `${skill.name}.zip` });
    } catch (err) {
      toast.error('下载失败', {
        description: err instanceof Error ? err.message : '请稍后重试',
      });
    } finally {
      setAdminBusyName(null);
    }
  };

  const removeSkill = async (skill: SkillItem) => {
    if (!window.confirm(`确定下架技能「${skill.name}」？所有用户的安装关系也将被清理。`)) {
      return;
    }
    setAdminBusyName(skill.name);
    try {
      await deleteSkill(skill.name);
      toast.success('已下架技能', { description: skill.name });
      await load();
    } catch (err) {
      toast.error('下架失败', {
        description: err instanceof Error ? err.message : '请稍后重试',
      });
    } finally {
      setAdminBusyName(null);
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
            <div className="flex shrink-0 items-center gap-2">
              {isAdmin && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,.ZIP"
                    className="hidden"
                    onChange={handleUpload}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    title="上传/覆盖技能（zip）"
                    aria-label="上传技能"
                  >
                    {uploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1.5">上传</span>
                  </Button>
                </>
              )}
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
                const adminBusy = adminBusyName === skill.name;
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
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>来源</span>
                          <Badge variant="outline" className="text-[10px]">
                            {sourceLabel(skill.source)}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={adminBusy}
                              onClick={() => void downloadPackage(skill)}
                              title="下载打包"
                              aria-label={`下载 ${skill.name}`}
                            >
                              {adminBusy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              disabled={adminBusy}
                              onClick={() => void removeSkill(skill)}
                              title="下架技能"
                              aria-label={`下架 ${skill.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant={skill.installed ? 'outline' : 'default'}
                          className="shrink-0"
                          disabled={busy || adminBusy}
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