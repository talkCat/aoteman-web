'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  BrainCircuit,
  Check,
  ExternalLink,
  MoreHorizontal,
  PlugZap,
  Power,
  Trash2,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/admin/EmptyState';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusBadge, type StatusTone } from '@/components/admin/StatusBadge';
import { UserGrantPicker } from '@/components/admin/UserGrantPicker';
import { ExpertKnowledgePicker } from '@/components/admin/experts/ExpertKnowledgePicker';
import { ExpertPromptEditor, PROMPT_MAX } from '@/components/admin/experts/ExpertPromptEditor';
import { ExpertPublishChecklist } from '@/components/admin/experts/ExpertPublishChecklist';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  apiErrorMessage,
  createExpert,
  deleteExpert as deleteExpertRequest,
  fetchKnowledgeBaseSummaries,
  getAdminExpert,
  getExpertGrants,
  getExpertKnowledgeBases,
  KnowledgeApiError,
  listAdminUsers,
  replaceExpertGrants,
  replaceExpertKnowledgeBases,
  toAdminExpert,
  updateExpert,
  type ExpertAdminDto,
  type ExpertCommand,
} from '@/lib/knowledge-api';
import { formatDateTime, initialOf } from '@/lib/knowledge-format';
import { cn } from '@/lib/utils';
import type {
  AdminExpertDetail,
  ExpertKnowledgeBinding,
  ExpertStatus,
  GrantUser,
  KnowledgeBaseSummary,
} from '@/types/knowledge';

const STATUS_META: Record<ExpertStatus, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: '已发布', tone: 'success' },
  DRAFT: { label: '草稿', tone: 'warning' },
  DISABLED: { label: '已停用', tone: 'muted' },
  DELETED: { label: '已删除', tone: 'muted' },
};

type Draft = {
  name: string;
  description: string;
  avatarUrl: string;
  welcomeMessage: string;
  systemPrompt: string;
  knowledgeBases: ExpertKnowledgeBinding[];
  grants: GrantUser[];
};

const EMPTY_DRAFT: Draft = {
  name: '',
  description: '',
  avatarUrl: '',
  welcomeMessage: '',
  systemPrompt: '',
  knowledgeBases: [],
  grants: [],
};

function isExpertNotFound(error: unknown): boolean {
  return (
    error instanceof KnowledgeApiError && (error.status === 404 || error.code === 'EXPERT_NOT_FOUND')
  );
}

/** 授权记录里引用的用户可能已被停用 / 删除，保留 userId，避免再次保存时把它丢掉。 */
function placeholderUser(userId: string): GrantUser {
  return {
    userId,
    username: userId,
    displayName: '用户已不可用',
    email: null,
    roles: [],
    status: 'UNKNOWN',
  };
}

function draftFrom(expert: AdminExpertDetail): Draft {
  return {
    name: expert.name,
    description: expert.description ?? '',
    avatarUrl: expert.avatarUrl ?? '',
    welcomeMessage: expert.welcomeMessage ?? '',
    systemPrompt: expert.systemPrompt,
    knowledgeBases: [...expert.knowledgeBases].sort((a, b) => a.sortOrder - b.sortOrder),
    grants: [...expert.grants],
  };
}

/**
 * 专家新建 / 编辑表单。
 *
 * 专家是独立模块：提示词 + 知识库 + 技能 + MCP + 授权用户。
 * 数据全部走控制面接口：主体六字段 PATCH 全量覆盖，知识库与授权各自 PUT 全量替换。
 * 设计依据：设计文档 §9.2 / §9.3；任务拆解 F-07 / F-08 / F-09。
 */
export function ExpertForm({ mode, expertId }: { mode: 'new' | 'edit'; expertId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab') ?? 'basic';
  const tab = ['basic', 'knowledge', 'grants', 'resources'].includes(rawTab) ? rawTab : 'basic';

  const [bases, setBases] = useState<KnowledgeBaseSummary[]>([]);
  const [users, setUsers] = useState<GrantUser[]>([]);
  const [expert, setExpert] = useState<AdminExpertDetail | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [baseline, setBaseline] = useState<Draft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setNotFound(false);

    async function load() {
      try {
        const [baseList, userList] = await Promise.all([
          fetchKnowledgeBaseSummaries(),
          listAdminUsers(),
        ]);
        if (cancelled) return;
        setBases(baseList);
        setUsers(userList);

        if (mode !== 'edit' || !expertId) {
          setExpert(null);
          setDraft(EMPTY_DRAFT);
          setBaseline(EMPTY_DRAFT);
          return;
        }

        let loaded: { dto: ExpertAdminDto; kbIds: string[]; grantIds: string[] } | null = null;
        try {
          const [dto, kbIds, grantIds] = await Promise.all([
            getAdminExpert(expertId),
            getExpertKnowledgeBases(expertId),
            getExpertGrants(expertId),
          ]);
          loaded = { dto, kbIds, grantIds };
        } catch (error) {
          if (cancelled) return;
          if (isExpertNotFound(error)) {
            setNotFound(true);
            return;
          }
          throw error;
        }
        if (cancelled || !loaded) return;

        const userById = new Map(userList.map((user) => [user.userId, user]));
        const detail = toAdminExpert(
          { ...loaded.dto, kbIds: loaded.kbIds },
          {
            bases: baseList,
            grants: loaded.grantIds.map((id) => userById.get(id) ?? placeholderUser(id)),
          },
        );
        setExpert(detail);
        const nextDraft = draftFrom(detail);
        setDraft(nextDraft);
        setBaseline(nextDraft);
      } catch (error) {
        if (!cancelled) setLoadError(apiErrorMessage(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, expertId, reloadToken]);

  const promptLength = draft.systemPrompt.length;
  const nameInvalid = showErrors && draft.name.trim().length === 0;
  const promptInvalid = promptLength === 0 || promptLength > PROMPT_MAX;
  const promptDirty = Boolean(expert && expert.systemPrompt !== draft.systemPrompt);
  // 移动端折叠面板只露出一行摘要，摘要要说「还差几项」而不是提示词字数——
  // 字数在下方编辑器里已经有计数器，重复展示会让人误以为是检查项进度。
  const blockingCount = (draft.name.trim() ? 0 : 1) + (promptInvalid ? 1 : 0);
  // 移动端 footer 只有一行 11px 的空间，长句会被「保存草稿 / 发布」挤断；
  // 这里只回答「哪几项没填」，字数与知识库数交给编辑器里的计数器。
  const footerBlockers = [draft.name.trim() ? null : '名称', promptLength === 0 ? '提示词' : null].filter(
    (item): item is string => Boolean(item),
  );
  const warningCount =
    (draft.knowledgeBases.length > 0 ? 0 : 1) + (draft.grants.length > 0 ? 0 : 1) + (promptDirty ? 1 : 0);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline]);
  const status: ExpertStatus = expert?.status ?? 'DRAFT';

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function setTab(next: string) {
    const query = new URLSearchParams(searchParams.toString());
    query.set('tab', next);
    router.replace(`/admin/experts/${expertId ?? 'new'}?${query.toString()}`, { scroll: false });
  }

  function patch(changes: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function validate(): boolean {
    setShowErrors(true);
    if (!draft.name.trim()) {
      setTab('basic');
      toast.error('名称不能为空', { description: '名称是问答页展示给用户的唯一标识。' });
      return false;
    }
    if (draft.name.trim().length > 64) {
      setTab('basic');
      toast.error('名称不能超过 64 个字符');
      return false;
    }
    if (promptLength === 0) {
      setTab('basic');
      toast.error('系统提示词不能为空', { description: '专家需要一段角色与语气约束。' });
      return false;
    }
    if (promptLength > PROMPT_MAX) {
      setTab('basic');
      toast.error(`提示词超出 ${PROMPT_MAX} 字上限`, { description: '请删减后再保存。' });
      return false;
    }
    return true;
  }

  function commandFor(action: 'save' | 'publish'): ExpertCommand {
    const nextStatus: ExpertCommand['status'] =
      action === 'publish'
        ? 'ACTIVE'
        : expert?.status === 'ACTIVE' || expert?.status === 'DISABLED'
          ? expert.status
          : 'DRAFT';
    return {
      name: draft.name.trim(),
      description: draft.description.trim(),
      avatarUrl: draft.avatarUrl.trim(),
      welcomeMessage: draft.welcomeMessage.trim(),
      systemPrompt: draft.systemPrompt,
      status: nextStatus,
    };
  }

  /** 用保存响应 + 绑定接口返回的权威 ID 重建详情，避免为了一次保存再打三次读接口。 */
  function detailFrom(dto: ExpertAdminDto, kbIds: string[], grantIds: string[]): AdminExpertDetail {
    const userById = new Map(users.map((user) => [user.userId, user]));
    return toAdminExpert(
      { ...dto, kbIds },
      { bases, grants: grantIds.map((id) => userById.get(id) ?? placeholderUser(id)) },
    );
  }

  async function persist(action: 'save' | 'publish') {
    if (busy || !validate()) return;
    setBusy(true);
    try {
      const command = commandFor(action);
      // 编辑时 PATCH 已有专家；新建模式若上一次 create 已成功（例如绑定失败后重试），
      // expert 已经就位，也走 update，避免重复创建。
      const saved = expert
        ? await updateExpert(expert.expertId, command)
        : await createExpert(command);

      const results = await Promise.allSettled([
        replaceExpertKnowledgeBases(
          saved.expertId,
          draft.knowledgeBases.map((binding) => binding.kbId),
        ),
        replaceExpertGrants(
          saved.expertId,
          draft.grants.map((grant) => grant.userId),
        ),
      ]);

      // 绑定失败时，expert 用服务端的原绑定重建；草稿保留用户刚选的绑定，便于在本页重试。
      const kbIds =
        results[0].status === 'fulfilled'
          ? results[0].value
          : expert?.knowledgeBases.map((binding) => binding.kbId) ?? [];
      const grantIds =
        results[1].status === 'fulfilled'
          ? results[1].value
          : expert?.grants.map((grant) => grant.userId) ?? [];

      const failedBindings = [
        results[0].status === 'rejected' ? '知识库绑定' : null,
        results[1].status === 'rejected' ? '用户授权' : null,
      ].filter((item): item is string => Boolean(item));

      const detail = detailFrom(saved, kbIds, grantIds);
      setExpert(detail);
      if (failedBindings.length > 0) {
        // 基线用服务端真值：保留的草稿差异会被标记为 dirty，避免误以为已经保存。
        setBaseline(draftFrom(detail));
      } else {
        const nextDraft = draftFrom(detail);
        setDraft(nextDraft);
        setBaseline(nextDraft);
      }

      if (failedBindings.length > 0) {
        toast.warning(mode === 'new' ? '专家已创建，但部分绑定保存失败' : '专家已保存，但部分绑定保存失败', {
          description: failedBindings.join('、') + '未保存成功，请在本页重试。',
        });
      } else if (action === 'publish') {
        const count = detail.grants.length;
        toast.success('已发布「' + detail.name + '」', {
          description:
            count > 0
              ? '发布后，' + count + ' 位已授权用户可以在问答页选择它。'
              : '还没有被授权用户，发布后暂时无人可见。',
        });
      } else {
        toast.success(mode === 'new' ? '已创建专家草稿' : '已保存专家配置');
      }

      if (mode === 'new') {
        router.replace('/admin/experts/' + detail.expertId + '?tab=' + tab, { scroll: false });
      }
    } catch (error) {
      toast.error(mode === 'new' ? '创建专家失败' : '保存专家失败', {
        description: apiErrorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function disableExpert() {
    if (busy || !expert) return;
    setBusy(true);
    try {
      // 停用只改状态：使用服务端已保存的六字段，不隐式提交页面上未保存的编辑。
      const saved = await updateExpert(expert.expertId, {
        name: expert.name,
        description: expert.description ?? '',
        avatarUrl: expert.avatarUrl ?? '',
        welcomeMessage: expert.welcomeMessage ?? '',
        systemPrompt: expert.systemPrompt,
        status: 'DISABLED',
      });
      const detail = detailFrom(
        saved,
        expert.knowledgeBases.map((binding) => binding.kbId),
        expert.grants.map((grant) => grant.userId),
      );
      setExpert(detail);
      const nextDraft = draftFrom(detail);
      setDraft(nextDraft);
      setBaseline(nextDraft);
      setDisableOpen(false);
      toast.success('已停用专家', { description: '授权关系保留，重新发布即可恢复。' });
    } catch (error) {
      toast.error('停用失败', { description: apiErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function deleteExpert() {
    if (busy || !expert) return;
    setBusy(true);
    try {
      await deleteExpertRequest(expert.expertId);
      setDeleteOpen(false);
      toast.success('已删除专家', { description: '历史会话中的专家名称快照仍会保留。' });
      router.replace('/admin/experts');
    } catch (error) {
      toast.error('删除失败', { description: apiErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        <PageHeader title="专家不存在" description="该专家可能已被删除，或链接已失效。" backHref="/admin/experts" backLabel="返回专家模型" />
        <EmptyState
          title="找不到这个专家"
          description="返回列表重新选择一个仍然存在的专家。"
          action={
            <Button asChild>
              <Link href="/admin/experts">返回专家模型</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Skeleton className="h-[560px] w-full" />
          <Skeleton className="hidden h-80 w-full lg:block" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={mode === 'new' ? '新建专家' : '专家详情'}
          description="加载专家数据失败。"
          backHref="/admin/experts"
          backLabel="返回专家模型"
        />
        <EmptyState
          title="数据加载失败"
          description={loadError}
          action={<Button onClick={() => setReloadToken((value) => value + 1)}>重新加载</Button>}
        />
      </div>
    );
  }

  const meta = STATUS_META[status];

  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      <PageHeader
        title={mode === 'new' ? '新建专家' : draft.name || '未命名专家'}
        description="专家 = 提示词 + 知识库 + 技能 + MCP + 授权用户。发布后被授权用户可在问答页选择。"
        backHref="/admin/experts"
        backLabel="返回专家模型"
        actions={
          <>
            <StatusBadge tone={meta.tone} label={meta.label} />
            {expert && (
              <span className="hidden font-mono text-[11px] tabular-nums text-muted-foreground sm:inline">
                {formatDateTime(expert.updatedAt)}
              </span>
            )}
            {mode === 'edit' && expert && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground md:h-8 md:w-8" aria-label="更多专家操作">
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {expert.status === 'ACTIVE' && (
                    <DropdownMenuItem onSelect={() => setDisableOpen(true)}>
                      <Power className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                      停用专家
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link href="/admin/experts">返回专家列表</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                    删除专家
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      <details className="surface-raised rounded-xl border border-border bg-card lg:hidden">
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
          <span className="flex items-center gap-2">
            {blockingCount > 0 || warningCount > 0 ? (
              <AlertTriangle
                className={cn('h-4 w-4', blockingCount > 0 ? 'text-destructive' : 'text-warning')}
                aria-hidden="true"
              />
            ) : (
              <Check className="h-4 w-4 text-success" aria-hidden="true" />
            )}
            发布检查
          </span>
          <span
            className={cn(
              'font-mono text-[11px] tabular-nums',
              blockingCount > 0 ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {blockingCount > 0
              ? `${blockingCount} 项阻塞`
              : warningCount > 0
                ? `${warningCount} 项提醒`
                : '可发布'}
          </span>
        </summary>
        <div className="border-t border-border/60 p-3">
          <ExpertPublishChecklist
            status={status}
            name={draft.name}
            promptLength={promptLength}
            knowledgeBaseCount={draft.knowledgeBases.length}
            grantCount={draft.grants.length}
            promptDirty={promptDirty}
            busy={busy}
            onSave={() => persist('save')}
            onPublish={() => persist('publish')}
            compact
          />
        </div>
      </details>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-0 md:h-9">
              {[
                { value: 'basic', label: '基本信息' },
                { value: 'knowledge', label: '知识库' },
                { value: 'grants', label: '用户授权' },
                { value: 'resources', label: '技能与 MCP' },
              ].map((item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="h-11 shrink-0 rounded-md px-3.5 text-xs md:h-8 md:px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
                >
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="basic" className="mt-4 space-y-6">
              <section className="surface-raised rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby="expert-basic-heading">
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12 shrink-0">
                    {draft.avatarUrl.trim() && <AvatarImage src={draft.avatarUrl.trim()} alt="" />}
                    <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                      {initialOf(draft.name || '专')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <h3 id="expert-basic-heading" className="text-sm font-semibold">基本信息</h3>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      头像与欢迎语会出现在问答页的专家选择器中。
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="expert-name">
                      名称 <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="expert-name"
                      value={draft.name}
                      onChange={(event) => patch({ name: event.target.value })}
                      maxLength={64}
                      placeholder="例如：法务专家"
                      aria-invalid={nameInvalid}
                      aria-describedby={nameInvalid ? 'expert-name-error' : undefined}
                    />
                    {nameInvalid ? (
                      <p id="expert-name-error" className="text-[11px] text-destructive" role="alert">
                        名称不能为空。
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">最多 64 个字符，建议使用用户能一眼理解的岗位名。</p>
                    )}
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="expert-description">描述</Label>
                    <Input
                      id="expert-description"
                      value={draft.description}
                      onChange={(event) => patch({ description: event.target.value })}
                      maxLength={512}
                      placeholder="例如：合同、合规与劳动争议"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="expert-avatar">头像 URL</Label>
                    <Input
                      id="expert-avatar"
                      value={draft.avatarUrl}
                      onChange={(event) => patch({ avatarUrl: event.target.value })}
                      placeholder="https://…（留空则使用姓名首字）"
                      inputMode="url"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="expert-welcome">欢迎语</Label>
                    <Textarea
                      id="expert-welcome"
                      value={draft.welcomeMessage}
                      onChange={(event) => patch({ welcomeMessage: event.target.value })}
                      maxLength={512}
                      rows={2}
                      placeholder="例如：你好，我是法务专家。可以帮你审合同条款、判断劳动用工风险。"
                      className="resize-y"
                    />
                  </div>
                </div>
              </section>

              <section className="surface-raised rounded-xl border border-border bg-card p-4 sm:p-5">
                <ExpertPromptEditor
                  value={draft.systemPrompt}
                  onChange={(next) => patch({ systemPrompt: next })}
                />
                <p className="mt-3 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
                  提示词只作为角色与语气约束，不能覆盖安全、权限与引用规则。
                </p>
              </section>
            </TabsContent>

            <TabsContent value="knowledge" className="mt-4">
              <section className="surface-raised rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby="expert-knowledge-heading">
                <h3 id="expert-knowledge-heading" className="text-sm font-semibold">关联知识库</h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  按列表顺序检索；只允许关联启用中的知识库，允许不关联。
                </p>
                <div className="mt-4">
                  <ExpertKnowledgePicker
                    bases={bases}
                    value={draft.knowledgeBases}
                    onChange={(next) => patch({ knowledgeBases: next })}
                  />
                </div>
              </section>
            </TabsContent>

            <TabsContent value="grants" className="mt-4">
              <section className="surface-raised rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby="expert-grants-heading">
                <h3 id="expert-grants-heading" className="text-sm font-semibold">用户授权</h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  只有被授权的用户能在问答页看到并选择该专家。保存后生效。
                </p>
                <div className="mt-4">
                  <UserGrantPicker
                    users={users}
                    value={draft.grants}
                    onChange={(next) => patch({ grants: next })}
                    emptyHint="还没有授权给任何用户；发布后暂时无人可见"
                  />
                </div>
              </section>
            </TabsContent>

            <TabsContent value="resources" className="mt-4 space-y-4">
              <CapabilityPlaceholder
                enabled={false}
                title="技能"
                description="技能绑定尚未开放，当前专家只能使用知识库与提示词。"
                enabledDescription="能力已开放，技能绑定编辑器待接入。"
                icon={<Wrench className="h-4 w-4" aria-hidden="true" />}
                href="/admin/skills"
                linkLabel="前往技能管理"
              />
              <CapabilityPlaceholder
                enabled={false}
                title="MCP 资源"
                description="MCP 资源接入尚未开放。"
                enabledDescription="能力已开放，MCP 绑定编辑器待接入。"
                icon={<PlugZap className="h-4 w-4" aria-hidden="true" />}
              />
            </TabsContent>
          </Tabs>
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-4">
            <ExpertPublishChecklist
              status={status}
              name={draft.name}
              promptLength={promptLength}
              knowledgeBaseCount={draft.knowledgeBases.length}
              grantCount={draft.grants.length}
              promptDirty={promptDirty}
              busy={busy}
              onSave={() => persist('save')}
              onPublish={() => persist('publish')}
            />

          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 flex items-center gap-2 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{draft.name || '未命名专家'}</p>
          <p
            className={cn(
              'text-[11px]',
              footerBlockers.length > 0 || promptInvalid ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {promptLength > PROMPT_MAX
              ? `提示词超过 ${PROMPT_MAX} 字`
              : footerBlockers.length > 0
                ? `${footerBlockers.join('、')}未填写`
                : `${promptLength} 字 · ${draft.knowledgeBases.length} 个知识库`}
          </p>
        </div>
        <Button variant="outline" className="h-11" onClick={() => persist('save')} disabled={busy || promptInvalid || !draft.name.trim()}>
          保存草稿
        </Button>
        <Button className="h-11" onClick={() => persist('publish')} disabled={busy || promptInvalid || !draft.name.trim()}>
          发布
        </Button>
      </div>

      <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>停用「{draft.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              停用后，该专家不再出现在问答页；已授权关系保留，重新发布即可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={disableExpert}>停用</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{draft.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后不可恢复；历史会话中的专家名称快照仍会保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteExpert}
            >
              删除专家
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CapabilityPlaceholder({
  enabled,
  title,
  description,
  enabledDescription,
  icon,
  href,
  linkLabel,
}: {
  enabled: boolean;
  title: string;
  description: string;
  enabledDescription: string;
  icon: React.ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <section className="rounded-lg border border-dashed border-border px-4 py-5" aria-label={`${title}能力状态`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
        {title}
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
          {enabled ? '待接入' : '未开放'}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {enabled ? enabledDescription : description}
      </p>
      {!enabled && href && linkLabel && (
        <Link
          href={href}
          className="ui-interactive ui-focus-ring mt-2 inline-flex items-center gap-1 rounded-sm text-[11px] text-primary underline-offset-2 hover:underline"
        >
          {linkLabel}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}