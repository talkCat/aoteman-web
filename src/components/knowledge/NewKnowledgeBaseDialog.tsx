'use client';

import { useEffect, useState } from 'react';
import { DatabaseZap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import type { EmbeddingDisplay } from '@/lib/knowledge-config';
import type { ChunkStrategy } from '@/types/knowledge';
import { cn } from '@/lib/utils';

const STRATEGY_OPTIONS: { value: ChunkStrategy; title: string; hint: string }[] = [
  { value: 'AUTO', title: '自动', hint: '识别到标题结构按章节切，否则按固定长度切' },
  { value: 'TOC', title: '章节', hint: '严格按目录层级切；没有目录的文件会入库失败' },
  { value: 'FIXED', title: '固定长度', hint: '不看目录，按 600 字左右切块，适合话术类文档' },
];

/**
 * 新建知识库。
 * 设计依据：设计文档 §6.3——名称 / 描述 / 切片策略三项，Embedding 全局只读。
 */
export function NewKnowledgeBaseDialog({
  open,
  onOpenChange,
  embedding,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  embedding: EmbeddingDisplay;
  /** 返回 Promise 时对话框会保持打开并显示提交中，失败由调用方抛出错误文案。 */
  onCreate: (input: { name: string; description: string; strategy: ChunkStrategy }) => Promise<void> | void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [strategy, setStrategy] = useState<ChunkStrategy>('AUTO');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setStrategy('AUTO');
    setSubmitting(false);
    setError(null);
  }, [open]);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ name: trimmedName, description: description.trim(), strategy });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '创建失败，请稍后重试');
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>新建知识库</DialogTitle>
          <DialogDescription>
            切片策略建库后仍可修改；Embedding 模型是全局配置，所有知识库共用同一向量集合。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="kb-name">名称</Label>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {name.length}/128
              </span>
            </div>
            <Input
              id="kb-name"
              value={name}
              onChange={(event) => setName(event.target.value.slice(0, 128))}
              placeholder="例如：行政制度"
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="kb-description">描述</Label>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {description.length}/512
              </span>
            </div>
            <Textarea
              id="kb-description"
              value={description}
              onChange={(event) => setDescription(event.target.value.slice(0, 512))}
              placeholder="一句话说明这个库存放什么，专家选择时会显示"
              rows={2}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">切片策略</legend>
            <RadioGroup
              value={strategy}
              onValueChange={(value) => setStrategy(value as ChunkStrategy)}
              className="gap-2"
            >
              {STRATEGY_OPTIONS.map((option) => {
                const active = strategy === option.value;
                return (
                  <label
                    key={option.value}
                    htmlFor={`strategy-${option.value}`}
                    className={cn(
                      'ui-interactive ui-focus-row flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2',
                      active ? 'border-primary/40 bg-primary/5' : 'border-border/70 hover:bg-accent/60',
                    )}
                  >
                    <RadioGroupItem id={`strategy-${option.value}`} value={option.value} data-row-link className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{option.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {option.hint}
                      </span>
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
          </fieldset>

          <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <DatabaseZap className="h-3.5 w-3.5" aria-hidden="true" />
              全局向量配置（只读）
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">模型</dt>
                <dd className="font-mono">{embedding.modelName}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">维度</dt>
                <dd className="font-mono tabular-nums">{embedding.dimension}</dd>
              </div>
              <div className="col-span-2 flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">重排</dt>
                <dd className="font-mono">{embedding.rerankModel}</dd>
              </div>
            </dl>
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              取消
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? '创建中…' : '创建知识库'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}