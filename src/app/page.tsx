'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useSSEStream } from '@/hooks/useSSEStream';
import { normalizeFollowupInput } from '@/lib/followup';
import type { Identity, Message, Thinking, Narration, ToolUse, ToolConfirmation, FollowupQuestionnaire, FollowupAnswer, Notification, TurnGroup } from '@/types/agent';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { SessionSidebar } from '@/components/SessionSidebar';
import { TurnAnchorRail } from '@/components/TurnAnchorRail';
import { Markdown } from '@/components/Markdown';
import { ChatHero } from '@/components/chat/ChatHero';
import { MessageComposer } from '@/components/chat/MessageComposer';
import { UserMessageExperts } from '@/components/chat/UserMessageExperts';
import { CitationList } from '@/components/chat/CitationList';
import { CitationSheet } from '@/components/chat/CitationSheet';
import { UserMenu } from '@/components/UserMenu';
import { SkillMarketPanel } from '@/components/SkillMarketPanel';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useSessions } from '@/hooks/useSessions';
import { useExpertSelection } from '@/hooks/useExpertSelection';
import { citationsForTurn } from '@/lib/citation-demo';
import { mergeCitations } from '@/lib/citation-order';
import {
  CHAT_PREVIEW_STORAGE_KEY,
  CHAT_PREVIEW_USER,
  buildDemoConversation,
  buildDemoReply,
} from '@/lib/chat-demo';
import {
  disableDevPreviewCookie,
  enableDevPreviewCookie,
  hasDevPreviewCookie,
} from '@/lib/dev-preview';
import { DEMO_ARTIFACTS } from '@/lib/artifact-demo';
import type { Citation } from '@/types/citation';
import type { ExpertRef } from '@/types/knowledge';
import { getLastSessionId, setLastSessionId } from '@/lib/session';
import { TurnArtifacts } from '@/components/TurnArtifacts';
import { ArtifactCanvas } from '@/components/artifacts/ArtifactCanvas';
import { fetchArtifacts, isArtifactWrite, matchTurnArtifacts, type ArtifactItem } from '@/lib/artifacts';
import { cn } from '@/lib/utils';
import { ChevronDown, Moon, Sun, Bot, User, Wrench, Sparkles, AlertCircle, XCircle, Loader2, Check, Menu, Store, FlaskConical, ArrowLeft, Database, Plug } from 'lucide-react';

// 生成随机 ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// 空引用数组必须保持稳定身份：Markdown 用 citations 推导插件，数组每次换新会重建徽标 DOM。
const EMPTY_CITATIONS: Citation[] = [];

// 回答正文里是否至少标注了一个本轮真实存在的引用（决定参考资料区的标题文案）。
// 只认 [K*] 字面量，避免把编造的 [K9] 当作已标注。
function hasCitationAnnotation(content: string, citations: Citation[]): boolean {
  if (!content || citations.length === 0) return false;
  const upper = content.toUpperCase();
  return citations.some((citation) => upper.includes(`[${citation.ref.toUpperCase()}]`));
}

﻿// 工具名称映射：把后端工具标识换成用户能读懂的动作用语
const TOOL_NAME_MAP: Record<string, string> = {
  ask_followup_questions: '追问问卷',
  knowledge_search: '知识库检索',
  web_search: '联网搜索',
};

// 获取工具名称显示
const getToolDisplayName = (name: string) => TOOL_NAME_MAP[name] || name;

// 一轮内的中间过程步骤（思考 / 叙述 / 工具调用 / 用户确认），统一按时序渲染
type TurnStep =
  | { kind: 'thinking'; key: string; seq?: number; timestamp: number; thinking: Thinking }
  | { kind: 'narration'; key: string; seq?: number; timestamp: number; narration: Narration }
  | { kind: 'answer'; key: string; seq?: number; timestamp: number; answer: FollowupAnswer }
  | { kind: 'tool'; key: string; seq?: number; timestamp: number; tool: ToolUse };

// 按落盘 seq 排序（缺失时按时间戳兜底），还原真实的「思考 → 叙述 → 工具 → 确认」时序
function buildTurnSteps(turn: TurnGroup): TurnStep[] {
  const steps: TurnStep[] = [
    ...turn.thinking.map(t => ({ kind: 'thinking' as const, key: 'k:' + t.id, seq: t.seq, timestamp: t.timestamp ?? 0, thinking: t })),
    ...turn.narrations.map(n => ({ kind: 'narration' as const, key: 'n:' + n.id, seq: n.seq, timestamp: n.timestamp ?? 0, narration: n })),
    ...turn.toolUses.map(t => ({ kind: 'tool' as const, key: 't:' + t.id, seq: t.seq, timestamp: t.timestamp ?? 0, tool: t })),
    ...turn.answers.map(a => ({ kind: 'answer' as const, key: 'a:' + a.id, seq: a.seq, timestamp: a.timestamp ?? 0, answer: a })),
  ];
  return steps.sort((a, b) => {
    const sa = a.seq ?? Number.MAX_SAFE_INTEGER;
    const sb = b.seq ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.timestamp - b.timestamp;
  });
}

/* ---------------- 工具调用摘要 ---------------- */

type ToolTone = 'rag' | 'mcp' | 'skill' | 'tool';

// 工具入参里最像「主参数」的字段，用于折叠态直接显示「做了什么」
const TOOL_ARG_KEYS = ['path', 'file_path', 'file', 'target', 'url', 'query', 'pattern', 'prompt', 'command', 'name'];

/**
 * 识别工具能力类型，对应原型工具卡左侧图标与 RAG / MCP 标签。
 * 只按工具名与事件类型判断，不猜测后端语义。
 */
function getToolCapability(name: string, type: ToolUse['type']): { label: string; tone: ToolTone } {
  const lower = (name || '').toLowerCase();
  if (lower.includes('knowledge') || lower.includes('retrieval') || lower.includes('rag')) {
    return { label: 'RAG', tone: 'rag' };
  }
  if (lower.startsWith('mcp') || lower.includes('mcp_') || lower.includes('mcp.')) {
    return { label: 'MCP', tone: 'mcp' };
  }
  if (type === 'skill') return { label: '技能', tone: 'skill' };
  return { label: '工具', tone: 'tool' };
}

function parseJsonObject(raw?: string): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickString(source: Record<string, unknown> | null, keys: string[]): string | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim().replace(/\s+/g, ' ');
  }
  return undefined;
}

function truncateText(text: string, max = 90): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

type ToolDigest = {
  title: string;
  capability: { label: string; tone: ToolTone };
  /** 工具卡的查询 / 入参摘要行 */
  subtitle?: string;
  /** 命中结果摘要行；解析不出来就留空，不编造数字 */
  result?: string;
};

/**
 * 从 tool_use / tool_result 载荷提炼工具卡要展示的三层信息。
 *
 * <p>知识库检索的返回体形如 { context, citations[], degraded }，据此给出命中数与最高相关度；
 * 其它工具只识别通用字段（summary / total / items 等），识别不到就保持空白。
 */
function digestTool(tool: ToolUse): ToolDigest {
  const capability = getToolCapability(tool.name, tool.type);
  const title = getToolDisplayName(tool.name);
  const input = parseJsonObject(tool.input);
  const output = parseJsonObject(tool.output);
  const rawQuery = pickString(input, ['query', 'q', 'question', 'search_query', 'keyword', ...TOOL_ARG_KEYS]);

  if (tool.status === 'error') {
    const raw = (tool.output || '').trim().replace(/\s+/g, ' ');
    return { title, capability, subtitle: rawQuery, result: raw ? truncateText(raw) : '调用失败' };
  }

  if (capability.tone === 'rag' && output) {
    const citations = Array.isArray(output.citations) ? (output.citations as Record<string, unknown>[]) : [];
    if (citations.length === 0) {
      return { title, capability, subtitle: rawQuery, result: '未命中相关片段' };
    }
    const scores = citations
      .map(citation => Number(citation.rerankScore ?? citation.vectorScore))
      .filter(score => Number.isFinite(score) && score > 0);
    const best = scores.length > 0 ? Math.max(...scores) : undefined;
    const kbName = typeof citations[0]?.kbName === 'string' ? (citations[0].kbName as string) : undefined;
    const subtitle = [kbName, rawQuery ? `“${rawQuery}”` : undefined].filter(Boolean).join(' · ');
    const result = [
      `命中 ${citations.length} 个片段`,
      best !== undefined ? `相关度 ${best.toFixed(2)}` : undefined,
      output.degraded === true ? '向量排序兜底' : undefined,
    ]
      .filter(Boolean)
      .join(' · ');
    return { title, capability, subtitle: subtitle || rawQuery, result };
  }

  if (output) {
    const explicit = pickString(output, ['summary', 'message', 'detail']);
    if (explicit) return { title, capability, subtitle: rawQuery, result: truncateText(explicit) };
    for (const key of ['total', 'count', 'size']) {
      const count = Number(output[key]);
      if (Number.isFinite(count)) return { title, capability, subtitle: rawQuery, result: `返回 ${count} 条结果` };
    }
    for (const key of ['items', 'results', 'data', 'list', 'hits']) {
      const list = output[key];
      if (Array.isArray(list)) return { title, capability, subtitle: rawQuery, result: `返回 ${list.length} 条结果` };
    }
    return { title, capability, subtitle: rawQuery };
  }

  const raw = (tool.output || '').trim().replace(/\s+/g, ' ');
  return { title, capability, subtitle: rawQuery, result: raw ? truncateText(raw) : undefined };
}

function ToolToneIcon({ tone }: { tone: ToolTone }) {
  if (tone === 'rag') return <Database aria-hidden="true" />;
  if (tone === 'mcp') return <Plug aria-hidden="true" />;
  if (tone === 'skill') return <Sparkles aria-hidden="true" />;
  return <Wrench aria-hidden="true" />;
}

/**
 * 单个工具 / 技能调用：原型式块状卡片。
 *
 * <p>默认展示「图标 + 名称 + 状态 + 能力标签 + 入参摘要 + 命中结果 + 真实耗时」，
 * 点击右侧箭头才展开原始输入 / 输出，避免调试信息淹没过程。
 */
function ToolCard({ tool }: { tool: ToolUse }) {
  const [open, setOpen] = useState(false);
  const digest = digestTool(tool);
  const hasRaw = Boolean(tool.input || tool.output);
  // 只有同时拿到开始与结束的落盘时间才显示耗时，缺一个就不显示，避免编造
  const durationMs =
    tool.startedAt && tool.finishedAt && tool.finishedAt >= tool.startedAt
      ? tool.finishedAt - tool.startedAt
      : undefined;
  const statusLabel = tool.status === 'success' ? '已完成' : tool.status === 'error' ? '失败' : '运行中';

  return (
    <div className="tool-card">
      <span className={'tool-icon tone-' + digest.capability.tone}>
        <ToolToneIcon tone={digest.capability.tone} />
      </span>
      <div className="tool-main">
        <div className="tool-head">
          <span className="tool-head-name">{digest.title}</span>
          <span
            className={cn(
              'tool-state',
              tool.status === 'success' && 'is-done',
              tool.status === 'error' && 'is-error'
            )}
          >
            {tool.status === 'pending' ? (
              <i className="tool-dot" aria-hidden="true" />
            ) : (
              <Check className="h-2.5 w-2.5" aria-hidden="true" />
            )}
            {statusLabel}
          </span>
          <span
            className={cn(
              'process-tag tool-tag',
              digest.capability.tone === 'rag' && 'is-rag',
              digest.capability.tone === 'mcp' && 'is-mcp'
            )}
          >
            {digest.capability.label}
          </span>
        </div>
        {digest.subtitle && <p className="tool-line">{digest.subtitle}</p>}
        {digest.result && <div className="tool-result">{digest.result}</div>}
      </div>
      <div className="tool-side">
        {durationMs !== undefined && <span className="tool-time">{(durationMs / 1000).toFixed(2)}s</span>}
        {hasRaw && (
          <button
            type="button"
            onClick={() => setOpen(prev => !prev)}
            aria-expanded={open}
            className="tool-toggle"
            aria-label={open ? '收起调用详情' : '展开调用详情'}
          >
            <ChevronDown className={open ? 'rotate-180' : ''} aria-hidden="true" />
          </button>
        )}
      </div>
      {hasRaw && open && (
        <div className="tool-raw">
          {tool.input && (
            <div>
              <div className="tool-raw-label">入参</div>
              <pre>{tool.input}</pre>
            </div>
          )}
          {tool.output && (
            <div>
              <div className="tool-raw-label">
                输出{tool.output.length > 200 ? ` · ${tool.output.length} 字符` : ''}
              </div>
              <pre>{tool.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 一轮内的「过程」卡。
 *
 * <p>思考（thinking）、过程叙述（narration）、工具调用（tool）与用户确认（answer）按落盘 seq
 * 交错成一条时间线，统一收进一张原型式卡片：进行中自动展开并显示「正在思考 / 正在调用工具」，
 * 结束后自动收起为「已完成思考 · 耗时　N 个步骤 · M 次工具调用」。
 * 用户追问作答不再单独成块，而是作为时间线里的一个已完成「确认」步骤。
 */
function ProcessTimeline({ steps, isActive }: { steps: TurnStep[]; isActive: boolean }) {
  const [open, setOpen] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);

  useEffect(() => {
    if (!manualOverride) setOpen(isActive);
  }, [isActive, manualOverride]);

  if (steps.length === 0) return null;

  const toolCount = steps.filter(step => step.kind === 'tool').length;
  const hasPendingTool = steps.some(step => step.kind === 'tool' && step.tool.status === 'pending');

  // 过程耗时取真实事件时间戳的最小 ~ 最大跨度；拿不到就不显示，不伪造时长
  let durationLabel: string | undefined;
  if (!isActive) {
    const stamps: number[] = [];
    steps.forEach(step => {
      if (step.kind === 'tool') {
        if (step.tool.startedAt) stamps.push(step.tool.startedAt);
        if (step.tool.finishedAt) stamps.push(step.tool.finishedAt);
      }
      if (step.timestamp) stamps.push(step.timestamp);
    });
    if (stamps.length > 1) {
      const span = Math.max(...stamps) - Math.min(...stamps);
      if (span > 200 && span < 30 * 60 * 1000) durationLabel = `${(span / 1000).toFixed(1)}s`;
    }
  }

  const title = isActive ? (hasPendingTool ? '正在调用工具' : '正在思考') : '已完成思考';

  return (
    <div className={cn('process-card mb-4', isActive && 'is-active')}>
      <Collapsible
        open={open}
        onOpenChange={next => {
          setManualOverride(true);
          setOpen(next);
        }}
      >
        <CollapsibleTrigger className="process-head ui-focus-ring group">
          <span className={cn('process-orb', isActive ? 'is-live' : 'is-done')}>
            {isActive ? <Sparkles aria-hidden="true" /> : <Check aria-hidden="true" />}
          </span>
          <span className="process-title">{title}</span>
          {!isActive && durationLabel && <span className="process-duration">· {durationLabel}</span>}
          {isActive && (
            <span className="process-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
          <span className="process-summary">
            {steps.length} 个步骤{toolCount > 0 ? ` · ${toolCount} 次工具调用` : ''}
          </span>
          <ChevronDown
            className={cn('process-chevron h-3.5 w-3.5', open && 'rotate-180')}
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="process-body">
            {steps.map(step => {
              if (step.kind === 'tool') return <ToolCard key={step.key} tool={step.tool} />;

              if (step.kind === 'answer') {
                return (
                  <div key={step.key} className="process-step">
                    <span className="process-state">
                      <Check aria-hidden="true" />
                    </span>
                    <p className="process-text">已确认：{step.answer.content}</p>
                    <span className="process-tag">确认</span>
                  </div>
                );
              }

              const isStreaming = step.kind === 'thinking' && Boolean(step.thinking.isStreaming);
              const content = step.kind === 'thinking' ? step.thinking.content : step.narration.content;
              return (
                <div key={step.key} className={cn('process-step', isStreaming && 'is-live')}>
                  <span className="process-state">
                    {isStreaming ? <span className="process-live-dot" /> : <Check aria-hidden="true" />}
                  </span>
                  <p className="process-text">
                    {content}
                    {isStreaming && (
                      <span className="ml-1 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-thinking align-middle" />
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
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

  // 真实登录用户（BFF /api/auth/me）；未登录 / 控制面不可达时为 null
  const { user: currentUser, ready: authReady } = useCurrentUser();
  const router = useRouter();

  // 是否为 iframe 内嵌（Zoer 预览）：内嵌场景允许匿名使用（设计 §3.6 软守卫）。
  // frameChecked 保证 iframe 判断完成后再决定是否跳转，避免首帧误判。
  const [frameChecked, setFrameChecked] = useState(false);
  const [isEmbedded, setIsEmbedded] = useState(false);
  useEffect(() => {
    setIsEmbedded(window.self !== window.top);
    setFrameChecked(true);
  }, []);

  // 静态预览：控制面 / 数据面未启动时也能走查问答页。带 ?preview=1 进入，
  // 标记存 sessionStorage 供站内跳转保持；生产构建下整段逻辑被裁掉，不影响真实鉴权。
  const [devPreview, setDevPreview] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    try {
      const wantsPreview = new URLSearchParams(window.location.search).get('preview') === '1';
      const stored = window.sessionStorage.getItem(CHAT_PREVIEW_STORAGE_KEY) === '1';
      // query / sessionStorage / 预览 Cookie 任一命中即进入预览，
      // 后两者保证整页刷新和新标签页不会掉回 /login。
      if (wantsPreview || stored || hasDevPreviewCookie()) {
        window.sessionStorage.setItem(CHAT_PREVIEW_STORAGE_KEY, '1');
        enableDevPreviewCookie();
        setDevPreview(true);
        return;
      }
      setDevPreview(false);
    } catch {
      setDevPreview(false);
    }
  }, []);

  // 预览身份只用于展示，不参与任何真实请求
  const activeUser = currentUser ?? (devPreview ? CHAT_PREVIEW_USER : null);

  // 登录态校验失败（未登录 / token 失效 / 身份服务不可达）：顶层页面回登录页。
  // 与 admin/layout.tsx 的页面级守卫保持一致；内嵌场景不跳转，保持 anonymous 可用。
  useEffect(() => {
    if (!authReady || !frameChecked || currentUser || isEmbedded || devPreview) return;
    router.replace('/login');
  }, [authReady, frameChecked, currentUser, isEmbedded, devPreview, router]);

  // 身份状态：userId 来自真实登录用户，sessionId 是本地会话标识
  const [identity, setIdentity] = useState<Identity>({ userId: '', sessionId: '' });

  // 问答页专家多选：最多 5 个、记忆上次选择、只影响下一轮（设计 §10.3）。
  // 数据源是「已发布且已授权」的摘要，不含 systemPrompt。
  const expertSelection = useExpertSelection(identity.userId);

  // 引用详情抽屉：只存 citationId，详情按需查询（设计 §11.4）
  const [citationId, setCitationId] = useState<string | null>(null);
  // 真实引用按轮次聚合：一轮可能有多次 knowledge_search，每个 toolCallId 一个 agent.citation。
  const [citationsByTurn, setCitationsByTurn] = useState<Record<number, Citation[]>>({});
  // 抽屉没有 SheetTrigger，Radix 无法自动把焦点还回去；手动记住触发它的引用按钮
  const citationTriggerRef = useRef<HTMLElement | null>(null);
  const citationTriggerLabelRef = useRef<string | null>(null);
  const openCitation = useCallback((citation: Citation) => {
    if (!citation.citationId) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    citationTriggerRef.current = active;
    citationTriggerLabelRef.current = active?.getAttribute('aria-label') ?? null;
    setCitationId(citation.citationId);
  }, []);
  // 关闭只负责收起抽屉；焦点由 Radix 的 onCloseAutoFocus 在关闭动画结束后交还，
  // 此时遮罩与 aria-hidden 已撤销，提前 focus 会被浏览器判定为「把焦点藏进 aria-hidden」而告警。
  const closeCitation = useCallback(() => {
    setCitationId(null);
  }, []);
  const restoreCitationFocus = useCallback(() => {
    const trigger = citationTriggerRef.current;
    const triggerLabel = citationTriggerLabelRef.current;
    citationTriggerRef.current = null;
    citationTriggerLabelRef.current = null;
    if (trigger?.isConnected) {
      trigger.focus();
      return;
    }
    // 引用数据每次聚合都可能换新对象，徽标会被重新挂载；旧节点脱离文档时按 aria-label 找回同一枚按钮
    if (!triggerLabel) return;
    const fallback = Array.from(document.querySelectorAll<HTMLElement>('button[aria-label]')).find(
      (el) => el.getAttribute('aria-label') === triggerLabel,
    );
    fallback?.focus();
  }, []);

  // 历史会话列表（侧边栏）：走 BFF /api/sessions → 数据面
  const {
    sessions,
    loading: sessionsLoading,
    refresh: refreshSessions,
    remove: removeSession,
    rename: renameSession,
  } = useSessions(devPreview ? '' : identity.userId);

  // 对话消息
  const [messages, setMessages] = useState<Message[]>([]);

  // 本地乐观显示的用户消息：SSE 回显到达前先展示，回显后按文本匹配移除，避免「不显示」或「显示两遍」
  const [pendingUserMessages, setPendingUserMessages] = useState<Array<{ id: string; content: string; timestamp: number; experts?: ExpertRef[] }>>([]);

  // 思考过程
  const [thinking, setThinking] = useState<Thinking[]>([]);
  const [thinkingExpanded, setThinkingExpanded] = useState(true);

  // 中间过程叙述（工具调用前的模型过渡说明）
  const [narrations, setNarrations] = useState<Narration[]>([]);
  // 追问答案摘要（作为中间过程展示，不渲染为独立用户气泡）
  const [followupAnswers, setFollowupAnswers] = useState<FollowupAnswer[]>([]);

  // 工具调用
  const [toolUses, setToolUses] = useState<ToolUse[]>([]);

  // 工具确认
  const [toolConfirmations, setToolConfirmations] = useState<ToolConfirmation[]>([]);

  // 追问问卷
  const [followupQuestionnaire, setFollowupQuestionnaire] = useState<FollowupQuestionnaire | null>(null);

  // 移动端会话导航抽屉 + 轮次锚点高亮
  const [showToc, setShowToc] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<number | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  // 移动端会话抽屉容器：接管打开时的初始焦点，避免首个按钮出现整块焦点环
  const mobileRailSheetRef = useRef<HTMLDivElement | null>(null);

  // 通知
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // 状态
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 输入
  const [inputValue, setInputValue] = useState('');
  const [deepThinking, setDeepThinking] = useState(false);
  // 静态预览没有 SSE：用一个短命的演示态复现「思考中」输入框，便于离线走查
  const [previewThinking, setPreviewThinking] = useState(false);
  const previewThinkingTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (previewThinkingTimerRef.current !== null) {
      window.clearTimeout(previewThinkingTimerRef.current);
    }
  }, []);

  // 预览模式只种一次演示对话：之后点「新会话」保持空白，便于走查空状态。
  const demoSeededRef = useRef(false);
  useEffect(() => {
    if (!devPreview || demoSeededRef.current || !identity.userId) return;
    demoSeededRef.current = true;
    const demo = buildDemoConversation();
    setMessages(demo.messages);
    setThinking(demo.thinking);
    setNarrations(demo.narrations);
    setToolUses(demo.toolUses);
  }, [devPreview, identity.userId]);

  // 技能广场面板开关
  const [skillPanelOpen, setSkillPanelOpen] = useState(false);

  // 本轮产物列表（BFF /api/artifacts → 数据面）；用于推导每轮的 Markdown / PPTX 产物（设计 §15.1）
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);

  // 产物画布（P6）：chat → split → canvas 三态。
  // 开启画布时只改父容器宽度 / 显隐，对话 DOM 始终挂载，避免流式输出被中断。
  const [canvasArtifact, setCanvasArtifact] = useState<ArtifactItem | null>(null);
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  // 画布所属轮次：顶部 Tabs 只列本轮产物，不把全站文件列表塞进来
  const [canvasTurnId, setCanvasTurnId] = useState<number | null>(null);
  // 移动端：对话列以覆盖层拉回画布之上，DOM 不复制、SSE 不中断
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  // 消息映射用于流式更新
  const messageMapRef = useRef<Map<string, Message>>(new Map());
  const thinkingMapRef = useRef<Map<string, Thinking>>(new Map());

  // 待回显的乐观用户消息（用于与 SSE user.message 回显做匹配去重）
  const pendingUserRef = useRef<Array<{ id: string; content: string; experts?: ExpertRef[] }>>([]);

  // 已经渲染/提交过的追问工具 id，避免提交后问卷被同一个工具重复触发
  const handledFollowupIdsRef = useRef<Set<string>>(new Set());

  // 由 useSSEStream 注入：提交工具结果 / 确认后推进轮次，避免新一轮事件并入上一轮
  const beginUserTurnRef = useRef<(() => number) | null>(null);

  // 空态建议词：点选后填入输入框并聚焦，等 React 写回 value 再 focus，避免光标停在旧值末尾
  const handlePickPrompt = useCallback((prompt: string) => {
    setInputValue(prompt);
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('textarea[name="chat-message"]')?.focus();
    });
  }, []);

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
    setFollowupAnswers([]);
    setToolUses([]);
    setToolConfirmations([]);
    setFollowupQuestionnaire(null);
    setCitationsByTurn({});
    setError(null);
    handledFollowupIdsRef.current.clear();
    messageMapRef.current.clear();
    thinkingMapRef.current.clear();
  }, []);

  // 身份初始化：登录后固定用真实 userId；未登录（如 zoer iframe 内嵌）回退 anonymous，保证仍能连上。
  // sessionId 选择顺序：URL ?session= → localStorage「最近会话」→ 新生成（见设计 §6.1）。
  useEffect(() => {
    if (!authReady || identity.sessionId) return;
    // 顶层未登录：等待跳转登录页，不初始化匿名身份
    if (!currentUser && !isEmbedded && !devPreview) return;
    const userId = currentUser?.userId || (devPreview ? CHAT_PREVIEW_USER.userId : 'anonymous');
    const urlSession =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('session')
        : null;
    setIdentity({
      userId,
      sessionId: urlSession || getLastSessionId(userId) || generateId(),
    });
  }, [authReady, currentUser, identity.sessionId, isEmbedded, devPreview]);

  // 会话切换 / 新建后同步写 localStorage 与 URL，保证刷新 / 分享都能续上历史（设计 §6.1）
  useEffect(() => {
    if (!identity.userId || !identity.sessionId) return;
    setLastSessionId(identity.userId, identity.sessionId);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('session') !== identity.sessionId) {
      url.searchParams.set('session', identity.sessionId);
      window.history.replaceState(null, '', url.toString());
    }
  }, [identity.userId, identity.sessionId]);

  // 引用抽屉与 URL 双向同步：保留 ?session=，只增删 ?citation=，方便分享与刷新回到同一处
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (citationId) url.searchParams.set('citation', citationId);
    else url.searchParams.delete('citation');
    window.history.replaceState(null, '', url.toString());
  }, [citationId]);

  // 首次进入时按 URL 打开引用抽屉（仅客户端读取，避免 SSR / 水合不一致）
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('citation');
    if (fromUrl) setCitationId(fromUrl);
  }, []);

  function exitPreview() {
    try {
      window.sessionStorage.removeItem(CHAT_PREVIEW_STORAGE_KEY);
    } catch {
      // 忽略。
    }
    disableDevPreviewCookie();
    setDevPreview(false);
    router.replace('/login');
  }

  // 预览专用：把演示对话恢复到初始状态，方便反复走查引用抽屉与过程时间线
  function resetPreviewConversation() {
    clearConversation();
    const demo = buildDemoConversation();
    setMessages(demo.messages);
    setThinking(demo.thinking);
    setNarrations(demo.narrations);
    setToolUses(demo.toolUses);
  }

  // 新会话：userId 保持登录身份不变，仅换 sessionId 并清空当前对话
  const resetIdentity = useCallback(() => {
    clearConversation();
    setIdentity({ userId: identity.userId || 'anonymous', sessionId: generateId() });
    setShowToc(false);
    addNotification('info', '已开始新会话');
  }, [clearConversation, addNotification, identity.userId]);

  // 切换历史会话：先清空本地 turns，再改 sessionId；useSSEStream 会重连并按 after=0 重放历史事件
  const switchSession = useCallback(
    (sessionId: string) => {
      setShowToc(false);
      if (!sessionId || sessionId === identity.sessionId) return;
      clearConversation();
      setIdentity(prev => ({ ...prev, sessionId }));
    },
    [clearConversation, identity.sessionId]
  );

  // 删除历史会话：成功后按需新建；删除的是当前会话必须离开死会话（resetIdentity 会清空 turns 并换 sessionId）
  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      const ok = await removeSession(sessionId);
      if (!ok) return;
      if (sessionId === identity.sessionId) {
        resetIdentity();
      } else {
        addNotification('info', '会话已删除');
      }
    },
    [removeSession, identity.sessionId, resetIdentity, addNotification]
  );

  // 重命名历史会话标题（服务端强制覆盖、不重排）；成功提示由这里统一发出
  const handleRenameSession = useCallback(
    async (sessionId: string, title: string) => {
      const ok = await renameSession(sessionId, title);
      if (ok) addNotification('info', '标题已更新');
      return ok;
    },
    [renameSession, addNotification]
  );

  // 提交事件
  const submitEvent = useCallback(async (events: Array<{ type: string; payload: Record<string, unknown> }>): Promise<boolean> => {
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
      // 事件落库后刷新会话列表：新会话首次发消息才出现，标题 / 最近活跃也会更新
      refreshSessions();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : '提交失败';
      setError(message);
      addNotification('error', message);
      return false;
    }
  }, [identity, addNotification, refreshSessions]);

  // 发送消息
  const sendMessage = useCallback(async () => {
    if (!inputValue.trim()) return;

    const text = inputValue.trim();
    setInputValue('');

    // 静态预览：不走 BFF / SSE，只在本地追加一轮问答，便于走查引用与专家标记
    if (devPreview) {
      const demoExperts: ExpertRef[] = expertSelection.selectedExperts.map(expert => ({
        expertId: expert.expertId,
        name: expert.name,
        promptHash: null,
      }));
      // 没有 SSE 时先进入「思考中」再落答案，静态页面才能走查思考态输入框
      setPreviewThinking(true);
      if (previewThinkingTimerRef.current !== null) {
        window.clearTimeout(previewThinkingTimerRef.current);
      }
      previewThinkingTimerRef.current = window.setTimeout(() => {
        setMessages(prev => {
          const turnId = prev.reduce((max, m) => Math.max(max, m.turnId ?? 0), 0) + 1;
          return [
            ...prev,
            {
              id: 'demo_user_' + generateId(),
              type: 'user' as const,
              content: text,
              timestamp: Date.now(),
              turnId,
              ...(demoExperts.length > 0 ? { experts: demoExperts } : {}),
            },
            buildDemoReply(turnId, text),
          ];
        });
        setPreviewThinking(false);
        previewThinkingTimerRef.current = null;
        window.setTimeout(scrollToBottom, 60);
      }, 1600);
      return;
    }

    // 专家快照只用于乐观展示；权威名称 / promptHash 以 SSE 回显的 user.message 快照为准
    const expertIds = expertSelection.selectedIds;
    const expertSnapshot: ExpertRef[] = expertSelection.selectedExperts.map(expert => ({
      expertId: expert.expertId,
      name: expert.name,
      promptHash: null,
    }));

    // 立即乐观展示，SSE 回显到达后自动换成带 turnId 的正式消息
    const localId = 'local_' + generateId();
    const pending = {
      id: localId,
      content: text,
      timestamp: Date.now(),
      ...(expertSnapshot.length > 0 ? { experts: expertSnapshot } : {}),
    };
    pendingUserRef.current = [...pendingUserRef.current, pending];
    setPendingUserMessages(prev => [...prev, pending]);

    // 提交事件；用户消息最终由 SSE 回显确定归属轮次
    // 不选专家时也显式传 []，避免后端把「未传」当成其他语义（设计 §10.3）
    await submitEvent([{
      type: 'user.message',
      payload: {
        text,
        deepThinking,
        expertIds,
      },
    }]);
  }, [inputValue, deepThinking, submitEvent, expertSelection.selectedIds, expertSelection.selectedExperts, devPreview, scrollToBottom]);

  // 停止生成（中断当前运行）
  const stopGeneration = useCallback(async () => {
    if (previewThinkingTimerRef.current !== null) {
      window.clearTimeout(previewThinkingTimerRef.current);
      previewThinkingTimerRef.current = null;
    }
    if (devPreview) {
      setPreviewThinking(false);
      return;
    }
    addNotification('info', '正在停止...');
    await submitEvent([{
      type: 'user.interrupt',
      payload: {},
    }]);
  }, [devPreview, submitEvent, addNotification]);

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
    const questionnaire = followupQuestionnaire;
    if (!questionnaire) return;

    // 防御：问卷绑定的工具调用必须仍处于挂起态。服务端只挂起最新一次调用，
    // 若该次已失败或被新的调用取代，提交旧 tool_use_id 会被框架判为
    // Invalid tool result IDs 并整体返回 503。
    const targetToolCallId = questionnaire.toolCallId || questionnaire.id;
    const boundTool = toolUses.find(
      t => t.name === 'ask_followup_questions'
        && t.type === 'tool'
        && (t.toolCallId || t.id) === targetToolCallId,
    );
    if (!boundTool || boundTool.status !== 'pending') {
      handledFollowupIdsRef.current.add(questionnaire.id);
      setFollowupQuestionnaire(null);
      addNotification('warning', '该追问已失效，正在等待最新的追问');
      return;
    }

    const answers = Object.entries(questionnaire.answers).map(([question, answer]) => ({
      question,
      answer,
    }));

    const submitted = await submitEvent([{
      type: 'user.tool_result',
      payload: {
        // 必须用模型给出的 toolCallId，前端卡片 id 是本地事件 id，服务端无法匹配
        tool_use_id: targetToolCallId,
        name: 'ask_followup_questions',
        content: JSON.stringify(answers),
        deepThinking,
      },
    }]);
    // 只有后端确认受理（HTTP 2xx）才推进本地状态，避免“没提交成功却已清空问卷”
    if (!submitted) return;

    // 提交答案进入下一轮，服务端据此推进同一次挂起调用
    beginUserTurnRef.current?.();

    // 前端只展示可读答案，不暴露原始 JSON
    const readable = answers.map((a, i) => `${i + 1}. ${a.question}：${a.answer}`).join('\n');
    setFollowupAnswers(prev => [...prev, {
      id: generateId(),
      content: readable,
      turnId: questionnaire.turnId,
      timestamp: Date.now(),
    }]);

    setFollowupQuestionnaire(null);
    addNotification('success', '追问答案已提交');
  }, [followupQuestionnaire, toolUses, submitEvent, addNotification, deepThinking]);
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
          ? { ...t, output: toolResult.output, status: toolResult.status, finishedAt: toolResult.finishedAt }
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
          ? { ...t, output: skillResult.output, status: skillResult.status, finishedAt: skillResult.finishedAt }
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

  // 引用按轮次聚合：同一片段可能在多次 knowledge_search 中重复命中，
  // 按稳定来源去重并让后到达的快照覆盖先前快照（latest-wins）。
  const handleCitation = useCallback(
    (incoming: Citation[], toolCallId: string, turnId: number) => {
      if (incoming.length === 0) return;
      // 快照本身带 toolCallId；兜底用事件上的值补齐，保证草稿引用也能正确去重。
      const batch = incoming.map(citation =>
        citation.toolCallId || !toolCallId ? citation : { ...citation, toolCallId },
      );
      setCitationsByTurn(prev => {
        const current = prev[turnId] ?? EMPTY_CITATIONS;
        const merged = mergeCitations(current, batch);
        if (merged === current) return prev;
        return { ...prev, [turnId]: merged };
      });
    },
    [],
  );
  const handleError = useCallback((message: string) => {
    setError(message);
    addNotification('error', message);
  }, [addNotification]);

  const handleInterrupted = useCallback(() => {
    setIsRunning(false);
    addNotification('warning', '已中断');
  }, [addNotification]);

  // 处理追问工具：同一张问卷只渲染一次，提交后不再重建。
  // 关键：必须从未处理的工具里挑选，否则第二轮问卷会被第一轮已处理的工具挡住。
  useEffect(() => {
    // 问卷必须始终指向「仍处于挂起态」的追问调用。
    // 模型可能先发一次非法调用（被工具参数校验判为 ERROR）再重试出新的 tool_use，
    // 若旧问卷不失效，用户提交的 tool_use_id 与服务端当前挂起的 id 不一致，
    // 框架会抛 Invalid tool result IDs（表现为 /events 503）。
    if (followupQuestionnaire) {
      const boundToolCallId = followupQuestionnaire.toolCallId || followupQuestionnaire.id;
      const boundTool = toolUses.find(
        t => t.name === 'ask_followup_questions'
          && t.type === 'tool'
          && (t.toolCallId || t.id) === boundToolCallId,
      );
      if (boundTool && boundTool.status === 'pending') return;
      // 绑定调用已失败/已完成/已被替换：作废问卷，交给下一轮 effect 重新挑选
      handledFollowupIdsRef.current.add(followupQuestionnaire.id);
      setFollowupQuestionnaire(null);
      return;
    }

    // 只认最新一次仍挂起、且带完整入参的追问调用
    const pendingFollowups = toolUses.filter(
      t => t.name === 'ask_followup_questions'
        && t.type === 'tool'
        && t.status === 'pending'
        && t.input
        && !handledFollowupIdsRef.current.has(t.id),
    );
    if (pendingFollowups.length === 0) return;
    const askFollowupTool = pendingFollowups[pendingFollowups.length - 1];
    // 同批里更早的挂起调用已被最新一次取代，标记掉避免后续再被选中
    pendingFollowups.slice(0, -1).forEach(stale => handledFollowupIdsRef.current.add(stale.id));

    // 兼容压扁/字符串化 JSON（短横线 JSON、截断 JSON、字段缺失）
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

    // 解析失败也标记已处理，避免同一工具的无效入参反复弹提示
    handledFollowupIdsRef.current.add(askFollowupTool.id);
    addNotification('warning', '追问提示解析失败，请重新发起追问');
  }, [toolUses, followupQuestionnaire, addNotification]);

  // 问卷刚出现时把卡片滚进视野：否则「提交答案」会落在折叠线以下，看起来像渲染不完整。
  const pendingQuestionnaireId = followupQuestionnaire?.id ?? null;
  useEffect(() => {
    if (!pendingQuestionnaireId) return;
    const timer = window.setTimeout(scrollToBottom, 120);
    return () => window.clearTimeout(timer);
  }, [pendingQuestionnaireId, scrollToBottom]);

  // Group conversation items by turnId for chronological rendering
  const turns = useMemo(() => {
    const groupMap = new Map<number, TurnGroup>();

    const ensureGroup = (tid: number, timestamp: number) => {
      if (!groupMap.has(tid)) {
        groupMap.set(tid, { turnId: tid, messages: [], thinking: [], narrations: [], toolUses: [], answers: [], timestamp });
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

    // Group followup answers by turnId
    followupAnswers.forEach(a => {
      const g = ensureGroup(a.turnId || 0, a.timestamp || Date.now());
      g.answers.push(a);
    });

    return Array.from(groupMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, thinking, narrations, toolUses, followupAnswers]);

  // 每轮产物：由该轮 write_file / edit_file 的 input.path 与产物列表对齐推导（设计 §15.1）
  const turnArtifacts = useMemo(() => {
    const map = new Map<number, ArtifactItem[]>();
    turns.forEach(turn => {
      const items = matchTurnArtifacts(turn.toolUses, artifacts);
      if (items.length > 0) map.set(turn.turnId, items);
    });
    return map;
  }, [turns, artifacts]);

  // 画布顶部 Tabs 的数据源：本轮产物优先，其后按轮次从新到旧补齐本会话其他产物。
  // 一轮只产出一个文件是常态，只列当前轮会让 Tabs 永远不出现，
  // 用户就得先关画布再打开另一个产物。
  const canvasArtifacts = useMemo(() => {
    const current = canvasTurnId == null ? [] : turnArtifacts.get(canvasTurnId) ?? [];
    const seen = new Set(current.map(item => item.workspacePath));
    // 按轮次升序固定排序，避免「打开哪个、哪个就跳到第一位」
    const rest: ArtifactItem[] = [];
    Array.from(turnArtifacts.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([, items]) => {
        items.forEach(item => {
          if (seen.has(item.workspacePath)) return;
          seen.add(item.workspacePath);
          rest.push(item);
        });
      });
    // 未能归到具体轮次的产物（如会话级文件）也一并列出
    artifacts.forEach(item => {
      if (seen.has(item.workspacePath)) return;
      seen.add(item.workspacePath);
      rest.push(item);
    });
    const list = [...current, ...rest];
    if (!canvasArtifact) return list;
    if (list.some(item => item.workspacePath === canvasArtifact.workspacePath)) return list;
    return [canvasArtifact, ...list];
  }, [canvasTurnId, turnArtifacts, artifacts, canvasArtifact]);

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
    devPreview ? '' : identity.sessionId,
    devPreview ? '' : identity.userId,
    {
      onMessage: handleMessage,
      onMessageUpdate: handleMessageUpdate,
      onMessageFinalize: handleMessageFinalize,
      onThinking: handleThinking,
      onThinkingUpdate: handleThinkingUpdate,
      onThinkingFinalize: handleThinkingFinalize,
      onNarration: handleNarration,
      onMessageRemove: handleMessageRemove,
      onCitation: handleCitation,
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
    }
  );

  // 把 useSSEStream 的轮次推进器注入 ref：提交工具结果 / 确认时手动开启新一轮
  useEffect(() => {
    beginUserTurnRef.current = beginUserTurn;
  }, [beginUserTurn]);

  // 产物刷新时机：会话切换，或本回合有新写入工具产出 / 结束时（设计 §15.1）
  const mdWriteCount = toolUses.filter(isArtifactWrite).length;

  useEffect(() => {
    // 静态预览不请求服务端，用本地演示产物走查画布
    if (devPreview) {
      setArtifacts(DEMO_ARTIFACTS);
      return;
    }
    if (!identity.userId) return;
    let alive = true;
    fetchArtifacts(identity.userId, identity.sessionId || undefined)
      .then(list => {
        if (alive) setArtifacts(list);
      })
      .catch(() => {
        if (alive) setArtifacts([]);
      });
    return () => {
      alive = false;
    };
  }, [devPreview, identity.userId, identity.sessionId, isRunning, sseRunning, mdWriteCount]);

  // Esc：先退出全屏，再关闭画布（与 04 原型一致）
  useEffect(() => {
    if (!canvasArtifact) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (mobileChatOpen) {
        setMobileChatOpen(false);
      } else if (canvasExpanded) {
        setCanvasExpanded(false);
      } else {
        setCanvasArtifact(null);
        setCanvasTurnId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canvasArtifact, canvasExpanded, mobileChatOpen]);

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

  // 身份未确认前不渲染工作台：顶层未登录直接展示跳转占位，避免闪匿名界面 / 发无效请求
  if (!authReady || !frameChecked || (!activeUser && !isEmbedded && !devPreview)) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm" role="status">
          {authReady ? '未登录，正在前往登录页…' : '正在验证登录状态…'}
        </p>
      </div>
    );
  }

  // 顶栏面包屑：优先展示当前会话标题，未命名 / 新会话回退到「新对话」。
  const currentSessionTitle =
    sessions.find((item) => item.sessionId === identity.sessionId)?.title?.trim() || '新对话';

  return (
    <div className="app-canvas flex h-dvh overflow-hidden text-foreground">
      <a
        href="#chat-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-card focus:ring-2 focus:ring-ring"
      >
        跳到对话区
      </a>

      <SessionSidebar
        className={cn('hidden', canvasArtifact ? '2xl:flex' : 'lg:flex')}
        sessions={sessions}
        currentSessionId={identity.sessionId}
        loading={sessionsLoading}
        onSelect={switchSession}
        onNew={resetIdentity}
        onDelete={handleDeleteSession}
        onRename={handleRenameSession}
        user={activeUser}
        sessionId={identity.sessionId}
        canManage={Boolean(activeUser)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="chat-topbar">
          <button
            type="button"
            className="topbar-icon ui-interactive ui-focus-ring h-10 w-10 lg:hidden"
            onClick={() => setShowToc(true)}
            title="会话导航"
            aria-label="会话导航"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="topbar-title">
            <span className="topbar-crumb">工作台</span>
            <span className="topbar-slash" aria-hidden="true">
              /
            </span>
            <strong title={currentSessionTitle}>{currentSessionTitle}</strong>
            <span
              className={cn('live-dot', devPreview ? 'is-preview' : !isConnected && 'is-idle')}
              title={devPreview ? '静态预览' : isConnected ? '在线' : '未连接'}
            />
          </div>

          <div className="topbar-actions">
            <span className="model-pill" title="当前智能体">
              <span className="model-orb" aria-hidden="true" />
              <span>Lumi Pro</span>
            </span>

            <span className="status-pill hidden sm:inline-flex">
              <span
                className={cn('status-dot', devPreview ? 'is-preview' : !isConnected && 'is-idle')}
                aria-hidden="true"
              />
              {devPreview ? '静态预览' : isConnected ? '已连接' : '未连接'}
            </span>

            <button
              type="button"
              className="topbar-skills ui-interactive ui-focus-ring hidden sm:inline-flex"
              onClick={() => setSkillPanelOpen(true)}
              title="技能广场"
              aria-label="技能广场"
            >
              <Store className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">技能广场</span>
            </button>

            <UserMenu user={activeUser} sessionId={identity.sessionId} showIdentity />

            <button
              type="button"
              className="topbar-icon ui-interactive ui-focus-ring h-10 w-10 sm:h-[30px] sm:w-[30px]"
              onClick={toggleTheme}
              title={isDark ? '浅色模式' : '深色模式'}
              aria-label={isDark ? '浅色模式' : '深色模式'}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>
        {devPreview && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line-1 bg-surface-1/60 px-4 py-1.5 text-[11px] text-fg-3">
            <span className="flex items-center gap-1.5">
              <FlaskConical className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
              <span className="sm:hidden">静态预览</span>
              <span className="hidden sm:inline">静态预览：使用本地演示对话，未连接服务端；发送消息只会得到本地示例回复。</span>
            </span>
            <span className="flex items-center gap-3">
              <button
                type="button"
                onClick={resetPreviewConversation}
                className="ui-interactive ui-focus-ring -mx-1 inline-flex min-h-11 items-center rounded-sm px-1 py-1.5 underline underline-offset-2 hover:text-foreground md:-my-1.5 md:min-h-8"
              >
                重置演示对话
              </button>
              <button
                type="button"
                onClick={exitPreview}
                className="ui-interactive ui-focus-ring -mx-1 inline-flex min-h-11 items-center rounded-sm px-1 py-1.5 underline underline-offset-2 hover:text-foreground md:-my-1.5 md:min-h-8"
              >
                退出预览
              </button>
            </span>
          </div>
        )}
        <main className="relative flex flex-1 overflow-hidden" id="chat-main">
          <TurnAnchorRail
            turns={turns}
            activeTurnId={activeTurnId}
            onSelect={scrollToTurn}
            className={cn('hidden', !canvasArtifact && 'lg:flex')}
          />
          {/* 对话列：展开画布时收窄到 392px，全屏时只隐藏不卸载 */}
          <div
            className={cn(
              'flex min-w-0 flex-col',
              !canvasArtifact && 'flex-1',
              canvasArtifact && !canvasExpanded && !mobileChatOpen && 'hidden lg:flex lg:w-[360px] xl:w-[392px] lg:shrink-0',
              canvasArtifact && !canvasExpanded && mobileChatOpen && 'absolute inset-0 z-30 flex bg-surface-0 lg:relative lg:inset-auto lg:z-auto lg:w-[360px] xl:w-[392px] lg:shrink-0',
              canvasArtifact && canvasExpanded && !mobileChatOpen && 'hidden',
              canvasArtifact && canvasExpanded && mobileChatOpen && 'absolute inset-0 z-30 flex bg-surface-0 lg:hidden'
            )}
          >
            {canvasArtifact && mobileChatOpen && (
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-line-1 bg-surface-1 px-3 lg:hidden">
                <span className="text-xs font-medium text-fg-3">对话</span>
                <button
                  type="button"
                  onClick={() => setMobileChatOpen(false)}
                  className="ui-interactive ui-focus-ring inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-fg-2 hover:bg-surface-2"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  返回产物
                </button>
              </div>
            )}
            <ScrollArea className="min-h-0 flex-1" ref={scrollAreaRef}>
              <div className="mx-auto w-full max-w-3xl px-4 py-6">
                {messages.length === 0 && !sseRunning && <ChatHero onPickPrompt={handlePickPrompt} />}

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
                            <UserMessageExperts experts={message.experts} />
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
                      .map((message, index, list) => {
                        // 只有该轮最后一条、且已结束的回答才挂引用，流式过程中不展示未定稿的资料
                        const isFinalAnswer = index === list.length - 1 && !message.isStreaming;
                        // 预览模式用固定演示引用；真实链路只消费本轮 agent.citation 聚合结果。
                        const citations =
                          isFinalAnswer && devPreview
                            ? citationsForTurn(turn.turnId, message.content, true)
                            : isFinalAnswer
                              ? citationsByTurn[turn.turnId] ?? EMPTY_CITATIONS
                              : EMPTY_CITATIONS;

                        return (
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
                              citations={citations}
                              onCitationClick={openCitation}
                            />
                            {isFinalAnswer && citations.length > 0 && (
                              <CitationList
                                citations={citations}
                                annotated={hasCitationAnnotation(message.content, citations)}
                                onOpen={openCitation}
                              />
                            )}
                          </div>
                        );
                      })}

                    <TurnArtifacts
                      artifacts={turnArtifacts.get(turn.turnId) ?? []}
                      userId={identity.userId || 'anonymous'}
                      sessionId={identity.sessionId || undefined}
                      onOpen={item => {
                        setCanvasArtifact(item);
                        setCanvasTurnId(turn.turnId);
                        setCanvasExpanded(false);
                        setMobileChatOpen(false);
                      }}
                    />
                  </div>
                ))}

                {pendingUserMessages.map(pending => (
                  <div key={pending.id} className="mb-4 flex justify-end animate-message-in">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/80 px-4 py-2.5 text-primary-foreground opacity-70 shadow-soft sm:max-w-[80%]">
                      <UserMessageExperts experts={pending.experts} />
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
            <div className="chat-composer-dock px-4 pb-4 pt-3">
              <div className="mx-auto w-full max-w-3xl">
                <MessageComposer
                  value={inputValue}
                  onChange={setInputValue}
                  onSend={sendMessage}
                  onStop={stopGeneration}
                  running={sseRunning || previewThinking}
                  deepThinking={deepThinking}
                  onDeepThinkingChange={setDeepThinking}
                  experts={expertSelection.experts}
                  selectedExpertIds={expertSelection.selectedIds}
                  onToggleExpert={expertSelection.toggle}
                  onRemoveExpert={expertSelection.remove}
                  onClearExperts={expertSelection.clear}
                  compact={Boolean(canvasArtifact)}
                />
              </div>
            </div>
          </div>

          {canvasArtifact && (
            <ArtifactCanvas
              artifact={canvasArtifact}
              artifacts={canvasArtifacts}
              userId={identity.userId || 'anonymous'}
              sessionId={identity.sessionId || undefined}
              expanded={canvasExpanded}
              onToggleExpanded={() => setCanvasExpanded(v => !v)}
              onSelectArtifact={item => {
                setCanvasArtifact(item);
                setMobileChatOpen(false);
              }}
              onShowConversation={() => setMobileChatOpen(true)}
              onClose={() => {
                setCanvasArtifact(null);
                setCanvasTurnId(null);
                setCanvasExpanded(false);
                setMobileChatOpen(false);
              }}
              className="flex-1 border-l border-line-1"
            />
          )}
      </main>
      </div>

      <Sheet open={showToc} onOpenChange={setShowToc}>
        <SheetContent
          ref={mobileRailSheetRef}
          tabIndex={-1}
          side="left"
          className="w-[min(300px,86vw)] max-w-[86vw] p-0 outline-none"
          onOpenAutoFocus={(event) => {
            // 焦点落在抽屉容器而非「开启新对话」：视觉上更接近原型，同时满足焦点必须进入对话框的无障碍要求。
            event.preventDefault();
            mobileRailSheetRef.current?.focus({ preventScroll: true });
          }}
        >
          <SheetTitle className="sr-only">项目与历史对话</SheetTitle>
          <SessionSidebar
            className="h-full w-full border-r-0"
            sessions={sessions}
            currentSessionId={identity.sessionId}
            loading={sessionsLoading}
            onSelect={switchSession}
            onNew={resetIdentity}
            onDelete={handleDeleteSession}
            onRename={handleRenameSession}
            user={activeUser}
            sessionId={identity.sessionId}
            canManage={Boolean(activeUser)}
          />
        </SheetContent>
      </Sheet>

      <SkillMarketPanel
        open={skillPanelOpen}
        onOpenChange={setSkillPanelOpen}
        userId={identity.userId || 'anonymous'}
        isAdmin={activeUser?.roles.includes('ADMIN') ?? false}
      />

      <CitationSheet
        citationId={citationId}
        open={citationId !== null}
        onOpenChange={open => {
          if (!open) closeCitation();
        }}
        isAdmin={activeUser?.roles.includes('ADMIN') ?? false}
        preview={devPreview}
        onRestoreFocus={restoreCitationFocus}
      />

      {notifications.length > 0 && (
        <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2">
          {notifications.map(notification => (
            <div
              key={notification.id}
              role={notification.type === 'error' ? 'alert' : 'status'}
              className={`rounded-xl border px-4 py-2.5 text-sm shadow-float ${
                notification.type === 'error'
                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                  : notification.type === 'success'
                    ? 'border-success/30 bg-success/10 text-success'
                    : notification.type === 'warning'
                      ? 'border-warning/30 bg-warning/10 text-warning'
                      : 'border-line-2 bg-surface-3 text-fg-1'
              }`}
            >
              {notification.message}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="fixed left-1/2 top-20 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-destructive/30 bg-surface-1 px-4 py-2.5 text-sm text-destructive shadow-float">
          <AlertCircle className="h-4 w-4" />
          {error}
          <Button
            variant="ghost"
            size="icon"
            className="ml-1 h-6 w-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setError(null)}
          >
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
