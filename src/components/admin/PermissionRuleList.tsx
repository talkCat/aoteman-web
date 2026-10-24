'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BEHAVIOR_LABELS,
  TOOL_CLASS_LABELS,
} from '@/lib/permission-labels';
import {
  deletePermissionRule,
  upsertPermissionRule,
} from '@/lib/permission';
import { cn } from '@/lib/utils';
import type {
  PermissionBehavior,
  PermissionCatalogItem,
  PermissionRule,
  PermissionToolClass,
} from '@/types/permission';

const TOOL_CLASS_ORDER: PermissionToolClass[] = [
  'READ',
  'WRITE',
  'EXECUTE',
  'DELETE',
  'INTERACT',
  'COORDINATION',
  'UNCLASSIFIED',
];

function BehaviorBadge({ behavior }: { behavior: PermissionBehavior }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 font-normal',
        behavior === 'deny'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-warning/30 bg-warning/10 text-warning',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          behavior === 'deny' ? 'bg-destructive' : 'bg-warning',
        )}
        aria-hidden="true"
      />
      {BEHAVIOR_LABELS[behavior]}
    </Badge>
  );
}

/**
 * 我的规则：只能把工具收紧为「每次询问 / 拒绝」，不提供 allow。
 * 保存 / 删除后只刷新 rules，目录由父级保留。
 */
export function PermissionRuleList({
  catalog,
  rules,
  loading,
  refreshing,
  error,
  onRefresh,
}: {
  catalog: PermissionCatalogItem[];
  rules: PermissionRule[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
}) {
  const [toolName, setToolName] = useState('');
  const [behavior, setBehavior] = useState<PermissionBehavior>('ask');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const configurable = catalog.filter((item) => item.configurable);
  const groups = TOOL_CLASS_ORDER.map((toolClass) => ({
    toolClass,
    items: configurable.filter((item) => item.toolClass === toolClass),
  })).filter((group) => group.items.length > 0);

  function handleToolChange(value: string) {
    setToolName(value);
    setActionError(null);
    const existing = rules.find((rule) => rule.toolName === value);
    setBehavior(existing?.behavior ?? 'ask');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!toolName) {
      setActionError('请先选择一个可配置工具。');
      return;
    }

    setSubmitting(true);
    setActionError(null);
    try {
      // 数据面唯一键包含 behavior，且命中 ON DUPLICATE KEY UPDATE 时会因
      // GeneratedKeyHolder 拿到多个自增键而返回 500（见
      // doc/bug/2026-10-24-权限规则重复保存500.md）。规则内容恒为空串，
      // 同一工具 + 同一行为重复提交没有可更新字段，直接复用已有规则。
      const sameBehavior = rules.find(
        (rule) => rule.toolName === toolName && rule.behavior === behavior,
      );
      const ruleId =
        sameBehavior?.ruleId ??
        (await upsertPermissionRule({ toolName, behavior })).ruleId;

      // 数据面允许同一工具存在多条规则；界面约定「同一工具只有一条」。
      // 新规则写入成功后再清理其他行为，避免 POST 失败时丢失旧规则。
      const staleRules = rules.filter(
        (rule) => rule.toolName === toolName && rule.ruleId !== ruleId,
      );
      let cleanupFailed = false;
      for (const stale of staleRules) {
        try {
          await deletePermissionRule(stale.ruleId);
        } catch {
          cleanupFailed = true;
        }
      }
      if (cleanupFailed) {
        toast.error('规则已保存，但同工具的旧规则未能清理', {
          description: '请在下方的「已生效规则」里手动删除旧规则。',
        });
      } else {
        toast.success('已保存，下一轮对话生效', { description: toolName });
      }
      await onRefresh();
      setToolName('');
      setBehavior('ask');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '保存规则失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(rule: PermissionRule) {
    setDeletingId(rule.ruleId);
    setActionError(null);
    try {
      await deletePermissionRule(rule.ruleId);
      toast.success('规则已删除', { description: rule.toolName });
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '删除规则失败，请稍后重试。');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section aria-labelledby="permission-rules-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="permission-rules-heading" className="text-sm font-semibold tracking-tight">
            我的规则
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            只对当前账号生效；规则只收紧、不放宽，同一工具重复保存即覆盖。
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          {refreshing && <Loader2 className="h-3 w-3 animate-spin" aria-label="正在刷新规则" />}
          {rules.length} 条规则
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
        <form className="space-y-4 p-4 sm:p-5" onSubmit={handleSubmit}>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)_auto] lg:items-end">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="permission-tool" className="text-xs font-medium">
                工具
              </Label>
              <Select
                value={toolName}
                onValueChange={handleToolChange}
                disabled={submitting || configurable.length === 0}
              >
                <SelectTrigger id="permission-tool" className="h-10">
                  <SelectValue
                    placeholder={
                      configurable.length === 0 ? '目录中没有可配置工具' : '选择一个可配置工具'
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {groups.map((group) => (
                    <SelectGroup key={group.toolClass}>
                      <SelectLabel className="text-[11px] text-muted-foreground">
                        {TOOL_CLASS_LABELS[group.toolClass]}
                      </SelectLabel>
                      {group.items.map((item) => (
                        <SelectItem key={item.toolName} value={item.toolName}>
                          <span className="font-mono text-xs">{item.toolName}</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <fieldset className="min-w-0 space-y-1.5">
              <legend className="text-xs font-medium">行为</legend>
              <RadioGroup
                value={behavior}
                onValueChange={(value) => {
                  setBehavior(value as PermissionBehavior);
                  setActionError(null);
                }}
                className="grid grid-cols-2 gap-2"
                disabled={submitting}
              >
                <div className="flex items-start gap-2 rounded-md border border-border/70 bg-background p-2.5">
                  <RadioGroupItem
                    value="ask"
                    id="permission-behavior-ask"
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <Label
                      htmlFor="permission-behavior-ask"
                      className="block cursor-pointer text-xs font-medium"
                    >
                      每次询问
                    </Label>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      调用前等待确认
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-md border border-border/70 bg-background p-2.5">
                  <RadioGroupItem
                    value="deny"
                    id="permission-behavior-deny"
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <Label
                      htmlFor="permission-behavior-deny"
                      className="block cursor-pointer text-xs font-medium"
                    >
                      拒绝
                    </Label>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      直接阻止调用
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </fieldset>

            <Button type="submit" className="h-10 w-full lg:w-auto" disabled={submitting || !toolName}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              保存规则
            </Button>
          </div>

          {actionError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{actionError}</span>
            </p>
          )}
        </form>

        <div className="border-t border-border/70">
          <div className="flex items-center justify-between gap-2 bg-muted/20 px-4 py-2 sm:px-5">
            <span className="text-[11px] font-medium text-muted-foreground">已生效规则</span>
            <span className="text-[11px] text-muted-foreground">下一轮对话生效</span>
          </div>

          {loading ? (
            <div aria-busy="true">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className="h-12 rounded-none border-b border-border/40 last:border-b-0"
                />
              ))}
            </div>
          ) : error && rules.length === 0 ? (
            <div className="flex flex-col items-start gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p role="alert" className="text-xs leading-relaxed text-destructive">
                {error}
              </p>
              <Button variant="outline" size="sm" onClick={() => void onRefresh()}>
                重试
              </Button>
            </div>
          ) : rules.length === 0 ? (
            <div className="px-4 py-8 text-center sm:px-5">
              <p className="text-sm text-muted-foreground">
                从上面的目录里选一个工具，收紧它的权限
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                例如把 write_file 设为「每次询问」，或把 execute 设为「拒绝」。
              </p>
            </div>
          ) : (
            <>
              {error && (
                <p role="alert" className="border-b border-border/60 bg-destructive/5 px-4 py-2 text-xs text-destructive sm:px-5">
                  {error}
                </p>
              )}
              <ul className="divide-y divide-border/70">
                {rules.map((rule) => (
                  <li
                    key={rule.ruleId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5"
                  >
                    <code className="min-w-0 flex-1 break-all font-mono text-[12.5px] leading-snug">
                      {rule.toolName}
                    </code>
                    <BehaviorBadge behavior={rule.behavior} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`删除 ${rule.toolName} 的权限规则`}
                      title="删除规则"
                      disabled={deletingId === rule.ruleId}
                      onClick={() => void handleDelete(rule)}
                    >
                      {deletingId === rule.ruleId ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
