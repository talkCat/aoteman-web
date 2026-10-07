'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { SSEEvent, TraceEntry, Message, Thinking, Narration, ToolUse, ToolConfirmation } from '@/types/agent';

interface SSEStreamCallbacks {
  onMessage?: (message: Message) => void;
  onMessageUpdate?: (id: string, content: string) => void;
  /** 流式结束后用权威文本替换整段内容 */
  onMessageFinalize?: (id: string, content: string, turnId?: number) => void;
  onThinking?: (thinking: Thinking) => void;
  onThinkingUpdate?: (id: string, content: string) => void;
  /** 思考段落盘：用权威文本替换流式思考段，并带上落盘 seq 参与时序排序 */
  onThinkingFinalize?: (id: string, content: string, seq?: number, turnId?: number) => void;
  /** 中间过程叙述：模型在工具调用前输出的过渡说明 */
  onNarration?: (narration: Narration) => void;
  /** 移除一条（尚未落盘的）助理气泡，例如流式内容被判定为中间叙述时 */
  onMessageRemove?: (id: string) => void;
  onToolUse?: (toolUse: ToolUse) => void;
  onToolResult?: (toolResult: ToolUse) => void;
  onSkillUse?: (skillUse: ToolUse) => void;
  onSkillResult?: (skillResult: ToolUse) => void;
  onSkillLoaded?: (name: string) => void;
  onToolConfirmation?: (confirmation: ToolConfirmation) => void;
  onStatusRunning?: () => void;
  onStatusIdle?: () => void;
  onStatusRequiresAction?: (
    reason?: string,
    toolCalls?: Array<{ toolCallId: string; toolName: string; input: Record<string, unknown> }>
  ) => void;
  onError?: (message: string) => void;
  onInterrupted?: () => void;
  onTrace?: (entry: TraceEntry) => void;
  onComplete?: () => void;
}

interface SSEStreamState {
  isConnected: boolean;
  isRunning: boolean;
}

/**
 * 后端 ConversationController.toSse() 使用 ServerSentEvent.builder().event(dto.type())，
 * 即每个事件都是「命名事件」(event: user.message)。浏览器的 EventSource.onmessage
 * 只在未命名事件时触发，所以必须对每个类型单独 addEventListener。
 * 这里对齐静态页 index.html：所有命名事件都进同一个 handleEvent(data) 分发。
 */
const STREAM_EVENT_TYPES: string[] = [
  'event_start',
  'event_delta',
  'agent.event',
  'agent.message',
  'agent.thinking',
  'agent.narration',
  'user.message',
  'agent.tool_use',
  'agent.tool_result',
  'agent.skill_use',
  'agent.skill_result',
  'agent.skill_loaded',
  'session.status_running',
  'session.status_idle',
  'span.model_request_start',
  'span.model_request_end',
  'session.status_requires_action',
  'session.requires_action',
  'session.error',
  'session.interrupted',
];

/** 预览帧订阅的目标类型（与后端 ALLOWED_EVENT_DELTAS 保持一致） */
const PREVIEW_TYPES: string[] = [
  'agent.message',
  'agent.thinking',
  'agent.tool_use',
  'agent.skill_use',
];

export function useSSEStream(
  sessionId: string,
  userId: string,
  callbacks: SSEStreamCallbacks
) {
  const [state, setState] = useState<SSEStreamState>({
    isConnected: false,
    isRunning: false,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbacksRef = useRef(callbacks);
  const sessionIdRef = useRef(sessionId);
  const userIdRef = useRef(userId);

  /** 当前轮次：以 user.message 回显为起点自增 */
  const turnIdRef = useRef<number>(0);
  /** 已收到的最大 seq，重连时作为 after 游标，避免历史重放 */
  const lastSeqRef = useRef<number>(0);
  /** 已渲染过的事件 id，避免重连回放导致的重复 */
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  /** 正在流式输出中的 assistant 消息 id */
  const streamingMessageIdsRef = useRef<Set<string>>(new Set());
  /** 正在流式输出中的思考 id */
  const streamingThinkingIdsRef = useRef<Set<string>>(new Set());
  /** 已判定为「中间叙述」的事件 id：这些 id 不应再渲染成助理气泡 */
  const narrationIdsRef = useRef<Set<string>>(new Set());
  /** 模型侧的 toolCallId -> 前端工具卡片 id(evt_xxx) */
  const toolCallIdToCardIdRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    userIdRef.current = userId;
  }, [sessionId, userId]);

  const generateMessageId = useCallback(
    () => 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11),
    []
  );

  const addTraceEntry = useCallback((type: string, summary: string, payload?: unknown) => {
    const entry: TraceEntry = {
      id: 'trace_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11),
      type,
      summary,
      payload,
      timestamp: Date.now(),
    };
    callbacksRef.current.onTrace?.(entry);
  }, []);

  /** 标记事件已处理；返回 false 表示是重复事件 */
  const markSeen = useCallback((id: string) => {
    if (!id) return true;
    const seen = seenEventIdsRef.current;
    if (seen.has(id)) return false;
    seen.add(id);
    if (seen.size > 5000) {
      // 简单防膨胀：清掉一半
      const keep = Array.from(seen).slice(-2500);
      seenEventIdsRef.current = new Set(keep);
    }
    return true;
  }, []);

  const handleRequiresAction = useCallback((payload: Record<string, unknown>, turnId: number) => {
    // 会话在等待用户操作（追问作答 / 工具确认），不应再显示「正在处理...」
    setState((prev) => (prev.isRunning ? { ...prev, isRunning: false } : prev));
    const reason = String(payload.reason || '');
    if (reason === 'tool_confirmation') {
      const toolCalls =
        (payload.toolCalls as Array<{
          toolCallId?: string;
          toolName?: string;
          input?: Record<string, unknown>;
        }>) || [];

      toolCalls.forEach((toolCall) => {
        const confirmation: ToolConfirmation = {
          toolCallId: String(toolCall.toolCallId || toolCall.toolName || 'unknown'),
          toolName: String(toolCall.toolName || 'Unknown Tool'),
          input: toolCall.input || {},
          status: 'pending',
          turnId,
        };
        callbacksRef.current.onToolConfirmation?.(confirmation);
      });
      addTraceEntry('requires_action', '需要工具确认', { reason, toolCalls });
      callbacksRef.current.onStatusRequiresAction?.(reason, toolCalls as Array<{ toolCallId: string; toolName: string; input: Record<string, unknown> }>);
    } else {
      addTraceEntry('requires_action', '等待用户操作', payload);
      callbacksRef.current.onStatusRequiresAction?.(reason);
    }
  }, [addTraceEntry]);

  /** 统一事件分发：data.type 决定处理分支（对齐 index.html 的 handleEvent） */
  const handleEvent = useCallback((data: SSEEvent) => {
    const payload = (data.payload || {}) as Record<string, unknown>;
    const turnId = turnIdRef.current;

    switch (data.type) {
      /* ---------------- 流式预览 ---------------- */
      case 'event_start': {
        const target = String(payload.type || '');
        const id = String(payload.event_id || '');
        if (!id) break;
        if (target === 'agent.message') {
          // 该 id 已被判定为中间叙述：不要再为它新建气泡。
          if (narrationIdsRef.current.has(id)) break;
          if (streamingMessageIdsRef.current.has(id)) break;
          streamingMessageIdsRef.current.add(id);
          callbacksRef.current.onMessage?.({
            id,
            type: 'assistant',
            content: '',
            timestamp: Date.now(),
            isStreaming: true,
            turnId,
          });
        } else if (target === 'agent.thinking') {
          if (streamingThinkingIdsRef.current.has(id)) break;
          streamingThinkingIdsRef.current.add(id);
          callbacksRef.current.onThinking?.({ id, content: '', isStreaming: true, turnId });
        } else if (target === 'agent.tool_use' || target === 'agent.skill_use') {
          if (seenEventIdsRef.current.has('start:' + id)) break;
          seenEventIdsRef.current.add('start:' + id);
          const toolUse: ToolUse = {
            id,
            name: '准备中…',
            input: '',
            type: target === 'agent.skill_use' ? 'skill' : 'tool',
            status: 'pending',
            turnId,
          };
          if (target === 'agent.skill_use') {
            callbacksRef.current.onSkillUse?.(toolUse);
          } else {
            callbacksRef.current.onToolUse?.(toolUse);
          }
        }
        addTraceEntry('event_start', (target || 'event') + ' 开始', payload);
        break;
      }

      case 'event_delta': {
        const target = String(payload.type || '');
        const id = String(payload.event_id || '');
        const delta = String(payload.delta || '');
        if (!id || !delta) break;
        if (target === 'agent.message') {
          // 该 id 已被判定为中间叙述：增量不再写入气泡。
          if (narrationIdsRef.current.has(id)) break;
          callbacksRef.current.onMessageUpdate?.(id, delta);
        } else if (target === 'agent.thinking') {
          callbacksRef.current.onThinkingUpdate?.(id, delta);
        } else if (target === 'agent.tool_use' || target === 'agent.skill_use') {
          addTraceEntry('event_delta', target + ' 参数增量', {
            id,
            delta: delta.slice(0, 120),
          });
        }
        break;
      }

      /* ---------------- 用户消息（轮次起点） ---------------- */
      case 'user.message': {
        const eventId = String(data.id || payload.event_id || '');
        if (!markSeen(eventId)) break;
        const text = String(payload.text || '');
        if (!text) break;
        turnIdRef.current += 1;
        callbacksRef.current.onMessage?.({
          id: eventId || generateMessageId(),
          type: 'user',
          content: text,
          timestamp: Date.now(),
          turnId: turnIdRef.current,
        });
        addTraceEntry('user.message', text.slice(0, 80), payload);
        break;
      }

      /* ---------------- 助手最终消息 ---------------- */
      case 'agent.message': {
        const id = String(data.id || payload.event_id || '');
        if (!markSeen(id)) break;
        const text = String(payload.text ?? '');
        // 该 id 已经作为中间叙述落盘，最终消息不应再重复成气泡。
        if (narrationIdsRef.current.has(id)) break;
        if (streamingMessageIdsRef.current.has(id)) {
          streamingMessageIdsRef.current.delete(id);
          callbacksRef.current.onMessageFinalize?.(id, text, turnId);
        } else if (text) {
          callbacksRef.current.onMessage?.({
            id: id || generateMessageId(),
            type: 'assistant',
            content: text,
            timestamp: Date.now(),
            turnId,
          });
        }
        addTraceEntry('agent.message', '助手消息完成', payload);
        break;
      }

      /* ---------------- 思考过程（落盘） ---------------- */
      case 'agent.thinking': {
        const id = String(data.id || payload.event_id || '');
        if (!markSeen(id)) break;
        const text = String(payload.text ?? '');
        if (!text) break;
        // 段结束：用权威文本替换流式思考段，带上落盘 seq 参与时间线排序。
        streamingThinkingIdsRef.current.delete(id);
        callbacksRef.current.onThinkingFinalize?.(
          id || generateMessageId(),
          text,
          toPersistedSeq(data.seq),
          turnId
        );
        addTraceEntry('agent.thinking', text.slice(0, 80), payload);
        break;
      }

      /* ---------------- 中间过程叙述 ---------------- */
      case 'agent.narration': {
        const id = String(data.id || payload.event_id || '');
        if (!markSeen(id)) break;
        const text = String(payload.text ?? '');
        if (!text) break;
        // 后端复用了该轮流式助理气泡的事件 id：先撤掉打字中的气泡，
        // 再以轻量的「中间过程」块呈现，避免同一段文字既当气泡又当过程。
        narrationIdsRef.current.add(id);
        if (streamingMessageIdsRef.current.has(id)) {
          streamingMessageIdsRef.current.delete(id);
        }
        callbacksRef.current.onMessageRemove?.(id);
        callbacksRef.current.onNarration?.({
          id: id || generateMessageId(),
          content: text,
          turnId,
          seq: toPersistedSeq(data.seq),
          timestamp: Date.now(),
        });
        addTraceEntry('agent.narration', text.slice(0, 80), payload);
        break;
      }

      /* ---------------- 工具 / 技能 ---------------- */
      case 'agent.tool_use':
      case 'agent.skill_use': {
        const isSkill = data.type === 'agent.skill_use';
        const id = String(data.id || payload.event_id || '');
        const toolCallId = String(payload.toolCallId ?? payload.id ?? '');
        // 同一个模型 toolCallId 可能被后端落盘两次（挂起工具单独再写一条），
        // 这里统一映射到第一张卡片，避免出现两张同名工具卡片。
        const existingCardId = toolCallId
          ? toolCallIdToCardIdRef.current.get(toolCallId)
          : undefined;
        const cardId = existingCardId || id || generateMessageId();
        if (toolCallId) {
          toolCallIdToCardIdRef.current.set(toolCallId, cardId);
        }
        if (!markSeen('use:' + (id || cardId))) break;
        const toolUse: ToolUse = {
          id: cardId,
          toolCallId: toolCallId || undefined,
          name: String(payload.name || payload.toolName || 'Unknown'),
          input: formatToolInput(payload.input),
          type: isSkill ? 'skill' : 'tool',
          status: 'pending',
          turnId,
          seq: toPersistedSeq(data.seq),
        };
        if (isSkill) {
          callbacksRef.current.onSkillUse?.(toolUse);
        } else {
          callbacksRef.current.onToolUse?.(toolUse);
        }
        addTraceEntry(data.type, toolUse.name, payload);
        break;
      }

      case 'agent.tool_result':
      case 'agent.skill_result': {
        const isSkill = data.type === 'agent.skill_result';
        const resultEventId = String(data.id || '');
        if (!markSeen('result:' + resultEventId)) break;
        const toolCallId = String(payload.tool_use_id ?? payload.toolCallId ?? payload.id ?? '');
        const cardId =
          toolCallIdToCardIdRef.current.get(toolCallId) || resultEventId || toolCallId;
        const stateText = String(payload.state || payload.status || '').toLowerCase();
        const failed = stateText === 'error' || stateText === 'failed';
        const toolResult: ToolUse = {
          id: cardId,
          name: String(payload.name || payload.toolName || 'Tool'),
          input: '',
          output: String(payload.output ?? payload.text ?? ''),
          status: failed ? 'error' : 'success',
          type: isSkill ? 'skill' : 'tool',
          turnId,
          seq: toPersistedSeq(data.seq),
        };
        if (isSkill) {
          callbacksRef.current.onSkillResult?.(toolResult);
        } else {
          callbacksRef.current.onToolResult?.(toolResult);
        }
        addTraceEntry(data.type, toolResult.name, payload);
        break;
      }

      case 'agent.skill_loaded': {
        callbacksRef.current.onSkillLoaded?.(String(payload.name || payload.skillName || 'Unknown Skill'));
        addTraceEntry('agent.skill_loaded', '技能已加载', payload);
        break;
      }

      /* ---------------- 会话状态 ---------------- */
      case 'session.status_running': {
        setState((prev) => ({ ...prev, isRunning: true }));
        callbacksRef.current.onStatusRunning?.();
        addTraceEntry('session.status_running', '会话开始处理', payload);
        break;
      }

      case 'session.status_idle': {
        setState((prev) => ({ ...prev, isRunning: false }));
        callbacksRef.current.onStatusIdle?.();
        callbacksRef.current.onComplete?.();
        addTraceEntry('session.status_idle', '会话空闲', payload);
        break;
      }

      case 'session.status_requires_action':
      case 'session.requires_action': {
        handleRequiresAction(payload, turnId);
        break;
      }

      case 'session.error': {
        const message = String(payload.message || '未知错误');
        callbacksRef.current.onError?.(message);
        addTraceEntry('session.error', message, payload);
        break;
      }

      case 'session.interrupted': {
        setState((prev) => ({ ...prev, isRunning: false }));
        callbacksRef.current.onInterrupted?.();
        addTraceEntry('session.interrupted', '已中断', payload);
        break;
      }

      /* ---------------- 调试信息 ---------------- */
      case 'span.model_request_start':
      case 'span.model_request_end':
      case 'agent.event':
      default: {
        addTraceEntry(String(data.type), '调试事件', payload);
        break;
      }
    }
  }, [addTraceEntry, generateMessageId, handleRequiresAction, markSeen]);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url =
      '/api/sessions/' +
      encodeURIComponent(sessionIdRef.current) +
      '/events/stream?userId=' +
      encodeURIComponent(userIdRef.current) +
      '&after=' +
      lastSeqRef.current +
      '&event_deltas=' +
      encodeURIComponent(PREVIEW_TYPES.join(','));

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setState((prev) => ({ ...prev, isConnected: true }));
      addTraceEntry('connection', 'SSE 连接已建立');
    };

    eventSource.onerror = (error) => {
      console.error('SSE Error:', error);
      setState((prev) => ({ ...prev, isConnected: false }));
      addTraceEntry('error', 'SSE 连接错误，3 秒后重连', null);
      eventSource.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    STREAM_EVENT_TYPES.forEach((name) => {
      eventSource.addEventListener(name, (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as SSEEvent;
          if (typeof data.seq === 'number' && data.seq > lastSeqRef.current) {
            lastSeqRef.current = data.seq;
          }
          handleEvent(data);
        } catch (e) {
          console.error('Failed to parse SSE event ' + name + ':', e);
        }
      });
    });
  }, [addTraceEntry, handleEvent]);

  /**
   * 用户提交工具结果 / 确认后开启新一轮。
   *
   * 追问作答、工具确认走的是 user.tool_result / user.tool_confirmation，
   * 不会触发 user.message 回显，所以需要前端显式推进轮次，
   * 否则第二轮的工具与回答会被并入上一轮，全部堆在一起。
   */
  const beginUserTurn = useCallback(() => {
    turnIdRef.current += 1;
    return turnIdRef.current;
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setState({ isConnected: false, isRunning: false });
    addTraceEntry('connection', 'SSE 连接已断开');
  }, [addTraceEntry]);

  // 新会话：重置游标与去重集合后再连接
  useEffect(() => {
    if (!sessionId || !userId) {
      return;
    }
    turnIdRef.current = 0;
    lastSeqRef.current = 0;
    seenEventIdsRef.current = new Set();
    streamingMessageIdsRef.current = new Set();
    streamingThinkingIdsRef.current = new Set();
    narrationIdsRef.current = new Set();
    toolCallIdToCardIdRef.current = new Map();
    connect();
    return () => {
      disconnect();
    };
  }, [sessionId, userId, connect, disconnect]);

  return {
    ...state,
    reconnect: connect,
    disconnect,
    beginUserTurn,
  };
}

/** 只有真正落盘的事件才带合法的 seq（预览帧固定为 -1），其余一律返回 undefined */
function toPersistedSeq(value: unknown): number | undefined {
  return typeof value === 'number' && value >= 0 ? value : undefined;
}

/** 把工具入参统一渲染成可读字符串 */
function formatToolInput(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export default useSSEStream;
