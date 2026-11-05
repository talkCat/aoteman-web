'use client';

import { useMemo, useState } from 'react';
import { Check, ClipboardPaste, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { initialOf } from '@/lib/knowledge-format';
import { cn } from '@/lib/utils';
import type { GrantUser } from '@/types/knowledge';

/**
 * 统一用户授权选择器（知识库授权 F-05、专家授权 F-09 共用）。
 *
 * 数据源是全量用户列表，前端本地过滤：内部环境用户量可控，不为它加分页。
 * 设计依据：设计文档 §5（通用组件）/ §7.3 / §9.2。
 */
export function UserGrantPicker({
  users,
  value,
  onChange,
  disabled = false,
  emptyHint = '还没有授权给任何人',
}: {
  users: GrantUser[];
  value: GrantUser[];
  onChange: (next: GrantUser[]) => void;
  disabled?: boolean;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const grantedIds = useMemo(() => new Set(value.map((item) => item.userId)), [value]);
  const available = useMemo(
    () => users.filter((user) => !grantedIds.has(user.userId)),
    [users, grantedIds],
  );

  function toggle(user: GrantUser) {
    if (grantedIds.has(user.userId)) {
      onChange(value.filter((item) => item.userId !== user.userId));
    } else {
      onChange([...value, user]);
    }
  }

  function remove(userId: string) {
    onChange(value.filter((item) => item.userId !== userId));
  }

  function applyPaste() {
    const tokens = pasteText
      .split(/[\s,，;；]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (tokens.length === 0) return;

    const next = [...value];
    const existing = new Set(next.map((item) => item.userId));
    const matched: GrantUser[] = [];
    const unmatched: string[] = [];

    for (const token of tokens) {
      const user = users.find(
        (item) => item.userId === token || item.username === token || item.email === token,
      );
      if (!user) {
        unmatched.push(token);
        continue;
      }
      if (existing.has(user.userId)) continue;
      existing.add(user.userId);
      next.push(user);
      matched.push(user);
    }

    onChange(next);
    setPasteText('');
    setPasteOpen(false);

    if (matched.length === 0 && unmatched.length === 0) {
      toast.info('没有新增用户');
      return;
    }
    toast.success(`已添加 ${matched.length} 位用户`, {
      description: unmatched.length > 0 ? `${unmatched.length} 个标识无法匹配，已忽略` : undefined,
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border">
        {value.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">{emptyHint}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {value.map((user) => (
              <li key={user.userId} className="flex items-center gap-3 px-3 py-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-medium text-primary"
                >
                  {initialOf(user.displayName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="truncate text-sm font-medium">{user.displayName}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{user.username}</span>
                    {user.roles.map((role) => (
                      <span
                        key={role}
                        className="rounded border border-border/70 px-1 text-[10px] leading-4 text-muted-foreground"
                      >
                        {role}
                      </span>
                    ))}
                    {user.status !== 'ACTIVE' && (
                      <span className="text-[10px] leading-4 text-warning">已停用</span>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`移除 ${user.displayName} 的授权`}
                  disabled={disabled}
                  onClick={() => remove(user.userId)}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" disabled={disabled} className="h-8">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              添加用户
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0" align="start">
            <Command>
              <CommandInput placeholder="搜索用户名 / 显示名 / 邮箱" className="h-9" />
              <CommandList className="max-h-[280px]">
                <CommandEmpty>没有匹配的用户</CommandEmpty>
                <CommandGroup>
                  {available.map((user) => (
                    <CommandItem
                      key={user.userId}
                      value={`${user.displayName} ${user.username} ${user.email ?? ''}`}
                      onSelect={() => toggle(user)}
                      className="gap-2"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
                      >
                        {initialOf(user.displayName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{user.displayName}</span>
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">
                          {user.username}
                        </span>
                      </span>
                      {user.status !== 'ACTIVE' && (
                        <span className="text-[10px] text-warning">已停用</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-muted-foreground"
          disabled={disabled}
          onClick={() => setPasteOpen(true)}
        >
          <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
          批量粘贴 userId
        </Button>

        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
          已授权 {value.length} 人
        </span>
      </div>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>批量粘贴用户</DialogTitle>
            <DialogDescription>
              每行一个 userId（也支持用户名或邮箱），换行、逗号分隔均可；无法匹配的标识会被忽略。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="grant-paste">用户标识</Label>
            <Textarea
              id="grant-paste"
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder={'u_1002\nu_1003'}
              rows={6}
              className="font-mono text-[13px]"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPasteOpen(false)}>
              取消
            </Button>
            <Button onClick={applyPaste} disabled={pasteText.trim().length === 0}>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}