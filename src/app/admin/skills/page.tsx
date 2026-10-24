'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, PackageOpen, RefreshCw, Store } from 'lucide-react';
import { toast } from 'sonner';

import { useAdminUser } from '@/components/admin/AdminUserContext';
import { SkillCard } from '@/components/admin/SkillCard';
import { SkillUpload } from '@/components/admin/SkillUpload';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  deleteSkill,
  downloadSkillPackage,
  fetchSkills,
  installSkill,
  uninstallSkill,
} from '@/lib/skills';
import type { SkillItem } from '@/types/skill';

type SkillView = 'all' | 'installed';

/**
 * 技能管理页：广场 / 我的技能 + ADMIN 上传、下载、下架。
 * 安装 / 卸载使用乐观更新，失败回滚；不整页刷新。
 * 设计依据：2026-10-24-智能体后台管理模块设计.md §4.3 / §4.4。
 */
export default function SkillsPage() {
  const user = useAdminUser();
  const isAdmin = Array.isArray(user.roles) && user.roles.includes('ADMIN');

  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<SkillView>('all');
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [adminBusyName, setAdminBusyName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      setLoadError(null);
      try {
        setSkills(await fetchSkills(user.userId));
      } catch (error) {
        setLoadError(
          error instanceof Error && error.message
            ? error.message
            : '加载技能列表失败，请稍后重试。',
        );
      } finally {
        setLoading(false);
      }
    },
    [user.userId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleInstall(skill: SkillItem) {
    const shouldInstall = !skill.installed;
    setPendingName(skill.name);
    // 乐观更新：立即切换徽标与按钮，失败时回滚。
    setSkills((prev) =>
      prev.map((item) =>
        item.name === skill.name ? { ...item, installed: shouldInstall } : item,
      ),
    );

    try {
      if (shouldInstall) await installSkill(skill.name, user.userId);
      else await uninstallSkill(skill.name, user.userId);
      toast.success(shouldInstall ? '已安装技能' : '已卸载技能', {
        description: skill.name,
      });
    } catch (error) {
      setSkills((prev) =>
        prev.map((item) =>
          item.name === skill.name ? { ...item, installed: skill.installed } : item,
        ),
      );
      toast.error(shouldInstall ? '安装失败' : '卸载失败', {
        description:
          error instanceof Error && error.message ? error.message : '请稍后重试。',
      });
    } finally {
      setPendingName(null);
    }
  }

  async function handleUploaded(name: string) {
    toast.success('技能已上传 / 覆盖', { description: name });
    await load(true);
  }

  async function downloadPackage(skill: SkillItem) {
    setAdminBusyName(skill.name);
    try {
      await downloadSkillPackage(skill.name);
      toast.success('已下载技能包', { description: `${skill.name}.zip` });
    } catch (error) {
      toast.error('下载失败', {
        description:
          error instanceof Error && error.message ? error.message : '请稍后重试。',
      });
    } finally {
      setAdminBusyName(null);
    }
  }

  async function removeSkill(skill: SkillItem) {
    setAdminBusyName(skill.name);
    try {
      await deleteSkill(skill.name);
      setSkills((prev) => prev.filter((item) => item.name !== skill.name));
      toast.success('已下架技能', { description: skill.name });
    } catch (error) {
      toast.error('下架失败', {
        description:
          error instanceof Error && error.message ? error.message : '请稍后重试。',
      });
    } finally {
      setAdminBusyName(null);
    }
  }

  const installedSkills = skills.filter((skill) => skill.installed);

  function renderContent(items: SkillItem[], kind: SkillView) {
    if (loading) {
      return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-[196px] rounded-lg" />
          ))}
        </div>
      );
    }

    if (loadError && skills.length === 0) {
      return (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {loadError}
          </p>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            重试
          </Button>
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 bg-card px-6 py-12 text-center">
          <PackageOpen className="h-9 w-9 text-muted-foreground/40" aria-hidden="true" />
          {kind === 'installed' ? (
            <>
              <p className="text-sm text-muted-foreground">去广场装一个试试</p>
              <Button variant="outline" size="sm" onClick={() => setView('all')}>
                浏览广场
              </Button>
            </>
          ) : isAdmin ? (
            <>
              <p className="text-sm text-muted-foreground">还没有技能，点击上传一个 zip 包</p>
              <SkillUpload
                onUploaded={handleUploaded}
                uploading={uploading}
                onUploadingChange={setUploading}
                label="上传技能包"
                variant="outline"
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">技能广场暂未上架技能，请稍后再来看看</p>
          )}
        </div>
      );
    }

    return (
      <div className="grid gap-px overflow-hidden rounded-lg border border-border/70 bg-border/60 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((skill) => (
          <SkillCard
            key={skill.name}
            skill={skill}
            busy={pendingName === skill.name}
            adminBusy={adminBusyName === skill.name}
            isAdmin={isAdmin}
            onInstall={() => void toggleInstall(skill)}
            onUninstall={() => void toggleInstall(skill)}
            onDownload={() => void downloadPackage(skill)}
            onRemove={() => void removeSkill(skill)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          安装后技能会在下一轮对话中可见；卸载会立即影响可用范围。
          {isAdmin && ' 管理员可上传 zip 包、下载打包或下架技能。'}
        </p>
        {isAdmin && (
          <SkillUpload
            onUploaded={handleUploaded}
            uploading={uploading}
            onUploadingChange={setUploading}
          />
        )}
      </div>

      {loadError && skills.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p role="alert" className="text-xs text-destructive">
            {loadError}
          </p>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void load(true)}>
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            刷新
          </Button>
        </div>
      )}

      <Tabs value={view} onValueChange={(value) => setView(value as SkillView)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="h-9">
            <TabsTrigger value="all" className="gap-1.5 px-3 text-xs sm:text-sm">
              <Store className="h-3.5 w-3.5" aria-hidden="true" />
              广场
            </TabsTrigger>
            <TabsTrigger value="installed" className="gap-1.5 px-3 text-xs sm:text-sm">
              <PackageOpen className="h-3.5 w-3.5" aria-hidden="true" />
              我的技能
            </TabsTrigger>
          </TabsList>
          <span className="text-xs text-muted-foreground">
            {skills.length} 个技能 · {installedSkills.length} 个已安装
          </span>
        </div>

        <TabsContent value="all" className="mt-4">
          {renderContent(skills, 'all')}
        </TabsContent>
        <TabsContent value="installed" className="mt-4">
          {renderContent(installedSkills, 'installed')}
        </TabsContent>
      </Tabs>

      {uploading && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground" role="status">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          正在上传技能包，请勿关闭页面…
        </p>
      )}
    </div>
  );
}
