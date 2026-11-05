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
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { SessionSidebar } from '@/components/SessionSidebar';
import { TurnAnchorRail } from '@/components/TurnAnchorRail';
import { Markdown } from '@/components/Markdown';
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
import { CHAT_PREVIEW_STORAGE_KEY, buildDemoConversation, buildDemoReply } from '@/lib/chat-demo';
import { DEMO_ADMIN_USER } from '@/lib/knowledge-demo';
import type { Citation } from '@/types/citation';
import type { ExpertRef } from '@/types/knowledge';
import { getLastSessionId, setLastSessionId } from '@/lib/session';
import { TurnArtifacts } from '@/components/TurnArtifacts';
import { fetchArtifacts, isMarkdownArtifactWrite, matchTurnArtifacts, type ArtifactItem } from '@/lib/artifacts';
import { ChevronDown, RotateCcw, Moon, Sun, Bot, User, Wrench, Sparkles, MessageSquareText, AlertCircle, CheckCircle, XCircle, Loader2, Check, Menu, Store, LayoutDashboard, FlaskConical } from 'lucide-react';

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
  | { kind: 'answer'; key: string; seq?: number; timestamp: number; answer: FollowupAnswer }
  | { kind: 'tool'; key: string; seq?: number; timestamp: number; tool: ToolUse };

// 按落盘 seq 排序（缺失时按时间戳兜底），还原真实的「思考 → 叙述 → 工具」时序
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
        <span className="shrink-0 text-[11px] text-muted-foreground">{isSkill ? '技能' : '工具'}</span>
        <ToolStatusIcon status={tool.status} />
        {hasDetails && (
          <ChevronDown className={`h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {hasDetails && open && (
        <div className="mt-2 space-y-2">
          {tool.input && (
            <div>
              <div className="mb-0.5 text-[11px] text-muted-foreground">输入</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">{tool.input}</pre>
            </div>
          )}
          {tool.output && (
            <div>
              <div className="mb-0.5 text-[11px] text-muted-foreground">
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
// 叙述（narration）、思考（thinking）与工具调用（tool）收敛为同一条按 seq 交错的时间线，
// 统一收进一个可折叠的「过程」块：轮次进行中自动展开、结束后自动收起；
// 用户手动开合后不再被自动覆盖（manualOverride）。「你的选择」（追问作答）按真实顺序排在时间线之后。
function ProcessTimeline({ steps, isActive }: { steps: TurnStep[]; isActive: boolean }) {
  const [open, setOpen] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);

  useEffect(() => {
    if (!manualOverride) setOpen(isActive);
  }, [isActive, manualOverride]);

  if (steps.length === 0) return null;

  const timeline = steps.filter(s => s.kind !== 'answer');
  const answers = steps.filter((s): s is Extract<TurnStep, { kind: 'answer' }> => s.kind === 'answer');
  const toolCount = timeline.filter(s => s.kind === 'tool').length;

  return (
    <div className="mb-4 space-y-2.5">
      {timeline.length > 0 && (
        <Collapsible
          open={open}
          onOpenChange={(next) => {
            setManualOverride(true);
            setOpen(next);
          }}
        >
          <CollapsibleTrigger className="ui-interactive ui-focus-ring group flex min-h-11 items-center gap-1.5 rounded-sm py-2 pr-2 text-xs md:-my-2 md:min-h-8 text-muted-foreground hover:text-foreground">
            {isActive ? (
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            ) : (
              <div className="h-4 w-0.5 rounded-full bg-border" />
            )}
            <Sparkles className="h-3 w-3" />
            <span>
              过程 · {timeline.length} 步{toolCount > 0 ? `（含 ${toolCount} 次工具）` : ''}
            </span>
            <ChevronDown className={'h-3 w-3 transition-transform ' + (open ? 'rotate-180' : '')} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2.5 space-y-3">
              {timeline.map(step => {
                if (step.kind === 'narration') {
                  return (
                    <div key={step.key} className="ml-0.5 border-l-2 border-border pl-3">
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <MessageSquareText className="h-3 w-3" />
                        <span>过程</span>
                      </div>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                        {step.narration.content}
                      </p>
                    </div>
                  );
                }
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

      {answers.map(step => (
        <div key={step.key} className="ml-0.5 border-l-2 border-primary/40 pl-3">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] text-primary/80">
            <User className="h-3 w-3" />
            <span>你的选择</span>
          </div>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {step.answer.content}
          </p>
        </div>
      ))}
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
      if (wantsPreview) {
        window.sessionStorage.setItem(CHAT_PREVIEW_STORAGE_KEY, '1');
        setDevPreview(true);
        return;
      }
      setDevPreview(window.sessionStorage.getItem(CHAT_PREVIEW_STORAGE_KEY) === '1');
    } catch {
      setDevPreview(false);
    }
  }, []);

  // 预览身份只用于展示，不参与任何真实请求
  const activeUser = currentUser ?? (devPreview ? DEMO_ADMIN_USER : null);

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
  const expertSelection = useExpertSelection(
    identity.userId,
    activeUser?.roles.includes('ADMIN') ?? false,
    devPreview,
  );

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

  // 通知
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // 状态
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 输入
  const [inputValue, setInputValue] = useState('');
  const [deepThinking, setDeepThinking] = useState(false);

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

  // 本轮产物列表（BFF /api/artifacts → 数据面）；用于推导每轮的 Markdown 产物（设计 §15.1）
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);

  // 消息映射用于流式更新
  const messageMapRef = useRef<Map<string, Message>>(new Map());
  const thinkingMapRef = useRef<Map<string, Thinking>>(new Map());

  // 待回显的乐观用户消息（用于与 SSE user.message 回显做匹配去重）
  const pendingUserRef = useRef<Array<{ id: string; content: string; experts?: ExpertRef[] }>>([]);

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
    setFollowupAnswers([]);
    setToolUses([]);
    setToolConfirmations([]);
    setFollowupQuestionnaire(null);
    setCitationsByTurn({});
    setError(null);
    messageMapRef.current.clear();
    thinkingMapRef.current.clear();
  }, []);

  // 身份初始化：登录后固定用真实 userId；未登录（如 zoer iframe 内嵌）回退 anonymous，保证仍能连上。
  // sessionId 选择顺序：URL ?session= → localStorage「最近会话」→ 新生成（见设计 §6.1）。
  useEffect(() => {
    if (!authReady || identity.sessionId) return;
    // 顶层未登录：等待跳转登录页，不初始化匿名身份
    if (!currentUser && !isEmbedded && !devPreview) return;
    const userId = currentUser?.userId || (devPreview ? DEMO_ADMIN_USER.userId : 'anonymous');
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
      window.setTimeout(scrollToBottom, 60);
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

    const submitted = await submitEvent([{
      type: 'user.tool_result',
      payload: {
        // 必须是模型侧的 toolCallId，卡片 id 是前端事件 id，后端无法匹配
        tool_use_id: followupQuestionnaire.toolCallId || followupQuestionnaire.id,
        name: 'ask_followup_questions',
        content: JSON.stringify(answers),
        deepThinking,
      },
    }]);
    // 只有后端真正接收后才推进轮次并收起问卷；409 / 网络异常时保留问卷供重试，
    // 避免「答案没提交成功但界面已经前进」的假死状态。
    if (!submitted) return;

    // 提交答案即开启新一轮，否则第二轮的问卷与工具会并入上一轮
    beginUserTurnRef.current?.();

    // 前端只展示可读文案，原始 JSON 仅用于回传后端
    const readable = answers.map((a, i) => `${i + 1}. ${a.question}：${a.answer}`).join('\n');
    setFollowupAnswers(prev => [...prev, {
      id: generateId(),
      content: readable,
      turnId: followupQuestionnaire.turnId,
      timestamp: Date.now(),
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
  const mdWriteCount = toolUses.filter(isMarkdownArtifactWrite).length;

  useEffect(() => {
    if (devPreview || !identity.userId) return;
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

  // 身份信息（只读）：展示真实登录用户；不再允许手工改 userId / sessionId
  const identityLabel = activeUser
    ? (activeUser.displayName?.trim() || activeUser.username)
    : '匿名 / 未登录';
  const identityRoleLabel = activeUser
    ? (activeUser.roles.includes('ADMIN') ? '管理员' : '普通用户')
    : '未登录';
  const renderIdentityField = (field: 'userId' | 'sessionId', label: string) => (
    <div className="space-y-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <code className="block w-full truncate rounded-md bg-muted px-2 py-1.5 font-mono text-xs text-muted-foreground" title={identity[field]}>
        {identity[field] || '—'}
      </code>
    </div>
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

  return (
    <div className="app-canvas flex h-dvh flex-col overflow-hidden text-foreground">
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
          <h1 className="hidden text-sm font-semibold tracking-tight sm:block">智能体工作台</h1>
          <span className={`ml-1 hidden items-center gap-1.5 surface-chip rounded-full border border-border/60 bg-card px-2 py-0.5 text-[11px] text-muted-foreground sm:inline-flex`}>
            <span className={`h-1.5 w-1.5 rounded-full ${devPreview ? 'bg-warning' : isConnected ? 'bg-success' : 'bg-muted-foreground/50'}`} />
            {devPreview ? '预览模式' : isConnected ? '已连接' : '未连接'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 md:h-9 md:w-9 lg:hidden"
            onClick={() => setShowToc(true)}
            title="会话导航"
            aria-label="会话导航"
          >
            <Menu className="h-4 w-4" />
          </Button>

          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="ghost" size="icon" className="h-11 w-11 md:h-9 md:w-9" title="身份信息（只读）" aria-label="身份信息（只读）">
                <User className="h-4 w-4" />
              </Button>
            </HoverCardTrigger>
            <HoverCardContent align="end" className="w-72">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary">
                    {identityLabel.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{identityLabel}</div>
                    <div className="text-xs text-muted-foreground">{identityRoleLabel}</div>
                  </div>
                </div>
                {renderIdentityField('userId', '用户ID（登录身份）')}
                {renderIdentityField('sessionId', '会话ID（本次会话）')}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  用户身份来自当前登录账号，会话ID 随「新会话」切换。
                </p>
              </div>
            </HoverCardContent>
          </HoverCard>

          <Button variant="ghost" size="icon" className="h-11 w-11 md:h-9 md:w-9" onClick={resetIdentity} title="新会话" aria-label="新会话">
            <RotateCcw className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-11 w-11 gap-1.5 px-2.5 md:h-9 md:w-auto"
            onClick={() => setSkillPanelOpen(true)}
          >
            <Store className="h-4 w-4" />
            <span className="hidden lg:inline">技能广场</span>
          </Button>

          {activeUser && (
            <Button variant="ghost" size="icon" className="h-11 w-11 md:h-9 md:w-9" asChild title="管理后台" aria-label="管理后台">
              <Link href="/admin">
                <LayoutDashboard className="h-4 w-4" />
              </Link>
            </Button>
          )}

          <UserMenu />

          <Button variant="ghost" size="icon" className="h-11 w-11 md:h-9 md:w-9" onClick={toggleTheme} title={isDark ? '浅色模式' : '深色模式'}>
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>
      {devPreview && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-[11px] text-foreground/80">
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
      <main className="flex flex-1 overflow-hidden" id="chat-main">
        <SessionSidebar
          className="hidden lg:flex"
          sessions={sessions}
          currentSessionId={identity.sessionId}
          loading={sessionsLoading}
          onSelect={switchSession}
          onNew={resetIdentity}
          onDelete={handleDeleteSession}
          onRename={handleRenameSession}
        />
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
                  <p className="mt-1 text-xs text-muted-foreground">输入消息，让智能体为你处理事务与信息查询</p>
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
          <div className="border-t border-border/60 bg-background/80 px-4 pb-4 pt-3 backdrop-blur">
            <div className="mx-auto w-full max-w-3xl">
              <MessageComposer
                value={inputValue}
                onChange={setInputValue}
                onSend={sendMessage}
                onStop={stopGeneration}
                running={sseRunning}
                deepThinking={deepThinking}
                onDeepThinkingChange={setDeepThinking}
                experts={expertSelection.experts}
                selectedExpertIds={expertSelection.selectedIds}
                onToggleExpert={expertSelection.toggle}
                onRemoveExpert={expertSelection.remove}
                onClearExperts={expertSelection.clear}
              />
            </div>
          </div>
        </div>

      </main>

      <Sheet open={showToc} onOpenChange={setShowToc}>
        <SheetContent side="left" className="w-60 p-0">
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