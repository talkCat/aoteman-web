'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronDown, ChevronUp, Send, Square, RotateCcw, Moon, Sun, Bot, User, Wrench, Sparkles, MessageSquareText, AlertCircle, CheckCircle, XCircle, Loader2, Trash2, Copy, Eye, EyeOff, Pencil, Check } from 'lucide-react';

// 生成随机 ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// 工具名称映射
const TOOL_NAME_MAP: Record<string, string> = {
  ask_followup_questions: '追问问卷',
};

export default function AgentChatPage() {
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

  // 通知
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // 状态
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 输入
  const [inputValue, setInputValue] = useState('');
  const [deepThinking, setDeepThinking] = useState(false);

  // 主题
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

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

  // 切换主题
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

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

  // 获取工具名称显示
  const getToolDisplayName = (name: string) => {
    return TOOL_NAME_MAP[name] || name;
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

  // 一轮内的中间过程步骤（模型叙述 + 工具调用），统一按时序渲染
  type TurnStep =
    | { kind: 'narration'; key: string; seq?: number; timestamp: number; narration: Narration }
    | { kind: 'tool'; key: string; seq?: number; timestamp: number; tool: ToolUse };

  // 按落盘 seq 排序（缺失时按时间戳兜底），还原真实的「叙述 → 工具 → 叙述 → 工具」时序
  const buildTurnSteps = (turn: TurnGroup): TurnStep[] => {
    const steps: TurnStep[] = [
      ...turn.narrations.map(n => ({
        kind: 'narration' as const,
        key: 'n:' + n.id,
        seq: n.seq,
        timestamp: n.timestamp ?? 0,
        narration: n,
      })),
      ...turn.toolUses.map(t => ({
        kind: 'tool' as const,
        key: 't:' + t.id,
        seq: t.seq,
        timestamp: t.timestamp ?? 0,
        tool: t,
      })),
    ];
    return steps.sort((a, b) => {
      const sa = a.seq ?? Number.MAX_SAFE_INTEGER;
      const sb = b.seq ?? Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      return a.timestamp - b.timestamp;
    });
  };

  // 追问问卷 / 工具确认：按轮次渲染，找不到归属轮次时兜底在底部
  const turnIdSet = new Set(turns.map(t => t.turnId));
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
      <Card className="p-4 mb-3 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
        <h3 className="font-medium text-green-800 dark:text-green-200 mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          追问问卷
        </h3>
        {activeQuestionnaire.questions.map((q, qIndex) => (
          <div key={qIndex} className="mb-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                    onClick={() => {
                      setFollowupQuestionnaire(prev => prev ? {
                        ...prev,
                        answers: { ...prev.answers, [q.question]: optionValue },
                      } : null);
                    }}
                  >
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
    <Card key={confirmation.toolCallId} className="p-4 mb-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <span className="font-medium text-amber-800 dark:text-amber-200">
          需要确认: {confirmation.toolName}
        </span>
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
        <span className="font-medium">输入: </span>
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

  return (
    <div className={`min-h-screen flex flex-col ${theme === 'dark' ? 'dark' : ''}`}>
      <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {/* 顶部栏 */}
        <header className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Bot className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h1 className="text-lg font-semibold">智能体对话</h1>
            <Badge variant={isConnected ? 'default' : 'secondary'} className="text-xs">
              {isConnected ? '已连接' : '未连接'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={toggleTheme}>
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowTrace(!showTrace)}>
              <Eye className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={resetIdentity}>
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* 身份信息栏 */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 bg-gray-100 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 dark:text-gray-400">用户ID:</span>
            {editingIdentityField === 'userId' ? (
              <>
                <input
                  autoFocus
                  value={identityDraft}
                  onChange={e => setIdentityDraft(e.target.value)}
                  onBlur={commitEditIdentity}
                  onKeyDown={handleIdentityKeyDown}
                  className="bg-white dark:bg-gray-900 border border-blue-400 rounded px-2 py-0.5 w-44 text-xs outline-none"
                />
                <Button variant="ghost" size="icon" className="h-6 w-6" onMouseDown={e => e.preventDefault()} onClick={commitEditIdentity} title="确认">
                  <Check className="w-3 h-3" />
                </Button>
              </>
            ) : (
              <>
                <code className="bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">{identity.userId}</code>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEditIdentity('userId')} title="编辑用户ID">
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyText(identity.userId)} title="复制用户ID">
                  <Copy className="w-3 h-3" />
                </Button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 dark:text-gray-400">会话ID:</span>
            {editingIdentityField === 'sessionId' ? (
              <>
                <input
                  autoFocus
                  value={identityDraft}
                  onChange={e => setIdentityDraft(e.target.value)}
                  onBlur={commitEditIdentity}
                  onKeyDown={handleIdentityKeyDown}
                  className="bg-white dark:bg-gray-900 border border-blue-400 rounded px-2 py-0.5 w-44 text-xs outline-none"
                />
                <Button variant="ghost" size="icon" className="h-6 w-6" onMouseDown={e => e.preventDefault()} onClick={commitEditIdentity} title="确认">
                  <Check className="w-3 h-3" />
                </Button>
              </>
            ) : (
              <>
                <code className="bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">{identity.sessionId}</code>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEditIdentity('sessionId')} title="编辑会话ID">
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyText(identity.sessionId)} title="复制会话ID">
                  <Copy className="w-3 h-3" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* 主内容区 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 对话区域 */}
          <div className="flex-1 flex flex-col">
            <ScrollArea className="flex-1 p-4">
              {/* 空状态 */}
              {messages.length === 0 && !sseRunning && (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
                  <Bot className="w-16 h-16 mb-4 opacity-50" />
                  <p>发送一条消息开始对话</p>
                </div>
              )}


              {/* 按轮次渲染对话 */}
              {turns.map((turn) => (
                <div key={turn.turnId} className="mb-6">
                  {/* 轮次分隔线 */}
                  {turn.turnId > 0 && (
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                      <span className="text-xs text-gray-400 dark:text-gray-500">第 {turn.turnId} 轮</span>
                      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                    </div>
                  )}

                  {/* 该轮的用户消息 */}
                  {turn.messages.filter(m => m.type === 'user').map((message) => (
                    <div key={message.id} className={'flex justify-end mb-4'}>
                      <div className="flex items-start gap-3 max-w-[80%]">
                        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-white" />
                        </div>
                        <div className="text-right max-w-[70%]">
                          <div className="inline-block px-4 py-2 rounded-lg bg-blue-500 text-white">
                            <p className="whitespace-pre-wrap">{message.content}</p>
                            {message.isStreaming && (
                              <span className="inline-block w-2 h-4 bg-white/60 animate-pulse ml-1" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* 该轮的思考过程 */}
                  {turn.thinking.length > 0 && (
                    <div className="mb-3">
                      <Collapsible defaultOpen={false}>
                        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                          <div className="w-0.5 h-4 bg-purple-300 dark:bg-purple-700 rounded-full" />
                          <Sparkles className="w-3 h-3" />
                          <span>思考过程</span>
                          <ChevronDown className="w-3 h-3" />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="ml-2.5 pl-3 border-l-2 border-purple-200 dark:border-purple-800 text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap py-1">
                            {turn.thinking.map(t => t.content).join('')}
                            {turn.thinking.some(t => t.isStreaming) && (
                              <span className="inline-block w-1.5 h-3 bg-purple-300 animate-pulse ml-0.5 align-middle" />
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  )}

                  {/* 该轮的中间过程：模型叙述与工具调用按落盘时序统一排列 */}
                  {buildTurnSteps(turn).map(step =>
                    step.kind === 'narration' ? (
                      <div key={step.key} className="ml-2.5 mb-3 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500 mb-1">
                          <MessageSquareText className="w-3 h-3" />
                          <span>过程</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap">
                          {step.narration.content}
                        </p>
                      </div>
                    ) : (
                    <Card key={step.tool.id} className="p-4 mb-3 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 mb-2">
                        {step.tool.type === 'tool' ? (
                          <Wrench className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        )}
                        <span className="font-medium text-blue-800 dark:text-blue-200">
                          {step.tool.type === 'tool' ? '工具调用' : '技能调用'}: {getToolDisplayName(step.tool.name)}
                        </span>
                        {step.tool.status === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
                        {step.tool.status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
                        {step.tool.status === 'pending' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                      </div>
                      {step.tool.input && (
                        <Collapsible defaultOpen={false}>
                          <CollapsibleTrigger className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                            <ChevronDown className="w-3 h-3 inline mr-1" />
                            输入参数
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <pre className="mt-2 p-2 bg-white dark:bg-gray-800 rounded text-xs overflow-x-auto">
                              {step.tool.input}
                            </pre>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                      {step.tool.output && (() => {
                        const isLongOutput = step.tool.output.length > 200;
                        return (
                          <Collapsible className="mt-2" defaultOpen={!isLongOutput}>
                            <CollapsibleTrigger className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                              <ChevronDown className="w-3 h-3 inline mr-1" />
                              输出结果{isLongOutput ? ' (' + step.tool.output.length + ' 字符)' : ''}
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <pre className="mt-2 p-2 bg-white dark:bg-gray-800 rounded text-xs overflow-x-auto max-h-48">
                                {isLongOutput ? step.tool.output.slice(0, 200) + '\n... (点击展开剩余内容)' : step.tool.output}
                              </pre>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })()}
                    </Card>
                    )
                  )}

                  {/* 该轮的追问问卷（按轮次渲染，保持时序） */}
                  {renderQuestionnaire(turn.turnId)}

                  {/* 该轮的工具确认（按轮次渲染，保持时序） */}
                  {pendingConfirmations.filter(tc => tc.turnId === turn.turnId).map(renderConfirmationCard)}

                  {/* 该轮的 AI 回复 */}
                  {turn.messages.filter(m => m.type === 'assistant').map((message) => (
                    <div key={message.id} className="flex justify-start mb-4">
                      <div className="flex items-start gap-3 max-w-[80%]">
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                        </div>
                        <div className="max-w-[70%]">
                          <div className="inline-block px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                            <p className="whitespace-pre-wrap">{message.content}</p>
                            {message.isStreaming && (
                              <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-1" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                </div>
              ))}

              {/* 本地乐观显示的用户消息（SSE 回显到达后移除） */}
              {pendingUserMessages.map((pending) => (
                <div key={pending.id} className="flex justify-end mb-4">
                  <div className="flex items-start gap-3 max-w-[80%]">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <div className="text-right max-w-[70%]">
                      <div className="inline-block px-4 py-2 rounded-lg bg-blue-500 text-white opacity-70">
                        <p className="whitespace-pre-wrap">{pending.content}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

{/* 加载指示器 */}
              {sseRunning && messages.length === 0 && (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在处理...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            
            {/* 兜底：未归属到具体轮次的追问问卷 / 工具确认 */}
            {activeQuestionnaire && (activeQuestionnaire.turnId == null || !turnIdSet.has(activeQuestionnaire.turnId)) && (
              <div className="px-4">
                {renderQuestionnaire()}
              </div>
            )}
            {pendingConfirmations.some(tc => tc.turnId == null || !turnIdSet.has(tc.turnId)) && (
              <div className="px-4">
                {pendingConfirmations
                  .filter(tc => tc.turnId == null || !turnIdSet.has(tc.turnId))
                  .map(renderConfirmationCard)}
              </div>
            )}
            </ScrollArea>

            {/* 输入区 */}
            <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-end gap-3">
                <div className="flex-1 relative">
                  <Textarea
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入消息..."
                    className="min-h-[44px] max-h-[200px] resize-none pr-12"
                    rows={1}
                  />
                  <div className="absolute bottom-2 right-2 flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setDeepThinking(!deepThinking)}
                    >
                      <Sparkles className={`w-4 h-4 ${deepThinking ? 'text-purple-500' : ''}`} />
                    </Button>
                  </div>
                </div>
                {sseRunning ? (
                  <Button variant="destructive" onClick={stopGeneration}>
                    <Square className="w-4 h-4" />
                    停止
                  </Button>
                ) : (
                  <Button onClick={sendMessage} disabled={!inputValue.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <div className="flex items-center gap-2">
                  <Switch
                    id="deep-thinking"
                    checked={deepThinking}
                    onCheckedChange={setDeepThinking}
                  />
                  <Label htmlFor="deep-thinking" className="cursor-pointer">
                    深度思考
                  </Label>
                </div>
                <span>Enter 发送, Shift+Enter 换行</span>
              </div>
            </div>
          </div>

          {/* TRACE 面板 */}
          {showTrace && (
            <div className="w-80 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                <span className="font-medium text-sm">TRACE 调试</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowTrace(false)}>
                  <EyeOff className="w-3 h-3" />
                </Button>
              </div>
              <ScrollArea className="flex-1 p-2" ref={traceScrollRef}>
                {traceEntries.map(entry => (
                  <div key={entry.id} className="text-xs p-2 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{entry.type}</Badge>
                      <span className="text-gray-500">{entry.summary}</span>
                    </div>
                    {Boolean(entry.payload) && (
                      <Collapsible className="mt-1">
                        <CollapsibleTrigger className="text-xs text-blue-500 hover:text-blue-600">
                          详情
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <pre className="mt-1 p-1 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-x-auto max-h-32">
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

        {/* 通知区域 */}
        {notifications.length > 0 && (
          <div className="fixed bottom-20 right-4 flex flex-col gap-2 z-50">
            {notifications.map(notification => (
              <div
                key={notification.id}
                className={`px-4 py-2 rounded-lg shadow-lg text-sm ${
                  notification.type === 'error' ? 'bg-red-500 text-white' :
                  notification.type === 'success' ? 'bg-green-500 text-white' :
                  notification.type === 'warning' ? 'bg-amber-500 text-white' :
                  'bg-gray-800 text-white'
                }`}
              >
                {notification.message}
              </div>
            ))}
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-red-500 text-white rounded-lg shadow-lg text-sm z-50">
            <AlertCircle className="w-4 h-4 inline mr-2" />
            {error}
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 h-6 text-white hover:text-white hover:bg-red-600"
              onClick={() => setError(null)}
            >
              <XCircle className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
