'use client';

import { AlertTriangle, Check, Circle, Loader2, Rocket, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PROMPT_MAX } from '@/components/admin/experts/ExpertPromptEditor';
import { cn } from '@/lib/utils';
import type { ExpertStatus } from '@/types/knowledge';

type CheckState = 'pass' | 'warning' | 'error';

function CheckRow({
  state,
  children,
}: {
  state: CheckState;
  children: React.ReactNode;
}) {
  const Icon = state === 'pass' ? Check : state === 'warning' ? AlertTriangle : Circle;
  return (
    <li className="flex items-start gap-2 text-[12px] leading-5">
      <Icon
        className={cn(
          'mt-0.5 h-3.5 w-3.5 shrink-0',
          state === 'pass' && 'text-success',
          state === 'warning' && 'text-warning',
          state === 'error' && 'text-destructive',
        )}
        aria-hidden="true"
      />
      <span className={cn(state === 'error' && 'text-destructive')}>{children}</span>
    </li>
  );
}

/**
 * 发布检查侧栏：像提交前看 diff 一样，集中展示阻塞项与警告项。
 * 设计依据：设计文档 §9.2 / §9.3。
 */
export function ExpertPublishChecklist({
  status,
  name,
  promptLength,
  knowledgeBaseCount,
  grantCount,
  promptDirty,
  busy = false,
  onSave,
  onPublish,
  className,
  compact = false,
}: {
  status: ExpertStatus;
  name: string;
  promptLength: number;
  knowledgeBaseCount: number;
  grantCount: number;
  promptDirty: boolean;
  busy?: boolean;
  onSave: () => void;
  onPublish: () => void;
  className?: string;
  /** 嵌在移动端「发布检查」折叠面板里时用：去掉外层卡片外壳与重复标题。 */
  compact?: boolean;
}) {
  const nameOk = name.trim().length > 0;
  const promptOk = promptLength > 0 && promptLength <= PROMPT_MAX;
  const publishLabel = status === 'ACTIVE' ? (promptDirty ? '保存并发布更新' : '保存') : status === 'DISABLED' ? '重新发布' : '发布专家';

  return (
    <aside
      className={cn('admin-panel rounded-xl p-4', compact && 'rounded-none border-0 bg-transparent p-0 shadow-none', className)}
      aria-labelledby="publish-checklist-heading"
    >
      {/* compact 时折叠面板的 summary 已经写了「发布检查」，标题只留给读屏。 */}
      <h3 id="publish-checklist-heading" className={cn('text-sm font-semibold', compact && 'sr-only')}>
        发布检查
      </h3>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
        检查项不阻塞保存；发布只要求名称与提示词合法。
      </p>

      <ul className="mt-4 space-y-2.5">
        <CheckRow state={nameOk ? 'pass' : 'error'}>
          {nameOk ? '名称已填写' : '名称不能为空'}
        </CheckRow>
        <CheckRow state={promptOk ? 'pass' : 'error'}>
          提示词 {promptLength.toLocaleString('zh-CN')} / {PROMPT_MAX.toLocaleString('zh-CN')} 字
          {promptLength > PROMPT_MAX && '（超出上限）'}
          {promptLength === 0 && '（不能为空）'}
        </CheckRow>
        <CheckRow state={knowledgeBaseCount > 0 ? 'pass' : 'warning'}>
          {knowledgeBaseCount > 0
            ? `已关联 ${knowledgeBaseCount} 个知识库`
            : '未关联知识库：该专家只能凭提示词回答'}
        </CheckRow>
        <CheckRow state={grantCount > 0 ? 'pass' : 'warning'}>
          {grantCount > 0 ? `已授权 ${grantCount} 位用户` : '还没有被授权用户，发布后暂时无人可见'}
        </CheckRow>
        {promptDirty && (
          <CheckRow state="warning">提示词已修改，发布后才会生效</CheckRow>
        )}
      </ul>

      <div className="mt-4 border-t border-line-1 pt-3">
        <p className="text-[11px] font-medium">发布后</p>
        <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
          <li>· 被授权用户可以在问答页选择该专家</li>
          <li>· 其绑定的知识库按顺序参与检索</li>
          <li>· 已授权关系与历史会话快照不受影响</li>
        </ul>
      </div>

      {/* compact 时动作交给移动端 sticky 底栏，避免同一屏出现两套「保存 / 发布」。 */}
      <div className={cn('mt-4 space-y-2', compact && 'hidden')}>
        <Button className="w-full" onClick={onPublish} disabled={busy || !nameOk || !promptOk}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Rocket className="h-4 w-4" aria-hidden="true" />}
          {publishLabel}
        </Button>
        <Button variant="outline" className="w-full" onClick={onSave} disabled={busy || !nameOk || !promptOk}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          保存草稿
        </Button>
      </div>
    </aside>
  );
}