'use client';

import { AlertTriangle } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export const PROMPT_MAX = 6000;
export const PROMPT_WARN = 5400;

/** 系统提示词编辑器：只存在于管理端，字数上限 6000，5400 起提示。 */
export function ExpertPromptEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const length = value.length;
  const overLimit = length > PROMPT_MAX;
  const nearLimit = length > PROMPT_WARN && !overLimit;

  return (
    <section className="space-y-2" aria-labelledby="expert-prompt-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id="expert-prompt-heading" className="text-sm font-medium">
            系统提示词
          </h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            定义角色、回答结构、引用要求与禁止事项。仅管理员可见，不会出现在问答页。
          </p>
        </div>
        <span
          className={cn(
            'font-mono text-[11px] tabular-nums text-muted-foreground',
            nearLimit && 'text-warning',
            overLimit && 'text-destructive',
          )}
        >
          {length.toLocaleString('zh-CN')} / {PROMPT_MAX.toLocaleString('zh-CN')}
        </span>
      </div>
      <Label htmlFor="expert-system-prompt" className="sr-only">
        系统提示词内容
      </Label>
      <Textarea
        id="expert-system-prompt"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={14}
        maxLength={6200}
        spellCheck={false}
        placeholder={'例如：\n你是一名资深法务顾问，服务对象是公司内部员工。\n回答时先给结论，再给依据；涉及合同、竞业、劳动争议时指出适用法与风险等级。\n引用检索结果时使用 [K1] 这样的标记，编号必须与检索结果一致。'}
        className="min-h-[320px] resize-y font-mono text-[12px] leading-6"
      />
      {overLimit ? (
        <p className="flex items-start gap-1.5 text-[11px] text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          已超出 {length - PROMPT_MAX} 字，发布与保存都会被禁用。请删减后再继续。
        </p>
      ) : nearLimit ? (
        <p className="flex items-start gap-1.5 text-[11px] text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          接近 6000 字上限。过长会挤占对话上下文，建议只保留约束与示例。
        </p>
      ) : (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          建议写清「先给结论」「数字必须来自检索原文」「缺少依据时直说」等可检验的规则。
        </p>
      )}
    </section>
  );
}