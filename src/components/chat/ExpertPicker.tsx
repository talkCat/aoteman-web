'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Search, Sparkles } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { MAX_EXPERTS } from '@/hooks/useExpertSelection';
import { initialOf } from '@/lib/knowledge-format';
import { cn } from '@/lib/utils';
import type { UserExpertSummary } from '@/types/knowledge';

interface ExpertPickerProps {
  experts: UserExpertSummary[];
  selectedIds: string[];
  onToggle: (expertId: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

/**
 * composer 内的专家多选入口。
 *
 * 桌面用 Popover（向上展开），移动端用底部 Sheet（h-[70dvh]），
 * 面板只展示「已发布且已授权」的专家；没有任何可用专家时不渲染入口。
 * 设计依据：设计文档 §10.2 / §10.3。
 */
export function ExpertPicker({ experts, selectedIds, onToggle, onClear, disabled }: ExpertPickerProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  if (experts.length === 0) return null;

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      className="h-11 gap-1.5 px-2.5 text-xs md:h-7 md:px-2"
      aria-label={selectedIds.length > 0 ? `专家 ${selectedIds.length}/${MAX_EXPERTS}，选择专家` : '选择专家'}
      aria-expanded={open}
    >
      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      {selectedIds.length > 0 ? `专家 ${selectedIds.length}/${MAX_EXPERTS}` : '选择专家'}
    </Button>
  );

  const panel = (
    <ExpertPanel
      experts={experts}
      selectedIds={selectedIds}
      query={query}
      onQueryChange={setQuery}
      onToggle={onToggle}
      onClear={onClear}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        {/* 移动端底部 Sheet：圆角 + 安全区内边距与上传弹窗保持一致；关闭按钮是绝对定位的，
            所以面板标题行需要额外的右内边距，避免「N/5」计数被盖住。 */}
        <SheetContent
          side="bottom"
          className="h-[70dvh] overflow-hidden rounded-t-xl p-0 pb-[env(safe-area-inset-bottom)]"
        >
          <SheetTitle className="sr-only">选择专家</SheetTitle>
          <div className="h-full overflow-hidden">
            <ExpertPanel
              experts={experts}
              selectedIds={selectedIds}
              query={query}
              onQueryChange={setQuery}
              onToggle={onToggle}
              onClear={onClear}
              mobile
            />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" side="top" sideOffset={8} className="w-[360px] p-0">
        {panel}
      </PopoverContent>
    </Popover>
  );
}

function ExpertPanel({
  experts,
  selectedIds,
  query,
  onQueryChange,
  onToggle,
  onClear,
  mobile = false,
}: {
  experts: UserExpertSummary[];
  mobile?: boolean;
  selectedIds: string[];
  query: string;
  onQueryChange: (value: string) => void;
  onToggle: (expertId: string) => void;
  onClear: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return experts;
    return experts.filter(
      (expert) =>
        expert.name.toLowerCase().includes(keyword) ||
        (expert.description ?? '').toLowerCase().includes(keyword),
    );
  }, [experts, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const full = selectedIds.length >= MAX_EXPERTS;

  function handleListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (filtered.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(filtered.length - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const expert = filtered[activeIndex];
      if (!expert) return;
      if (!selectedIds.includes(expert.expertId) && full) return;
      onToggle(expert.expertId);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn('flex items-center justify-between gap-3 px-3 pt-3', mobile && 'pr-14')}>
        <div className="text-sm font-medium">选择专家</div>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {selectedIds.length}/{MAX_EXPERTS}
        </span>
      </div>

      <div className="relative px-3 pt-2">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              listRef.current?.focus();
            }
          }}
          placeholder="搜索专家名称或描述…"
          aria-label="搜索专家"
          className="ui-interactive ui-focus-field h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div
        ref={listRef}
        role="listbox"
        aria-label="可用专家"
        aria-multiselectable="true"
        aria-activedescendant={filtered[activeIndex] ? `expert-option-${filtered[activeIndex].expertId}` : undefined}
        tabIndex={0}
        onKeyDown={handleListKeyDown}
        className="ui-focus-ring-inset mt-2 min-h-0 flex-1 overflow-y-auto px-1.5 outline-none"
      >
        {filtered.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">没有匹配的专家</p>
        ) : (
          filtered.map((expert, index) => {
            const order = selectedIds.indexOf(expert.expertId);
            const selected = order >= 0;
            const rowDisabled = !selected && full;

            return (
              <div
                key={expert.expertId}
                id={`expert-option-${expert.expertId}`}
                role="option"
                aria-selected={selected}
                aria-disabled={rowDisabled}
                onClick={() => {
                  if (!rowDisabled) onToggle(expert.expertId);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'ui-interactive flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2',
                  index === activeIndex && 'bg-accent/60',
                  rowDisabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-transparent',
                  )}
                  aria-hidden="true"
                >
                  {selected ? order + 1 : '0'}
                </span>

                <Avatar className="mt-0.5 h-7 w-7 shrink-0">
                  {expert.avatarUrl && <AvatarImage src={expert.avatarUrl} alt="" />}
                  <AvatarFallback className="bg-primary/10 text-[11px] font-medium text-primary">
                    {initialOf(expert.name)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium">{expert.name}</span>
                    {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />}
                  </div>
                  {expert.description && (
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{expert.description}</p>
                  )}
                  <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground/80">
                    {expert.knowledgeBaseCount} 个知识库
                    <span aria-hidden="true"> · </span>
                    {expert.skillCount} 个技能
                    <span aria-hidden="true"> · </span>
                    {expert.mcpCount} 个 MCP
                    {expert.knowledgeBaseCount === 0 && (
                      <span className="ml-1 text-warning">（暂无可用知识库）</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {full ? `最多同时选择 ${MAX_EXPERTS} 个专家` : '不选专家时，按你的知识库授权检索'}
        </span>
        <button
          type="button"
          onClick={onClear}
          disabled={selectedIds.length === 0}
          className="ui-interactive ui-focus-ring shrink-0 rounded px-1 text-[11px] text-primary hover:underline disabled:pointer-events-none disabled:opacity-40"
        >
          清空
        </button>
      </div>
    </div>
  );
}