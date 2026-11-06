'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Send, Square } from 'lucide-react';

import { ExpertChips } from '@/components/chat/ExpertChips';
import { ExpertPicker } from '@/components/chat/ExpertPicker';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { UserExpertSummary } from '@/types/knowledge';
import { cn } from '@/lib/utils';

interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  running: boolean;
  deepThinking: boolean;
  onDeepThinkingChange: (checked: boolean) => void;
  experts: UserExpertSummary[];
  selectedExpertIds: string[];
  onToggleExpert: (expertId: string) => void;
  onRemoveExpert: (expertId: string) => void;
  onClearExperts: () => void;
  /** 画布分栏时对话列只有 392px，隐藏键盘提示避免挤压 */
  compact?: boolean;
}

/**
 * 问答输入区。专家选择嵌在同一个 composer 容器内，不额外增加工具栏。
 * 设计依据：设计文档 §10.1。
 */
export function MessageComposer({
  value,
  onChange,
  onSend,
  onStop,
  running,
  deepThinking,
  onDeepThinkingChange,
  experts,
  selectedExpertIds,
  onToggleExpert,
  onRemoveExpert,
  onClearExperts,
  compact = false,
}: MessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedExperts = useMemo(
    () =>
      selectedExpertIds
        .map((id) => experts.find((expert) => expert.expertId === id))
        .filter((expert): expert is UserExpertSummary => Boolean(expert)),
    [selectedExpertIds, experts],
  );

  // 输入框自适应高度（上限 160px）
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [value]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!running && value.trim()) onSend();
    }
  }

  return (
    <div className={cn('composer-surface rounded-[26px] p-px', running && 'composer-thinking')}>
      {running && <span className="composer-thinking-ambient" aria-hidden="true" />}
      <div className="composer-inner rounded-[25px] p-2.5">
        {running && (
          <div className="composer-thinking-line" role="status" aria-live="polite">
            <span className="composer-thinking-ring" aria-hidden="true" />
            思考中...
          </div>
        )}
        <ExpertChips experts={selectedExperts} onRemove={onRemoveExpert} />

        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            name="chat-message"
            aria-label="输入消息"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            rows={1}
            className="max-h-[160px] min-h-[44px] flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-sm shadow-none focus-visible:ring-0 focus-visible:outline-none"
          />
          {running ? (
            <Button variant="destructive" className="h-11 shrink-0 px-4" onClick={onStop}>
              <Square className="h-4 w-4" />
              <span className="ml-1.5">停止</span>
            </Button>
          ) : (
            <Button
              className="h-11 w-11 shrink-0"
              onClick={onSend}
              disabled={!value.trim()}
              title="发送"
              aria-label="发送"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 px-1 pt-1.5 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-2">
            <Switch
              id="deep-thinking"
              checked={deepThinking}
              onCheckedChange={onDeepThinkingChange}
              className="relative after:absolute after:-inset-2.5 after:content-['']"
            />
            <Label htmlFor="deep-thinking" className="-my-2 cursor-pointer whitespace-nowrap py-2 text-xs">
              深度思考
            </Label>
            {experts.length > 0 && (
              <>
                <span className="hidden h-3 w-px bg-border sm:block" aria-hidden="true" />
                <ExpertPicker
                  experts={experts}
                  selectedIds={selectedExpertIds}
                  onToggle={onToggleExpert}
                  onClear={onClearExperts}
                />
              </>
            )}
          </div>
          {!compact && (
            <span className="hidden shrink-0 sm:block">Enter 发送 · Shift+Enter 换行</span>
          )}
        </div>
      </div>
    </div>
  );
}
