'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTheme } from 'next-themes';
import { useSSEStream } from '@/hooks/useSSEStream';
import { normalizeFollowupInput } from '@/lib/followup';
import type { Identity, Message, Thinking, Narration, ToolUse, ToolConfirmation, FollowupQuestionnaire, TraceEntry, Notification, TurnGroup } from '@/types/agent';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { SessionSidebar } from '@/components/SessionSidebar';
import { TurnAnchorRail } from '@/components/TurnAnchorRail';
import { Markdown } from '@/components/Markdown';
import { ChevronDown, Send, Square, RotateCcw, Moon, Sun, Bot, User, Wrench, Sparkles, MessageSquareText, AlertCircle, CheckCircle, XCircle, Loader2, Copy, Eye, EyeOff, Pencil, Check, Menu } from 'lucide-react';

// 生成随机 ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// 工具名称映射
const TOOL_NAME_MAP: Record<string, string> = {
  ask_followup_questions: '追问问卷',
};

// 获取工具名称显示
const getToolDisplayName = (name: string) => TOOL_NAME_MAP[name] || name;

// 一轮内的中间过程步骤（思考 / 叙述 / 工具调用），统一按时序渲染
type TurnStep =
  | { kind: 'thinking'; key: string; seq?: number; timestamp: number; thinking: Thinking }
  | { kind: 'narration'; key: string; seq?: number; timestamp: number; narration: Narration }
  | { kind: 'tool'; key: string; seq?: number; timestamp: number; tool: ToolUse };

// 按落盘 seq 排序（缺失时按时间戳兜底），还原真实的「思考 → 叙述 → 工具」时序
function buildTurnSteps(turn: TurnGroup): TurnStep[] {
  const steps: TurnStep[] = [
    ...turn.thinking.map(t => ({ kind: 'thinking' as const, key: 'k:' + t.id, seq: t.seq, timestamp: t.timestamp ?? 0, thinking: t })),
    ...turn.narrations.map(n => ({ kind: 'narration' as const, key: 'n:' + n.id, seq: n.seq, timestamp: n.timestamp ?? 0, narration: n })),
    ...turn.toolUses.map(t => ({ kind: 'tool' as const, key: 't:' + t.id, seq: t.seq, timestamp: t.timestamp ?? 0, tool: t })),
  ];
  return steps.sort((a, b) => {
    const sa = a.seq ?? Number.MAX_SAFE_INTEGER;
    const sb = b.seq ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.timestamp - b.timestamp;
  });
}

// 从工具入参里提取一个可读的主参数，供折叠态直接显示「做了什么」
const TOOL_ARG_KEYS = ['path', 'file_path', 'file', 'target', 'url', 'query', 'pattern', 'prompt', 'command', 'name'];
function getToolAction(name: string, input: string): { display: string; arg?: string } {
  const display = getToolDisplayName(name);
  if (!input) return { display };
  let parsed: Record<string, unknown> | null = null;
  try {
    const p = JSON.parse(input);
    if (p && typeof p === 'object' && !Array.isArray(p)) parsed = p as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  if (!parsed) return { display };
  for (const key of TOOL_ARG_KEYS) {
    const value = parsed[key];
    if (typeof value === 'string' && value.trim()) {
      const summarized = value.trim().replace(/\s+/g, ' ');
      return { display, arg: summarized.length > 60 ? summarized.slice(0, 60) + '…' : summarized };
    }
  }
  return { display };
}

function ToolStatusIcon({ status }: { status?: ToolUse['status'] }) {
  if (status === 'success') {
    return <CheckCircle className="h-3.5 w-3.5 shrink-0 text-success" aria-label="成功" />;
  }
  if (status === 'error') {
    return <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="失败" />;
  }
  return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="进行中" />;
}

// 单个工具 / 技能调用：去卡片，收敛为时间线上的一行「动作句」，
// 默认只显示「名称 · 主参数 + 状态」，展开后才显示输入 / 输出（无底色无边框）。
function ToolStep({ tool }: { tool: ToolUse }) {
  const [open, setOpen] = useState(false);
  const isSkill = tool.type === 'skill';
  const { display, arg } = getToolAction(tool.name, tool.input);
  const hasDetails = Boolean(tool.input || tool.output);

  return (
    <div className={`ml-0.5 border-l-2 pl-3 ${isSkill ? 'border-skill/40' : 'border-tool/40'}`}>
      <button
        type="button"
        onClick={() => hasDetails && setOpen(prev => !prev)}
        disabled={!hasDetails}
        aria-expanded={hasDetails ? open : undefined}
        className={`flex w-full items-center gap-2 text-left ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {isSkill ? (
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-skill" />
        ) : (
          <Wrench className="h-3.5 w-3.5 shrink-0 text-tool" />
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {display}
          {arg && <span className="font-normal text-muted-foreground"> · {arg}</span>}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground/70">{isSkill ? '技能' : '工具'}</span>
        <ToolStatusIcon status={tool.status} />
        {hasDetails && (
          <ChevronDown className={`h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {hasDetails && open && (
        <div className="mt-2 space-y-2">
          {tool.input && (
            <div>
              <div className="mb-0.5 text-[11px] text-muted-foreground/70">输入</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">{tool.input}</pre>
            </div>
          )}
          {tool.output && (
            <div>
              <div className="mb-0.5 text-[11px] text-muted-foreground/70">
                输出{tool.output.length > 200 ? `（${tool.output.length} 字符）` : ''}
              </div>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">{tool.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 一轮内的「过程」时间线。
// 叙述（narration）是用户纠偏的关键信号，始终可见，不随过程折叠；
// 思考 / 工具等机制细节收进可折叠的「过程」块，轮次进行中自动展开。
function ProcessTimeline({ steps, isActive }: { steps: TurnStep[]; isActive: boolean }) {
  const [open, setOpen] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);

  useEffect(() => {
    if (!manualOverride) setOpen(isActive);
  }, [isActive, manualOverride]);

  if (steps.length === 0) return null;

  const narrations = steps.filter((s): s is Extract<TurnStep, { kind: 'narration' }> => s.kind === 'narration');
  const mechanics = steps.filter(s => s.kind !== 'narration');
  const toolCount = mechanics.filter(s => s.kind === 'tool').length;

  return (
    <div className="mb-4 space-y-2.5">
      {narrations.map(step => (
        <div key={step.key} className="ml-0.5 border-l-2 border-border pl-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
            <MessageSquareText className="h-3 w-3" />
            <span>过程</span>
          </div>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {step.narration.content}
          </p>
        </div>
      ))}

      {mechanics.length > 0 && (
        <Collapsible
          open={open}
          onOpenChange={(next) => {
            setManualOverride(true);
            setOpen(next);
          }}
        >
          <CollapsibleTrigger className="group flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            {isActive ? (
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            ) : (
              <div className="h-4 w-0.5 rounded-full bg-border" />
            )}
            <Sparkles className="h-3 w-3" />
            <span>
              过程 · {mechanics.length} 步{toolCount > 0 ? `（含 ${toolCount} 次工具）` : ''}
            </span>
            <ChevronDown className={'h-3 w-3 transition-transform ' + (open ? 'rotate-180' : '')} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2.5 space-y-3">
              {mechanics.map(step => {
                if (step.kind === 'thinking') {
                  return (
                    <div key={step.key} className="ml-0.5 border-l-2 border-thinking/40 pl-3">
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-thinking">
                        <Sparkles className="h-3 w-3" />
                        <span>思考</span>
                      </div>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                        {step.thinking.content}
                        {step.thinking.isStreaming && (
                          <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-thinking align-middle" />
                        )}
                      </p>
                    </div>
                  );
                }
                if (step.kind === 'tool') {
                  return <ToolStep key={step.key} tool={step.tool} />;
                }
                return null;
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
export default function AgentChatPage() {
  // 主题（统一到 next-themes，移除本地 theme state 与手动 class 切换）
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const isDark = mounted && resolvedTheme === 'dark';
  const toggleTheme = useCallback(() => {
    setTheme(isDark ? 'light' : 'dark');
  }, [isDark, setTheme]);

  // 身份状态
  const [identity, setIdentity] = useState<Identity>({ userId: '', sessionId: '' });

  // 身份字段编辑状态
  const [editingIdentityField, setEditingIdentityField] = useState<'userId' | 'sessionId' | null>(null);
  const [identityDraft, setIdentityDraft] = useState('');

  // Generate random identity only on client to avoid SSR hydration mismatch
  useEffect(() => {
    setIdentity({
      userId: generateId(),
      sessionId: generateId(),
    });
  }, []);

  // 对话消息
  const [messages, setMessages] = useState<Message[]>([]);

  // 本地乐观显示的用户消息：SSE 回显到达前先展示，回显后按文本匹配移除，避免「不显示」或「显示两遍」
  const [pendingUserMessages, setPendingUserMessages] = useState<Array<{ id: string; content: string; timestamp: number }>>([]);

  // 思考过程
  const [thinking, setThinking] = useState<Thinking[]>([]);
  const [thinkingExpanded, setThinkingExpanded] = useState(true);

  // 中间过程叙述（工具调用前的模型过渡说明）
  const [narrations, setNarrations] = useState<Narration[]>([]);

  // 工具调用
  const [toolUses, setToolUses] = useState<ToolUse[]>([]);

  // 工具确认
  const [toolConfirmations, setToolConfirmations] = useState<ToolConfirmation[]>([]);

  // 追问问卷
  const [followupQuestionnaire, setFollowupQuestionnaire] = useState<FollowupQuestionnaire | null>(null);

  // TRACE 面板
  const [traceEntries, setTraceEntries] = useState<TraceEntry[]>([]);
  const [showTrace, setShowTrace] = useState(false);
  const traceScrollRef = useRef<HTMLDivElement>(null);

  // 移动端会话导航抽屉 + 轮次锚点高亮
  const [showToc, setShowToc] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<number | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // 通知
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // 状态
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 输入
  const [inputValue, setInputValue] = useState('');
  const [deepThinking, setDeepThinking] = useState(false);

  // 消息映射用于流式更新
  const messageMapRef = useRef<Map<string, Message>>(new Map());
  const thinkingMapRef = useRef<Map<string, Thinking>>(new Map());

  // 待回显的乐观用户消息（用于与 SSE user.message 回显做匹配去重）
  const pendingUserRef = useRef<Array<{ id: string; content: string }>>([]);

  // 已经渲染/提交过的追问工具 id，避免提交后问卷被同一个工具重复触发
  const handledFollowupIdsRef = useRef<Set<string>>(new Set());

  // 由 useSSEStream 注入：提交工具结果 / 确认后推进轮次，避免新一轮事件并入上一轮
  const beginUserTurnRef = useRef<(() => number) | null>(null);

  // 自动滚动
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // 输入框自适应高度（上限 160px）
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [inputValue]);

  // 添加通知
  const addNotification = useCallback((type: Notification['type'], message: string) => {
    const notification: Notification = {
      id: generateId(),
      type,
      message,
      timestamp: Date.now(),
    };
    setNotifications(prev => [...prev, notification]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
    }, 5000);
  }, []);

  // 清空对话
  const clearConversation = useCallback(() => {
    setMessages([]);
    setPendingUserMessages([]);
    pendingUserRef.current = [];
    setThinking([]);
    setNarrations([]);
    setToolUses([]);
    setToolConfirmations([]);
    setFollowupQuestionnaire(null);
    setTraceEntries([]);
    setError(null);
    messageMapRef.current.clear();
    thinkingMapRef.current.clear();
  }, []);

  // 重置身份
  const resetIdentity = useCallback(() => {
    clearConversation();
    setIdentity({
      userId: generateId(),
      sessionId: generateId(),
    });
    addNotification('info', '已重置身份，开始新的会话');
  }, [clearConversation, addNotification]);

  // 开始编辑身份字段
  const startEditIdentity = useCallback((field: 'userId' | 'sessionId') => {
    setEditingIdentityField(field);
    setIdentityDraft(identity[field]);
  }, [identity]);

  // 提交身份编辑（非空才生效；变更后以新身份重开会话）
  const commitEditIdentity = useCallback(() => {
    if (editingIdentityField === null) return;
    const field = editingIdentityField;
    const value = identityDraft.trim();
    setEditingIdentityField(null);
    setIdentityDraft('');
    if (!value || value === identity[field]) return;

    clearConversation();
    setIdentity(prev => ({ ...prev, [field]: value }));
    addNotification('info', '已更新' + (field === 'userId' ? '用户ID' : '会话ID'));
  }, [editingIdentityField, identityDraft, identity, clearConversation, addNotification]);

  // 身份编辑框键盘事件
  const handleIdentityKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEditIdentity();
    } else if (e.key === 'Escape') {
      setEditingIdentityField(null);
      setIdentityDraft('');
    }
  };

  // 提交事件
  const submitEvent = useCallback(async (events: Array<{ type: string; payload: Record<string, unknown> }>) => {
    try {
      const response = await fetch(`/api/sessions/${identity.sessionId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: identity.userId,
          events,
        }),
      });

      if (!response.ok) {
        throw new Error(`提交失败: ${response.status}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '提交失败';
      setError(message);
      addNotification('error', message);
    }
  }, [identity, addNotification]);

  // 发送消息
  const sendMessage = useCallback(async () => {
    if (!inputValue.trim()) return;

    const text = inputValue.trim();
    setInputValue('');

    // 立即乐观展示，SSE 回显到达后自动换成带 turnId 的正式消息
    const localId = 'local_' + generateId();
    const pending = { id: localId, content: text, timestamp: Date.now() };
    pendingUserRef.current = [...pendingUserRef.current, pending];
    setPendingUserMessages(prev => [...prev, pending]);

    // 提交事件；用户消息最终由 SSE 回显确定归属轮次
    await submitEvent([{
      type: 'user.message',
      payload: {
        text,
        deepThinking,
      },
    }]);
  }, [inputValue, deepThinking, submitEvent]);

  // 停止生成（中断当前运行）
  const stopGeneration = useCallback(async () => {
    addNotification('info', '正在停止...');
    await submitEvent([{
      type: 'user.interrupt',
      payload: {},
    }]);
  }, [submitEvent, addNotification]);

  // 提交工具确认
  const submitToolConfirmation = useCallback(async (toolCallId: string, toolName: string, allow: boolean) => {
    // 更新状态
    setToolConfirmations(prev =>
      prev.map(tc =>
        tc.toolCallId === toolCallId
          ? { ...tc, status: allow ? 'allowed' : 'denied' }
          : tc
      )
    );

    // 添加通知
    addNotification('info', allow ? `已允许工具调用：${toolName}` : `已拒绝工具调用：${toolName}`);

    // 工具确认后开启新一轮，后面对齐的工具事件不再并入上一轮
    const nextTurnId = beginUserTurnRef.current?.();

    // 添加用户消息摘要
    setMessages(prev => [...prev, {
      id: generateId(),
      type: 'user',
      content: allow ? `已允许工具调用：${toolName}` : `已拒绝工具调用：${toolName}`,
      timestamp: Date.now(),
      turnId: nextTurnId,
    }]);

    // 提交事件
    await submitEvent([{
      type: 'user.tool_confirmation',
      payload: {
        tool_use_id: toolCallId,
        allow,
        deepThinking,
      },
    }]);
  }, [addNotification, submitEvent, deepThinking]);

  // 提交追问问卷
  const submitFollowupQuestionnaire = useCallback(async () => {
    if (!followupQuestionnaire) return;

    const answers = Object.entries(followupQuestionnaire.answers).map(([question, answer]) => ({
      question,
      answer,
    }));

    // 提交答案即开启新一轮，否则第二轮的问卷与工具会并入上一轮
    const nextTurnId = beginUserTurnRef.current?.();

    // 前端只展示可读文案，原始 JSON 仅用于回传后端
    const readable = answers.map(a => a.question + '：' + a.answer).join('\n');
    setMessages(prev => [...prev, {
      id: generateId(),
      type: 'user',
      content: readable,
      timestamp: Date.now(),
      turnId: nextTurnId,
    }]);

    await submitEvent([{
      type: 'user.tool_result',
      payload: {
        // 必须是模型侧的 toolCallId，卡片 id 是前端事件 id，后端无法匹配
        tool_use_id: followupQuestionnaire.toolCallId || followupQuestionnaire.id,
        name: 'ask_followup_questions',
        content: JSON.stringify(answers),
        deepThinking,
      },
    }]);

    setFollowupQuestionnaire(null);
    addNotification('success', '追问答案已提交');
  }, [followupQuestionnaire, submitEvent, addNotification, deepThinking]);
  // SSE 回调
  const handleMessage = useCallback((message: Message) => {
    // SSE 回显的用户消息：先移除本地乐观占位，避免「显示两遍」
    if (message.type === 'user') {
      const list = pendingUserRef.current;
      const idx = list.findIndex(p => p.content === message.content);
      if (idx !== -1) {
        const [matched] = list.splice(idx, 1);
        pendingUserRef.current = list;
        setPendingUserMessages(prev => prev.filter(p => p.id !== matched.id));
      }
    }
    // 按 id 去重：SSE 重连回放时会重复推送同一条事件
    setMessages(prev => {
      if (prev.some(m => m.id === message.id)) return prev;
      return [...prev, { ...message, timestamp: message.timestamp || Date.now() }];
    });
    messageMapRef.current.set(message.id, message);
    scrollToBottom();
  }, [scrollToBottom]);

  const handleMessageUpdate = useCallback((id: string, content: string) => {
    // 只按事件 id 精确更新，避免 delta 落到上一轮的助手气泡里
    if (!id) return;
    setMessages(prev => {
      const targetIndex = prev.findIndex(m => m.id === id);
      if (targetIndex === -1) return prev;
      const updated = [...prev];
      updated[targetIndex] = {
        ...updated[targetIndex],
        content: updated[targetIndex].content + content,
        isStreaming: true,
      };
      messageMapRef.current.set(updated[targetIndex].id, updated[targetIndex]);
      return updated;
    });
    scrollToBottom();
  }, [scrollToBottom]);

  const handleMessageFinalize = useCallback((id: string, content: string, turnId?: number) => {
    // 流式结束后用落盘的权威文本整体替换，避免 delta 与全文叠加
    if (!id) return;
    setMessages(prev => {
      const targetIndex = prev.findIndex(m => m.id === id);
      if (targetIndex === -1) {
        return content
          ? [...prev, { id, type: 'assistant' as const, content, timestamp: Date.now(), turnId }]
          : prev;
      }
      const updated = [...prev];
      const current = updated[targetIndex];
      // 该轮只调用了工具、没有正文时，不要留下空白助手气泡
      if (!content && !current.content) {
        updated.splice(targetIndex, 1);
        messageMapRef.current.delete(id);
        return updated;
      }
      updated[targetIndex] = {
        ...current,
        content,
        isStreaming: false,
      };
      messageMapRef.current.set(updated[targetIndex].id, updated[targetIndex]);
      return updated;
    });
    scrollToBottom();
  }, [scrollToBottom]);

  // 撤掉被打字中的气泡（该段文本已被判定为中间叙述）
  const handleMessageRemove = useCallback((id: string) => {
    if (!id) return;
    setMessages(prev => prev.filter(m => m.id !== id));
    messageMapRef.current.delete(id);
  }, []);

  // 中间过程叙述：按事件 id 幂等追加，重连回放不会重复
  const handleNarration = useCallback((narration: Narration) => {
    setNarrations(prev => {
      const index = prev.findIndex(n => n.id === narration.id);
      if (index === -1) {
        return [...prev, narration];
      }
      const updated = [...prev];
      updated[index] = { ...updated[index], ...narration };
      return updated;
    });
    scrollToBottom();
  }, [scrollToBottom]);

  const handleThinking = useCallback((thinkingData: Thinking) => {
    const item = { ...thinkingData, timestamp: Date.now() };
    setThinking(prev => [...prev, item]);
    thinkingMapRef.current.set(item.id, item);
    if (thinkingExpanded) {
      scrollToBottom();
    }
  }, [scrollToBottom, thinkingExpanded]);

  const handleThinkingUpdate = useCallback((id: string, content: string) => {
    setThinking(prev => {
      const lastIndex = [...prev].reverse().findIndex(t => t.id === id);
      if (lastIndex === -1) return prev;

      const actualIndex = prev.length - 1 - lastIndex;
      const updated = [...prev];
      if (updated[actualIndex]) {
        updated[actualIndex] = {
          ...updated[actualIndex],
          content: updated[actualIndex].content + content,
          isStreaming: true,
        };
        thinkingMapRef.current.set(id, updated[actualIndex]);
      }
      return updated;
    });
    if (thinkingExpanded) {
      scrollToBottom();
    }
  }, [scrollToBottom, thinkingExpanded]);

  // 思考段落盘：用权威文本替换正在流式的思考段，并携带落盘 seq 参与时间线排序
  const handleThinkingFinalize = useCallback((id: string, content: string, seq?: number, turnId?: number) => {
    if (!id) return;
    setThinking(prev => {
      const index = prev.findIndex(t => t.id === id);
      if (index === -1) {
        const item: Thinking = { id, content, isStreaming: false, seq, turnId, timestamp: Date.now() };
        thinkingMapRef.current.set(id, item);
        return [...prev, item];
      }
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        content,
        isStreaming: false,
        seq: seq ?? updated[index].seq,
        turnId: turnId ?? updated[index].turnId,
      };
      thinkingMapRef.current.set(id, updated[index]);
      return updated;
    });
  }, []);

  const handleToolUse = useCallback((toolUse: ToolUse) => {
    setToolUses(prev => {
      const existing = prev.find(t => t.id === toolUse.id);
      if (existing) {
        return prev.map(t => t.id === toolUse.id ? { ...t, ...toolUse } : t);
      }
      return [...prev, { ...toolUse, timestamp: Date.now() }];
    });
    scrollToBottom();
  }, [scrollToBottom]);

  const handleToolResult = useCallback((toolResult: ToolUse) => {
    setToolUses(prev => {
      const exists = prev.some(t => t.id === toolResult.id);
      if (!exists) {
        // 兜底：没赶上 tool_use 事件时也要把结果展示出来
        return [...prev, { ...toolResult, timestamp: Date.now() }];
      }
      return prev.map(t =>
        t.id === toolResult.id
          ? { ...t, output: toolResult.output, status: toolResult.status }
          : t
      );
    });
    scrollToBottom();
  }, [scrollToBottom]);

  const handleSkillUse = useCallback((skillUse: ToolUse) => {
    setToolUses(prev => {
      const existing = prev.find(t => t.id === skillUse.id);
      if (existing) {
        return prev.map(t => t.id === skillUse.id ? { ...t, ...skillUse } : t);
      }
      return [...prev, { ...skillUse, timestamp: Date.now() }];
    });
    scrollToBottom();
  }, [scrollToBottom]);

  const handleSkillResult = useCallback((skillResult: ToolUse) => {
    setToolUses(prev => {
      const exists = prev.some(t => t.id === skillResult.id);
      if (!exists) {
        return [...prev, { ...skillResult, timestamp: Date.now() }];
      }
      return prev.map(t =>
        t.id === skillResult.id
          ? { ...t, output: skillResult.output, status: skillResult.status }
          : t
      );
    });
    scrollToBottom();
  }, [scrollToBottom]);

  const handleSkillLoaded = useCallback((name: string) => {
    addNotification('info', `技能已加载：${name}`);
  }, [addNotification]);

  const handleToolConfirmation = useCallback((confirmation: ToolConfirmation) => {
    setToolConfirmations(prev => {
      // 避免重复
      if (prev.some(tc => tc.toolCallId === confirmation.toolCallId)) {
        return prev;
      }
      return [...prev, confirmation];
    });
  }, []);

  const handleStatusRunning = useCallback(() => {
    setIsRunning(true);
  }, []);

  const handleStatusIdle = useCallback(() => {
    setIsRunning(false);
    setMessages(prev => prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m));
    setThinking(prev => prev.map(t => t.isStreaming ? { ...t, isStreaming: false } : t));
  }, []);

  const handleError = useCallback((message: string) => {
    setError(message);
    addNotification('error', message);
  }, [addNotification]);

  const handleInterrupted = useCallback(() => {
    setIsRunning(false);
    addNotification('warning', '已中断');
  }, [addNotification]);

  const handleTrace = useCallback((entry: TraceEntry) => {
    setTraceEntries(prev => [...prev.slice(-99), entry]);
    if (showTrace && traceScrollRef.current) {
      setTimeout(() => {
        traceScrollRef.current?.scrollTo({
          top: traceScrollRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 0);
    }
  }, [showTrace]);
  // 处理追问工具：同一张问卷只渲染一次，提交后不再重建。
  // 关键：必须从未处理的工具里挑选，否则第二轮问卷会被第一轮已处理的工具挡住。
  useEffect(() => {
    const askFollowupTool = toolUses.find(
      t => t.name === 'ask_followup_questions'
        && t.type === 'tool'
        && !handledFollowupIdsRef.current.has(t.id)
    );

    if (!askFollowupTool) return;
    // 已有待作答问卷时，等它提交后再处理下一张
    if (followupQuestionnaire) return;
    // 已经拿到结果的工具不再发起追问
    if (askFollowupTool.status === 'success' || askFollowupTool.status === 'error') {
      handledFollowupIdsRef.current.add(askFollowupTool.id);
      return;
    }
    // 预览帧只有工具名占位（准备中…），入参到齐后下一轮会再触发
    if (!askFollowupTool.input) return;

    // 后端已归一化，这里二次兜底：兼容 JSON 字符串 / 截断 JSON / 残缺文本
    const questions = normalizeFollowupInput(askFollowupTool.input);
    if (questions.length > 0) {
      const initialAnswers: Record<string, string> = {};
      questions.forEach((q) => {
        initialAnswers[q.question] = '';
      });

      handledFollowupIdsRef.current.add(askFollowupTool.id);
      setFollowupQuestionnaire({
        id: askFollowupTool.id,
        toolCallId: askFollowupTool.toolCallId || askFollowupTool.id,
        questions,
        answers: initialAnswers,
        status: 'pending',
        turnId: askFollowupTool.turnId,
      });
      return;
    }

    // 解析失败：标记已处理避免死循环，并显式提示（不再静默 catch）
    handledFollowupIdsRef.current.add(askFollowupTool.id);
    addNotification('warning', '追问问卷解析失败，请重新发起追问');
  }, [toolUses, followupQuestionnaire, addNotification]);

  // Group conversation items by turnId for chronological rendering
  const turns = useMemo(() => {
    const groupMap = new Map<number, TurnGroup>();

    const ensureGroup = (tid: number, timestamp: number) => {
      if (!groupMap.has(tid)) {
        groupMap.set(tid, { turnId: tid, messages: [], thinking: [], narrations: [], toolUses: [], timestamp });
      }
      return groupMap.get(tid)!;
    };

    // Group messages by turnId
    messages.forEach(m => {
      const g = ensureGroup(m.turnId || 0, m.timestamp);
      g.messages.push(m);
      if (m.timestamp < g.timestamp) g.timestamp = m.timestamp;
    });

    // Group thinking by turnId
    thinking.forEach(t => {
      const g = ensureGroup(t.turnId || 0, t.timestamp || Date.now());
      g.thinking.push(t);
    });

    // Group intermediate narrations by turnId
    narrations.forEach(n => {
      const g = ensureGroup(n.turnId || 0, n.timestamp || Date.now());
      g.narrations.push(n);
    });

    // Group toolUses by turnId
    toolUses.forEach(tu => {
      const g = ensureGroup(tu.turnId || 0, tu.timestamp || Date.now());
      g.toolUses.push(tu);
    });

    return Array.from(groupMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, thinking, narrations, toolUses]);

  // 轮次序号集合，作为 scroll spy 的重建依据
  const turnIdsKey = useMemo(() => turns.map(t => t.turnId).join(','), [turns]);

  // 滚动到指定轮次：轮次容器带 scroll-mt，避免被 sticky header 遮挡
  const scrollToTurn = useCallback((turnId: number) => {
    const target = document.getElementById(`turn-${turnId}`);
    if (!target) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setActiveTurnId(turnId);
    setShowToc(false);
  }, []);

  // 滚动监听：高亮当前所在轮次（Radix 视口作为观察根，顶部留 15% 触发带）
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    const targets = Array.from(viewport.querySelectorAll<HTMLElement>('[data-turn-id]'));
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          const id = Number(visible[0].target.getAttribute('data-turn-id'));
          if (!Number.isNaN(id)) setActiveTurnId(id);
        }
      },
      { root: viewport, rootMargin: '-15% 0px -75% 0px', threshold: 0 },
    );
    targets.forEach(t => observer.observe(t));
    return () => observer.disconnect();
  }, [turnIdsKey]);

  // SSE 连接
  const { isConnected, isRunning: sseRunning, beginUserTurn } = useSSEStream(
    identity.sessionId,
    identity.userId,
    {
      onMessage: handleMessage,
      onMessageUpdate: handleMessageUpdate,
      onMessageFinalize: handleMessageFinalize,
      onThinking: handleThinking,
      onThinkingUpdate: handleThinkingUpdate,
      onThinkingFinalize: handleThinkingFinalize,
      onNarration: handleNarration,
      onMessageRemove: handleMessageRemove,
      onToolUse: handleToolUse,
      onToolResult: handleToolResult,
      onSkillUse: handleSkillUse,
      onSkillResult: handleSkillResult,
      onSkillLoaded: handleSkillLoaded,
      onToolConfirmation: handleToolConfirmation,
      onStatusRunning: handleStatusRunning,
      onStatusIdle: handleStatusIdle,
      onError: handleError,
      onInterrupted: handleInterrupted,
      onTrace: handleTrace,
    }
  );

  // 把 useSSEStream 的轮次推进器注入 ref：提交工具结果 / 确认时手动开启新一轮
  useEffect(() => {
    beginUserTurnRef.current = beginUserTurn;
  }, [beginUserTurn]);

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 复制文本
  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    addNotification('success', '已复制到剪贴板');
  };

  // 获取输入优先展示字段
  const getInputPreview = (input: string) => {
    try {
      const parsed = JSON.parse(input);
      return parsed.path || parsed.target || parsed.url || input;
    } catch {
      return input;
    }
  };

  // 追问问卷 / 工具确认：按轮次渲染，找不到归属轮次时兜底在底部
  const turnIdSet = new Set(turns.map(t => t.turnId));
  // 最新轮次：只有它可能仍在进行，用于「过程」时间线的自动展开 / 收起
  const lastTurnId = turns.length > 0 ? turns[turns.length - 1].turnId : 0;
  const activeQuestionnaire = followupQuestionnaire && followupQuestionnaire.status === 'pending'
    ? followupQuestionnaire
    : null;
  const allQuestionsAnswered = activeQuestionnaire
    ? activeQuestionnaire.questions.every(q => Boolean(activeQuestionnaire.answers[q.question]))
    : false;
  const pendingConfirmations = toolConfirmations.filter(tc => tc.status === 'pending');

  const renderQuestionnaire = (turnId?: number) => {
    if (!activeQuestionnaire) return null;
    if (turnId !== undefined && activeQuestionnaire.turnId !== turnId) return null;
    return (
      <Card className="mb-3 rounded-xl border-border bg-secondary/30 p-4">
        <h3 className="mb-3 flex items-center gap-2 font-medium text-foreground">
          <Sparkles className="h-4 w-4 text-skill" />
          追问问卷
        </h3>
        {activeQuestionnaire.questions.map((q, qIndex) => (
          <div key={qIndex} className="mb-4">
            <p className="mb-2 text-sm font-medium text-foreground">
              {qIndex + 1}. {q.question}
            </p>
            <div className="flex flex-wrap gap-2">
              {q.options.map((option, oIndex) => {
                const optionValue = typeof option === 'string' ? option : (option.value || option.label || '');
                const optionLabel = typeof option === 'string' ? option : (option.label || option.value || '');
                const selected = activeQuestionnaire.answers[q.question] === optionValue;
                return (
                  <Button
                    key={oIndex}
                    size="sm"
                    variant={selected ? 'default' : 'outline'}
                    className="gap-1.5"
                    onClick={() => {
                      setFollowupQuestionnaire(prev => prev ? {
                        ...prev,
                        answers: { ...prev.answers, [q.question]: optionValue },
                      } : null);
                    }}
                  >
                    {selected && <Check className="h-3.5 w-3.5" />}
                    {optionLabel}
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
        <Button
          size="sm"
          onClick={submitFollowupQuestionnaire}
          disabled={!allQuestionsAnswered}
        >
          提交答案
        </Button>
      </Card>
    );
  };

  const renderConfirmationCard = (confirmation: ToolConfirmation) => (
    <Card key={confirmation.toolCallId} className="mb-3 rounded-xl border-border bg-secondary/30 p-4">
      <div className="mb-2 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-warning" />
        <span className="font-medium text-foreground">
          需要确认: {confirmation.toolName}
        </span>
      </div>
      <div className="mb-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">输入: </span>
        {getInputPreview(JSON.stringify(confirmation.input))}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => submitToolConfirmation(confirmation.toolCallId, confirmation.toolName, true)}
        >
          允许
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => submitToolConfirmation(confirmation.toolCallId, confirmation.toolName, false)}
        >
          拒绝
        </Button>
      </div>
    </Card>
  );

  // 身份信息（收进 hover 展开的小徽标，不占主视线）
  const renderIdentityField = (field: 'userId' | 'sessionId', label: string) => {
    const editing = editingIdentityField === field;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          {!editing && (
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditIdentity(field)} title={`编辑${label}`}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyText(identity[field])} title={`复制${label}`}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={identityDraft}
              onChange={e => setIdentityDraft(e.target.value)}
              onBlur={commitEditIdentity}
              onKeyDown={handleIdentityKeyDown}
              className="min-w-0 flex-1 rounded-md border border-primary/40 bg-background px-2 py-1.5 font-mono text-xs outline-none"
            />
            <Button variant="ghost" size="icon" className="h-7 w-7" onMouseDown={e => e.preventDefault()} onClick={commitEditIdentity} title="确认">
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <code className="block w-full truncate rounded-md bg-muted px-2 py-1.5 font-mono text-xs text-muted-foreground">
            {identity[field]}
          </code>
        )}
      </div>
    );
  };
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <a
        href="#chat-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-card focus:ring-2 focus:ring-ring"
      >
        跳到对话区
      </a>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <h1 className="text-sm font-semibold tracking-tight">智能体工作台</h1>
          <span className={`ml-1 hidden items-center gap-1.5 rounded-full border border-border/60 bg-card px-2 py-0.5 text-[11px] text-muted-foreground sm:inline-flex`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-success' : 'bg-muted-foreground/50'}`} />
            {isConnected ? '已连接' : '未连接'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 lg:hidden"
            onClick={() => setShowToc(true)}
            title="会话导航"
            aria-label="会话导航"
          >
            <Menu className="h-4 w-4" />
          </Button>

          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" title="身份信息" aria-label="身份信息">
                <User className="h-4 w-4" />
              </Button>
            </HoverCardTrigger>
            <HoverCardContent align="end" className="w-72">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">身份信息</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={resetIdentity} title="重置身份">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {renderIdentityField('userId', '用户ID')}
                {renderIdentityField('sessionId', '会话ID')}
              </div>
            </HoverCardContent>
          </HoverCard>

          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setShowTrace(!showTrace)} title="TRACE 调试">
            <Eye className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={resetIdentity} title="重置身份">
            <RotateCcw className="h-4 w-4" />
          </Button>

          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggleTheme} title={isDark ? '浅色模式' : '深色模式'}>
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden" id="chat-main">
        <SessionSidebar className="hidden lg:flex" />
        <TurnAnchorRail
          turns={turns}
          activeTurnId={activeTurnId}
          onSelect={scrollToTurn}
          className="hidden lg:flex"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1" ref={scrollAreaRef}>
            <div className="mx-auto w-full max-w-3xl px-4 py-6">
              {messages.length === 0 && !sseRunning && (
                <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
                    <Bot className="h-8 w-8" />
                  </div>
                  <p className="text-sm">开始一段对话</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">输入消息，让智能体为你处理事务与信息查询</p>
                </div>
              )}

              {turns.map(turn => (
                <div
                  key={turn.turnId}
                  id={`turn-${turn.turnId}`}
                  data-turn-id={turn.turnId}
                  className="mb-6 scroll-mt-20"
                >
                  {turn.turnId > 0 && (
                    <div className="mb-4 flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs text-muted-foreground">第 {turn.turnId} 轮</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}

                  {turn.messages
                    .filter(m => m.type === 'user')
                    .map(message => (
                      <div key={message.id} className="mb-4 flex justify-end animate-message-in">
                        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-soft sm:max-w-[80%]">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                          {message.isStreaming && (
                            <span className="ml-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary-foreground/70 align-middle" />
                          )}
                        </div>
                      </div>
                    ))}

                  <ProcessTimeline
                    steps={buildTurnSteps(turn)}
                    isActive={turn.turnId === lastTurnId && (isRunning || sseRunning)}
                  />

                  {renderQuestionnaire(turn.turnId)}

                  {pendingConfirmations.filter(tc => tc.turnId === turn.turnId).map(renderConfirmationCard)}

                  {turn.messages
                    .filter(m => m.type === 'assistant')
                    .map(message => (
                      <div key={message.id} className="mb-5 animate-message-in">
                        <div className="mb-1.5 flex items-center gap-2 text-muted-foreground">
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Bot className="h-3 w-3" />
                          </span>
                          <span className="text-[11px] font-medium">智能体</span>
                        </div>
                        <Markdown
                          content={message.isStreaming ? `${message.content}▍` : message.content}
                          className="break-words"
                        />
                      </div>
                    ))}
                </div>
              ))}

              {pendingUserMessages.map(pending => (
                <div key={pending.id} className="mb-4 flex justify-end animate-message-in">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/80 px-4 py-2.5 text-primary-foreground opacity-70 shadow-soft sm:max-w-[80%]">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{pending.content}</p>
                  </div>
                </div>
              ))}

              {sseRunning && messages.length === 0 && (
                <div className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>正在处理...</span>
                </div>
              )}

              {activeQuestionnaire && (activeQuestionnaire.turnId == null || !turnIdSet.has(activeQuestionnaire.turnId)) && (
                <div>{renderQuestionnaire()}</div>
              )}
              {pendingConfirmations.some(tc => tc.turnId == null || !turnIdSet.has(tc.turnId)) && (
                <div>
                  {pendingConfirmations
                    .filter(tc => tc.turnId == null || !turnIdSet.has(tc.turnId))
                    .map(renderConfirmationCard)}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          <div className="border-t border-border/60 bg-background/80 px-4 pb-4 pt-3 backdrop-blur">
            <div className="mx-auto w-full max-w-3xl">
              <div className="rounded-2xl border border-border bg-card p-2 shadow-float">
                <div className="flex items-end gap-2">
                  <Textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入消息..."
                    rows={1}
                    className="min-h-[44px] max-h-[160px] flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-sm shadow-none focus-visible:ring-0"
                  />
                  {sseRunning ? (
                    <Button variant="destructive" className="h-11 shrink-0 px-4" onClick={stopGeneration}>
                      <Square className="h-4 w-4" />
                      <span className="ml-1.5">停止</span>
                    </Button>
                  ) : (
                    <Button className="h-11 w-11 shrink-0" onClick={sendMessage} disabled={!inputValue.trim()} title="发送" aria-label="发送">
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center justify-between gap-4 px-1 pt-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Switch id="deep-thinking" checked={deepThinking} onCheckedChange={setDeepThinking} />
                    <Label htmlFor="deep-thinking" className="cursor-pointer text-xs">深度思考</Label>
                  </div>
                  <span className="hidden sm:block">Enter 发送 · Shift+Enter 换行</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {showTrace && (
          <div className="flex w-80 flex-col border-l border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-sm font-medium">TRACE 调试</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowTrace(false)}>
                <EyeOff className="h-3.5 w-3.5" />
              </Button>
            </div>
            <ScrollArea className="min-h-0 flex-1 p-2" ref={traceScrollRef}>
              {traceEntries.map(entry => (
                <div key={entry.id} className="border-b border-border/60 p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[11px]">{entry.type}</Badge>
                    <span className="text-muted-foreground">{entry.summary}</span>
                  </div>
                  {Boolean(entry.payload) && (
                    <Collapsible className="mt-1">
                      <CollapsibleTrigger className="text-xs text-skill hover:text-skill/80">详情</CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre className="mt-1 max-h-32 overflow-x-auto rounded-md bg-secondary p-1.5 font-mono text-xs">
                          {JSON.stringify(entry.payload, null, 2)}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
              ))}
            </ScrollArea>
          </div>
        )}
      </div>

      <Sheet open={showToc} onOpenChange={setShowToc}>
        <SheetContent side="left" className="w-60 p-0">
          <SheetTitle className="sr-only">项目与历史对话</SheetTitle>
          <SessionSidebar className="h-full w-full border-r-0" />
        </SheetContent>
      </Sheet>

      {notifications.length > 0 && (
        <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2">
          {notifications.map(notification => (
            <div
              key={notification.id}
              className={`rounded-xl px-4 py-2.5 text-sm text-white shadow-card ${
                notification.type === 'error'
                  ? 'bg-destructive'
                  : notification.type === 'success'
                    ? 'bg-success'
                    : notification.type === 'warning'
                      ? 'bg-warning'
                      : 'bg-foreground'
              }`}
            >
              {notification.message}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="fixed left-1/2 top-20 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm text-white shadow-card">
          <AlertCircle className="h-4 w-4" />
          {error}
          <Button
            variant="ghost"
            size="icon"
            className="ml-1 h-6 w-6 text-white hover:bg-white/20 hover:text-white"
            onClick={() => setError(null)}
          >
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}