'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Clock3,
  Copy,
  FileText,
  Layers,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/admin/EmptyState';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusBadge, type StatusTone } from '@/components/admin/StatusBadge';
import { UserGrantPicker } from '@/components/admin/UserGrantPicker';
import { DocumentSheet } from '@/components/knowledge/DocumentSheet';
import { IngestPipeline } from '@/components/knowledge/IngestPipeline';
import { UploadDocumentDialog } from '@/components/knowledge/UploadDocumentDialog';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  apiErrorMessage,
  deleteDocument,
  deleteKnowledgeBase,
  fetchKnowledgeBaseDetail,
  getJob,
  replaceKnowledgeBaseGrants,
  retryDocument,
  updateKnowledgeBase,
  uploadDocument,
  type JobDto,
  type KnowledgeBaseDetail,
} from '@/lib/knowledge-api';
import {
  STAGE_LABEL,
  STAGE_SHORT_LABEL,
  STRATEGY_LABEL,
  formatBytes,
  formatCount,
  formatDateTime,
} from '@/lib/knowledge-format';
import { cn } from '@/lib/utils';
import type {
  ChunkStrategy,
  DocumentStatus,
  GrantUser,
  KnowledgeBaseStatus,
  KnowledgeDocumentSummary,
} from '@/types/knowledge';

const BASE_STATUS: Record<KnowledgeBaseStatus, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: '启用', tone: 'success' },
  DISABLED: { label: '停用', tone: 'muted' },
  DELETED: { label: '已删除', tone: 'muted' },
};

const DOC_STATUS: Record<DocumentStatus, { label: string; tone: StatusTone }> = {
  READY: { label: '可检索', tone: 'success' },
  PROCESSING: { label: '入库中', tone: 'primary' },
  UPLOADED: { label: '待入库', tone: 'muted' },
  FAILED: { label: '入库失败', tone: 'destructive' },
};

const STRATEGY_OPTIONS: { value: ChunkStrategy; label: string; hint: string }[] = [
  { value: 'AUTO', label: '自动', hint: '识别到目录按层级切，否则固定长度' },
  { value: 'TOC', label: '目录层级', hint: '严格按标题层级切父子块' },
  { value: 'FIXED', label: '固定长度', hint: '不看目录，按约 600 字切块' },
];

const POLL_INTERVAL = 3000;

/** 任务处于未终态时才需要轮询；终态后以详情接口返回的结果为准。 */
function isJobActive(job: JobDto): boolean {
  return job.status === 'PENDING' || job.status === 'RUNNING';
}

/**
 * 把运行中的任务进度叠到文档行上。
 *
 * 详情接口只给文档 + 版本状态，不给实时阶段；任务接口才有 stage / progress，
 * 所以列表在轮询期间以任务为准，任务结束后再回落到详情接口的真实结果。
 */
function mergeJobIntoDocument(
  doc: KnowledgeDocumentSummary,
  job: JobDto | undefined,
): KnowledgeDocumentSummary {
  if (!job || !isJobActive(job)) return doc;
  return {
    ...doc,
    status: job.status === 'PENDING' ? 'UPLOADED' : 'PROCESSING',
    stage: job.stage,
    progress: job.progress,
    failureCode: null,
    failureMessage: null,
    updatedAt: Math.max(doc.updatedAt, job.updatedAt),
  };
}
export default function KnowledgeDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <KnowledgeDetail />
    </Suspense>
  );
}

function KnowledgeDetail() {
  const params = useParams<{ kbId: string }>();
  const kbId = params?.kbId ?? '';
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') ?? 'documents';
  const docParam = searchParams.get('doc');

  const [detail, setDetail] = useState<KnowledgeBaseDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replaceDocId, setReplaceDocId] = useState<string | null>(null);
  const [deleteDocTarget, setDeleteDocTarget] = useState<KnowledgeDocumentSummary | null>(null);
  const [deleteBaseOpen, setDeleteBaseOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingGrants, setSavingGrants] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState(false);
  const [deletingBase, setDeletingBase] = useState(false);

  const [settingsName, setSettingsName] = useState('');
  const [settingsDescription, setSettingsDescription] = useState('');
  const [settingsStrategy, setSettingsStrategy] = useState<ChunkStrategy>('AUTO');
  const [grantsDraft, setGrantsDraft] = useState<GrantUser[]>([]);

  /** 正在轮询的任务：jobId 列表 + 已拿到的最新任务快照。 */
  const [pollJobIds, setPollJobIds] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Record<string, JobDto>>({});

  /**
   * 拉详情。silent 用于任务终态后的后台刷新：不清空页面、不覆盖用户正在编辑的表单。
   */
  const load = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        setLoadError(null);
        setDetail(null);
      }
      try {
        const data = await fetchKnowledgeBaseDetail(kbId);
        if (!data) throw new Error('知识库不存在或已被删除');
        setDetail(data);
        if (!options.silent) {
          setSettingsName(data.base.name);
          setSettingsDescription(data.base.description ?? '');
          setSettingsStrategy(data.base.strategy);
          setGrantsDraft(data.users);
        }
        return data;
      } catch (error) {
        if (!options.silent) setLoadError(apiErrorMessage(error));
        return null;
      }
    },
    [kbId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const trackJob = useCallback((job: JobDto) => {
    setJobs((previous) => ({ ...previous, [job.jobId]: job }));
    if (!isJobActive(job)) return;
    setPollJobIds((previous) => (previous.includes(job.jobId) ? previous : [...previous, job.jobId]));
  }, []);

  // 每 3 秒轮询一次未终态任务；终态时移出轮询集合并刷新详情。
  useEffect(() => {
    if (pollJobIds.length === 0) return;
    let cancelled = false;

    async function poll() {
      const results = await Promise.all(pollJobIds.map((jobId) => getJob(jobId).catch(() => null)));
      if (cancelled) return;

      const snapshots: Record<string, JobDto> = {};
      const finished: string[] = [];
      for (const job of results) {
        if (!job) continue;
        snapshots[job.jobId] = job;
        if (job.status === 'SUCCEEDED' || job.status === 'FAILED') finished.push(job.jobId);
      }
      if (Object.keys(snapshots).length > 0) {
        setJobs((previous) => ({ ...previous, ...snapshots }));
      }
      if (finished.length > 0) {
        setPollJobIds((previous) => previous.filter((id) => !finished.includes(id)));
        // 任务终态后重新拉一次，拿到真实的切片数 / 失败原因。
        void load({ silent: true });
      }
    }

    const timer = window.setInterval(() => void poll(), POLL_INTERVAL);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pollJobIds, load]);

  const jobByDocumentId = useMemo(() => {
    const map: Record<string, JobDto> = {};
    for (const job of Object.values(jobs)) {
      const current = map[job.documentId];
      if (!current || job.createdAt >= current.createdAt) map[job.documentId] = job;
    }
    return map;
  }, [jobs]);

  const documents = useMemo(() => {
    if (!detail) return [];
    return detail.documents
      .map((doc) => mergeJobIntoDocument(doc, jobByDocumentId[doc.documentId]))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [detail, jobByDocumentId]);

  const base = detail?.base ?? null;
  const activeJobs = documents.filter(
    (doc) => doc.status === 'UPLOADED' || doc.status === 'PROCESSING',
  );
  const lastIngestAt = documents.reduce((max, doc) => Math.max(max, doc.updatedAt), 0);
  const docDetail = documents.find((doc) => doc.documentId === docParam) ?? null;
  const versionsForDoc = docDetail
    ? (detail?.versions.filter((item) => item.documentId === docDetail.documentId) ?? [])
    : [];

  function applyQuery(mutate: (query: URLSearchParams) => void) {
    const query = new URLSearchParams(searchParams.toString());
    mutate(query);
    const suffix = query.toString();
    router.replace(`/admin/knowledge/${kbId}${suffix ? `?${suffix}` : ''}`, { scroll: false });
  }

  function setTab(next: string) {
    applyQuery((query) => query.set('tab', next));
  }

  function openDoc(documentId: string | null) {
    applyQuery((query) => {
      if (documentId) query.set('doc', documentId);
      else query.delete('doc');
    });
  }
  async function handleUpload(input: {
    file: File;
    strategy: ChunkStrategy;
    onProgress: (percent: number) => void;
  }) {
    const result = await uploadDocument({
      kbId,
      file: input.file,
      strategy: input.strategy,
      replaceDocumentId: replaceDocId,
      onProgress: input.onProgress,
    });

    if (result.duplicate) {
      // 同内容文件后端直接返回已存在的文档，不会创建任务，轮询 jobId 会一直 404。
      toast.info('该文件已存在', {
        description: `${input.file.name}：已复用原有文档，未重复入库`,
      });
    } else {
      const job = await getJob(result.jobId).catch(() => null);
      if (job) trackJob(job);
      else setPollJobIds((previous) => [...previous, result.jobId]);
      toast.success(replaceDocId ? '已提交覆盖上传' : '已提交入库', {
        description: input.file.name,
      });
    }

    setReplaceDocId(null);
    await load({ silent: true });
    openDoc(result.documentId);
  }

  async function retryDoc(doc: KnowledgeDocumentSummary) {
    try {
      const job = await retryDocument(doc.documentId);
      trackJob(job);
      toast.success('已重新提交入库', { description: doc.fileName });
      await load({ silent: true });
    } catch (error) {
      toast.error('重新入库失败', { description: apiErrorMessage(error) });
    }
  }

  async function deleteDoc(doc: KnowledgeDocumentSummary) {
    setDeletingDoc(true);
    try {
      await deleteDocument(doc.documentId);
      if (docParam === doc.documentId) openDoc(null);
      await load({ silent: true });
      setDeleteDocTarget(null);
      toast.success('已删除文档', { description: `${doc.fileName}：历史引用仍保留快照` });
    } catch (error) {
      toast.error('删除文档失败', { description: apiErrorMessage(error) });
    } finally {
      setDeletingDoc(false);
    }
  }

  async function saveSettings() {
    const name = settingsName.trim();
    if (!name) {
      toast.error('知识库名称不能为空');
      return;
    }
    if (name.length > 100) {
      toast.error('知识库名称不能超过 100 个字符');
      return;
    }
    if (settingsDescription.trim().length > 500) {
      toast.error('描述不能超过 500 个字符');
      return;
    }

    setSavingSettings(true);
    try {
      // 不传 configJson：PATCH 是部分更新，传 null 会把已有配置清空。
      await updateKnowledgeBase(kbId, {
        name,
        description: settingsDescription.trim() || null,
        chunkStrategy: settingsStrategy,
      });
      await load({ silent: true });
      toast.success('已保存设置');
    } catch (error) {
      toast.error('保存设置失败', { description: apiErrorMessage(error) });
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveGrants() {
    setSavingGrants(true);
    try {
      const userIds = await replaceKnowledgeBaseGrants(
        kbId,
        grantsDraft.map((user) => user.userId),
      );
      const known = new Set(userIds);
      setGrantsDraft((previous) => previous.filter((user) => known.has(user.userId)));
      await load({ silent: true });
      toast.success('已保存授权', { description: `${userIds.length} 位用户可检索该知识库` });
    } catch (error) {
      toast.error('保存授权失败', { description: apiErrorMessage(error) });
    } finally {
      setSavingGrants(false);
    }
  }

  async function deleteBase() {
    if (!base) return;
    setDeletingBase(true);
    try {
      await deleteKnowledgeBase(kbId);
      setDeleteBaseOpen(false);
      toast.success('已删除知识库', { description: base.name });
      router.push('/admin/knowledge');
    } catch (error) {
      toast.error('删除知识库失败', { description: apiErrorMessage(error) });
    } finally {
      setDeletingBase(false);
    }
  }

  const grantsDirty = useMemo(() => {
    const current = (detail?.users ?? []).map((item) => item.userId).sort().join(',');
    const draft = grantsDraft.map((item) => item.userId).sort().join(',');
    return current !== draft;
  }, [detail, grantsDraft]);

  if (!detail || !base) {
    if (loadError) {
      return (
        <div className="space-y-4">
          <PageHeader backHref="/admin/knowledge" title="知识库" description="加载失败" />
          <div
            role="alert"
            className="surface-raised flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              重试
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const statusMeta = BASE_STATUS[base.status];
  const embedding = detail.embedding;
  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/admin/knowledge"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {base.name}
            <StatusBadge tone={statusMeta.tone} label={statusMeta.label} />
          </span>
        }
        description={base.description ?? '未填写描述'}
        actions={
          <>
            <Button
              size="sm"
              className="h-11 md:h-9"
              onClick={() => setUploadOpen(true)}
              disabled={base.status === 'DELETED'}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              上传文档
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-11 w-11 md:h-8 md:w-8" aria-label="知识库更多操作">
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onSelect={() => {
                    void navigator.clipboard?.writeText(base.kbId).then(
                      () => toast.success('已复制知识库 ID', { description: base.kbId }),
                      () => toast.error('复制失败，请手动选择'),
                    );
                  }}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                  复制知识库 ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => {
                    setDeleteConfirmName('');
                    setDeleteBaseOpen(true);
                  }}
                >
                  删除知识库
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="admin-stat-grid">
        {[
          {
            label: '文档',
            value: formatCount(base.documentCount),
            unit: '份',
            badge: '当前版本',
            tone: 'default',
            icon: <FileText className="h-4 w-4" aria-hidden="true" />,
          },
          {
            label: '切片',
            value: base.chunkCount === null ? '—' : formatCount(base.chunkCount),
            unit: '块',
            badge: '可召回',
            tone: 'amber',
            icon: <Layers className="h-4 w-4" aria-hidden="true" />,
          },
          {
            label: '授权用户',
            value: formatCount(base.grantCount),
            unit: '人',
            badge: '独立授权',
            tone: 'green',
            icon: <Users className="h-4 w-4" aria-hidden="true" />,
          },
          {
            label: '最近入库',
            value: lastIngestAt ? formatDateTime(lastIngestAt) : '—',
            unit: '',
            badge: '时间',
            tone: 'cyan',
            icon: <Clock3 className="h-4 w-4" aria-hidden="true" />,
          },
        ].map((item) => (
          <div key={item.label} className="admin-stat-card admin-stat-card--compact">
            <div className="admin-stat-top">
              <span className="admin-stat-icon" data-tone={item.tone} aria-hidden="true">
                {item.icon}
              </span>
              <span className="admin-stat-delta">{item.badge}</span>
            </div>
            <strong className="admin-stat-value">
              {item.value}
              {item.unit && <span className="ml-1 text-[11px] font-normal text-fg-4">{item.unit}</span>}
            </strong>
            <span className="admin-stat-label">{item.label}</span>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="admin-panel">
        <div className="admin-panel-bar">
          <div className="min-w-0">
            <div className="admin-panel-title">文档与配置</div>
            <div className="admin-panel-subtitle">入库进度、授权范围与切片策略集中在这里维护</div>
          </div>
          <TabsList className="admin-tab-strip h-auto justify-start">
          {[
            { value: 'documents', label: '文档' },
            { value: 'grants', label: '授权' },
            { value: 'settings', label: '设置' },
          ].map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="h-11 rounded-[7px] px-3.5 text-xs text-fg-3 md:h-8 md:px-3 data-[state=active]:bg-accent-wash data-[state=active]:text-accent-base data-[state=active]:shadow-none"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="admin-tab-body space-y-4">
        <TabsContent value="documents" className="mt-0 space-y-4">
          {activeJobs.length > 0 && (
            <div className="admin-subpanel border-primary/20 px-3.5 py-3">
              <p className="mb-2 text-[11px] text-muted-foreground">
                有 {activeJobs.length} 份文档正在入库，状态每 3 秒刷新一次
              </p>
              <ul className="space-y-2">
                {activeJobs.slice(0, 3).map((doc) => (
                  <li key={doc.documentId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="max-w-[240px] min-w-0 truncate text-xs">{doc.fileName}</span>
                    <span className="text-[11px] text-primary">
                      {doc.stage ? STAGE_SHORT_LABEL[doc.stage] : '排队'}
                    </span>
                    <IngestPipeline
                      stage={doc.stage}
                      ariaLabel={doc.fileName}
                      progress={doc.progress}
                      variant="compact"
                      className="min-w-[160px] flex-1"
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {documents.length === 0 ? (
            <EmptyState
              title="还没有文档"
              description="上传第一份 .docx，系统会自动解析目录并生成父子切片。"
              action={
                <Button size="sm" className="h-11 md:h-9" onClick={() => setUploadOpen(true)}>
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  上传第一份 .docx
                </Button>
              }
            />
          ) : (
            <div className="admin-subpanel">
              <div className="admin-table-head hidden grid-cols-[minmax(0,1fr)_88px_72px_92px_128px] md:grid">
                <span>文档</span>
                <span className="text-center">状态</span>
                <span className="text-right">切片</span>
                <span className="text-right">更新时间</span>
                <span className="text-right">操作</span>
              </div>
              <ul className="divide-y divide-line-1">
                {documents.map((doc) => {
                  const meta = DOC_STATUS[doc.status];
                  const isActive = doc.status === 'PROCESSING' || doc.status === 'UPLOADED';
                  return (
                    <li
                      key={doc.documentId}
                      className="ui-focus-row relative grid gap-2 px-3 py-3 hover:bg-surface-2/50 md:grid-cols-[minmax(0,1fr)_88px_72px_92px_128px] md:items-center md:gap-3"
                    >
                      <div className={cn('min-w-0', doc.status !== 'FAILED' && 'pr-12 md:pr-0')}>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openDoc(doc.documentId)}
                            data-row-link
                            className="ui-interactive ui-focus-ring max-w-full truncate text-left text-sm font-medium underline-offset-2 after:absolute after:inset-0 after:content-[''] hover:text-primary hover:underline"
                            title={doc.fileName}
                          >
                            {doc.fileName}
                          </button>
                          <span className="md:hidden">
                            <StatusBadge tone={meta.tone} label={meta.label} pulse={isActive} />
                          </span>
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="font-mono tabular-nums">v{doc.versionNo}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{formatBytes(doc.fileSize)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{STRATEGY_LABEL[doc.strategy ?? 'AUTO']}</span>
                          {doc.tocDetected && doc.headingLevels ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>识别 {doc.headingLevels} 级标题</span>
                            </>
                          ) : null}
                        </p>
                        {doc.status === 'FAILED' && (
                          <p className="mt-1 text-[11px] leading-relaxed text-destructive">
                            失败于 {doc.stage ? STAGE_LABEL[doc.stage] : '未知阶段'}（
                            {doc.failureCode ?? 'UNKNOWN'}）：{doc.failureMessage ?? '未返回失败原因'}
                          </p>
                        )}
                        {isActive && (
                          <div className="mt-1.5">
                            <IngestPipeline ariaLabel={doc.fileName} stage={doc.stage} progress={doc.progress} variant="compact" />
                          </div>
                        )}
                      </div>

                      <span className="hidden justify-center md:flex">
                        <StatusBadge tone={meta.tone} label={meta.label} pulse={isActive} />
                      </span>
                      <span className="hidden text-right font-mono text-xs tabular-nums md:block">
                        {doc.status === 'READY'
                          ? doc.chunkCount === null
                            ? '—'
                            : formatCount(doc.chunkCount)
                          : '—'}
                      </span>
                      <span className="hidden text-right font-mono text-[11px] tabular-nums text-muted-foreground md:block">
                        {formatDateTime(doc.updatedAt)}
                      </span>

                      <div
                        className={cn(
                          'flex items-center justify-end gap-1',
                          // 移动端只有失败行需要常驻按钮；其余状态把 ⋯ 收进标题行右上角，
                          // 否则每行都会多出一条只放一个图标的空行。
                          doc.status === 'FAILED' ? 'z-10' : 'absolute right-1 top-1 z-10 md:relative md:right-auto md:top-auto',
                        )}
                      >
                        {(doc.status === 'FAILED' || doc.status === 'READY') && (
                          <Button
                            // 只有失败行需要「被看见」；可检索行的重跑收成弱按钮，
                            // 否则一屏里 5 个描边按钮会把视觉焦点摊平。
                            variant={doc.status === 'READY' ? 'ghost' : 'outline'}
                            size="sm"
                            className={cn(
                              'h-11 shrink-0 px-2 text-[11px] md:h-7',
                              doc.status === 'FAILED'
                                ? 'border-primary/40 text-primary'
                                : 'hidden text-muted-foreground md:inline-flex',
                            )}
                            onClick={() => void retryDoc(doc)}
                            // 已可检索的文档没有「失败」可重试，它是主动重跑入库；
                            // 两个动作走同一条链路，但文案要能自解释。
                            title={
                              doc.status === 'READY'
                                ? '重新解析文档并重建切片'
                                : '按原文件重新提交入库'
                            }
                          >
                            <RefreshCw className="h-3 w-3" aria-hidden="true" />
                            {doc.status === 'READY' ? '重新入库' : '重试'}
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 shrink-0 text-muted-foreground md:h-7 md:w-7"
                              aria-label={`文档「${doc.fileName}」的更多操作`}
                            >
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onSelect={() => openDoc(doc.documentId)}>
                              查看切片
                            </DropdownMenuItem>
                            {doc.status === 'READY' && (
                              // 桌面端已有行内弱按钮，这里只服务移动端的折叠菜单，
                              // 避免同一行出现两个「重新入库」。
                              <DropdownMenuItem className="md:hidden" onSelect={() => void retryDoc(doc)}>
                                重新入库
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onSelect={() => {
                                setReplaceDocId(doc.documentId);
                                setUploadOpen(true);
                              }}
                            >
                              覆盖上传
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setDeleteDocTarget(doc)}
                            >
                              删除文档
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            覆盖上传会生成新版本；旧版本在切换为「当前召回」前，检索仍使用原版本。
          </p>
        </TabsContent>

        <TabsContent value="grants" className="mt-0 max-w-3xl space-y-4">
          <div className="admin-subpanel">
            <div className="admin-subpanel-head">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">授权用户</h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  授权用户才能检索该知识库；专家绑定的知识库仍会再按专家授权过滤一次。
                </p>
              </div>
              <StatusBadge tone="muted" label={`${grantsDraft.length} 人`} />
            </div>
            <div className="p-3.5">
              <UserGrantPicker users={detail.allUsers} value={grantsDraft} onChange={setGrantsDraft} />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-line-1 px-3.5 py-2.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={!grantsDirty || savingGrants}
                onClick={() => setGrantsDraft(detail.users)}
              >
                撤销更改
              </Button>
              <Button size="sm" onClick={() => void saveGrants()} disabled={!grantsDirty || savingGrants}>
                {savingGrants ? '保存中…' : '保存授权'}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-0 max-w-3xl space-y-4">
          <section className="admin-subpanel space-y-4 p-4 sm:p-5" aria-labelledby="kb-basic-heading">
            <h3 id="kb-basic-heading" className="text-sm font-medium">
              基本信息
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="kb-settings-name">名称</Label>
                <Input
                  id="kb-settings-name"
                  value={settingsName}
                  onChange={(event) => setSettingsName(event.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Embedding 模型</Label>
                <div className="surface-inset flex h-9 items-center rounded-md px-3 font-mono text-[11px] text-fg-3">
                  {embedding.modelName} · {embedding.dimension} 维
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kb-settings-description">描述</Label>
              <Textarea
                id="kb-settings-description"
                value={settingsDescription}
                onChange={(event) => setSettingsDescription(event.target.value)}
                rows={2}
                maxLength={500}
                placeholder="这批文档覆盖什么范围，什么时候会用到"
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-muted-foreground">切片策略</legend>
              <RadioGroup
                value={settingsStrategy}
                onValueChange={(value) => setSettingsStrategy(value as ChunkStrategy)}
                className="grid gap-2 sm:grid-cols-3"
              >
                {STRATEGY_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    htmlFor={`kb-strategy-${option.value}`}
                    className={cn(
                      'ui-interactive ui-focus-row cursor-pointer rounded-lg border border-line-1 p-2.5 hover:border-accent-line',
                      settingsStrategy === option.value && 'border-accent-line bg-accent-wash',
                    )}
                  >
                    <span className="flex items-center gap-2 text-xs font-medium">
                      <RadioGroupItem
                        id={`kb-strategy-${option.value}`}
                        value={option.value}
                        data-row-link
                        className="h-3.5 w-3.5"
                      />
                      {option.label}
                    </span>
                    <span className="mt-1 block pl-5 text-[11px] leading-relaxed text-muted-foreground">
                      {option.hint}
                    </span>
                  </label>
                ))}
              </RadioGroup>
              <p className="text-[11px] text-muted-foreground">
                修改策略只影响之后入库的版本；已就绪的切片不会自动重切。
              </p>
            </fieldset>

            <div className="flex justify-end">
              <Button size="sm" onClick={() => void saveSettings()} disabled={savingSettings}>
                {savingSettings ? '保存中…' : '保存设置'}
              </Button>
            </div>
          </section>

          <section className="admin-subpanel space-y-3 p-4 sm:p-5" aria-labelledby="kb-danger-heading">
            <h3 id="kb-danger-heading" className="text-sm font-medium">
              危险操作
            </h3>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2.5">
              <p className="text-[11px] text-destructive">删除不可恢复；历史引用仍保留快照。</p>
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setDeleteConfirmName('');
                  setDeleteBaseOpen(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                删除知识库
              </Button>
            </div>
          </section>
        </TabsContent>
        </div>
      </Tabs>

      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
          if (!open) setReplaceDocId(null);
        }}
        defaultStrategy={base.strategy}
        onUpload={handleUpload}
      />

      <DocumentSheet
        open={docDetail !== null}
        onOpenChange={(open) => {
          if (!open) openDoc(null);
        }}
        doc={docDetail}
        versions={versionsForDoc}
        onRetry={(doc) => {
          void retryDoc(doc);
          openDoc(null);
        }}
      />

      <AlertDialog open={deleteDocTarget !== null} onOpenChange={(open) => !open && setDeleteDocTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{deleteDocTarget?.fileName}」？</AlertDialogTitle>
            <AlertDialogDescription>
              文档及其所有版本将从检索中移除；历史回答里的引用仍保留当时的快照片段。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingDoc}
              onClick={(event) => {
                event.preventDefault();
                if (deleteDocTarget) void deleteDoc(deleteDocTarget);
              }}
            >
              {deletingDoc ? '删除中…' : '删除文档'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteBaseOpen}
        onOpenChange={(open) => {
          setDeleteBaseOpen(open);
          if (!open) setDeleteConfirmName('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除知识库「{base.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              输入知识库名称确认。删除后 {formatCount(base.documentCount)} 份文档不再参与检索，不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="delete-kb-confirm" className="sr-only">
              知识库名称
            </Label>
            <Input
              id="delete-kb-confirm"
              value={deleteConfirmName}
              onChange={(event) => setDeleteConfirmName(event.target.value)}
              placeholder={base.name}
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteConfirmName !== base.name || deletingBase}
              onClick={(event) => {
                event.preventDefault();
                void deleteBase();
              }}
            >
              {deletingBase ? '删除中…' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}