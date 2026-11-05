'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, LibraryBig, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatCount } from '@/lib/knowledge-format';
import { cn } from '@/lib/utils';
import type { ExpertKnowledgeBinding, KnowledgeBaseSummary } from '@/types/knowledge';

/**
 * 专家关联知识库：只允许选择 ACTIVE 库，已选顺序就是检索 / 提示词拼接顺序。
 * 设计依据：设计文档 §9.2「关联知识库」；顺序用上移 / 下移，不做拖拽。
 */
export function ExpertKnowledgePicker({
  bases,
  value,
  onChange,
  disabled = false,
}: {
  bases: KnowledgeBaseSummary[];
  value: ExpertKnowledgeBinding[];
  onChange: (next: ExpertKnowledgeBinding[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const selectedIds = useMemo(() => new Set(value.map((item) => item.kbId)), [value]);
  const available = useMemo(
    () => bases.filter((base) => base.status !== 'DELETED' && !selectedIds.has(base.kbId)),
    [bases, selectedIds],
  );

  function reindex(next: ExpertKnowledgeBinding[]): ExpertKnowledgeBinding[] {
    return next.map((item, index) => ({ ...item, sortOrder: index + 1 }));
  }

  function add(base: KnowledgeBaseSummary) {
    if (base.status !== 'ACTIVE' || selectedIds.has(base.kbId)) return;
    onChange(
      reindex([
        ...value,
        {
          kbId: base.kbId,
          name: base.name,
          status: base.status,
          sortOrder: value.length + 1,
          documentCount: base.documentCount,
          chunkCount: base.chunkCount,
        },
      ]),
    );
    setOpen(false);
  }

  function remove(kbId: string) {
    onChange(reindex(value.filter((item) => item.kbId !== kbId)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(reindex(next));
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border">
        {value.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
            <LibraryBig className="h-5 w-5 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm font-medium">还没有关联知识库</p>
            <p className="text-xs text-muted-foreground">不关联也可以保存，但专家只能凭提示词回答。</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {value.map((binding, index) => (
              <li key={binding.kbId} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 font-mono text-[11px] tabular-nums text-primary">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="truncate text-sm font-medium">{binding.name}</span>
                    <span
                      className={cn(
                        'text-[10px] leading-4',
                        binding.status === 'ACTIVE' ? 'text-success' : 'text-muted-foreground',
                      )}
                    >
                      {binding.status === 'ACTIVE' ? '启用' : binding.status === 'DISABLED' ? '已停用' : '已删除'}
                    </span>
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatCount(binding.documentCount)} 份文档 · {binding.chunkCount === null ? '—' : formatCount(binding.chunkCount)} 个切片
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    aria-label={`上移 ${binding.name}`}
                    title="上移"
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    aria-label={`下移 ${binding.name}`}
                    title="下移"
                    disabled={disabled || index === value.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    aria-label={`移除 ${binding.name}`}
                    disabled={disabled}
                    onClick={() => remove(binding.kbId)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8" disabled={disabled}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              添加知识库
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] p-0" align="start">
            <Command>
              <CommandInput placeholder="搜索知识库名称" className="h-9" />
              <CommandList className="max-h-[300px]">
                <CommandEmpty>没有匹配的知识库</CommandEmpty>
                <CommandGroup>
                  {available.map((base) => {
                    const usable = base.status === 'ACTIVE';
                    return (
                      <CommandItem
                        key={base.kbId}
                        value={`${base.name} ${base.description ?? ''}`}
                        disabled={!usable}
                        onSelect={() => usable && add(base)}
                        className="gap-2"
                      >
                        <LibraryBig
                          className={cn('h-4 w-4 shrink-0', usable ? 'text-primary' : 'text-muted-foreground/50')}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px]">{base.name}</span>
                          <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
                            {formatCount(base.documentCount)} 份文档 · {base.chunkCount === null ? '—' : formatCount(base.chunkCount)} 个切片
                          </span>
                        </span>
                        <span
                          className={cn(
                            'shrink-0 text-[10px]',
                            usable ? 'text-success' : 'text-muted-foreground',
                          )}
                        >
                          {usable ? '启用' : '已停用'}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
          已关联 {value.length} 个知识库
        </span>
      </div>
    </div>
  );
}