// 身份类型
export interface Identity {
  userId: string;
  sessionId: string;
}

// SSE 事件类型
export type SSEEventType =
  | 'event_start'
  | 'event_delta'
  | 'agent.event'
  | 'agent.message'
  | 'agent.thinking'
  | 'user.message'
  | 'agent.tool_use'
  | 'agent.tool_result'
  | 'agent.skill_use'
  | 'agent.skill_result'
  | 'agent.skill_loaded'
  | 'session.status_running'
  | 'session.status_idle'
  | 'span.model_request_start'
  | 'span.model_request_end'
  | 'session.status_requires_action'
  | 'session.error'
  | 'session.interrupted'
  | 'session.requires_action';

// 事件数据基础类型
export interface BaseEventPayload {
  [key: string]: unknown;
}

// SSE 事件
export interface SSEEvent {
  /** 事件 id：持久化事件为 evt_xxx；流式预览帧为 null */
  id?: string | null;
  sessionId?: string;
  /** 持久化事件在同一会话内单调递增；流式预览帧固定为 -1 */
  seq?: number;
  type: SSEEventType | string;
  event_id?: string;
  payload?: BaseEventPayload;
  turnId?: number;
  processedAt?: number | null;
  createdAt?: number;
}

// 消息类型
export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  turnId?: number;
}

// 思考过程类型
export interface Thinking {
  id: string;
  content: string;
  isStreaming?: boolean;
  isExpanded?: boolean;
  turnId?: number;
  timestamp?: number;
}

// 工具调用类型
export interface ToolUse {
  id: string;
  /** 模型侧的 tool call id（call_xxx），提交工具结果/确认时必须回传这个值 */
  toolCallId?: string;
  name: string;
  input: string;
  status?: 'pending' | 'success' | 'error';
  output?: string;
  type: 'tool' | 'skill';
  turnId?: number;
  timestamp?: number;
}

// 工具确认类型
export interface ToolConfirmation {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  status?: 'pending' | 'allowed' | 'denied';
  /** 该确认所属轮次，用于在对应轮次内渲染 */
  turnId?: number;
}

// 追问问题类型
export interface FollowupOption {
  label: string;
  value?: string;
  description?: string;
}

export interface FollowupQuestion {
  question: string;
  options: Array<string | FollowupOption>;
}

// 追问问卷类型
export interface FollowupQuestionnaire {
  id: string;
  /** 模型侧 tool call id，用于把答案回传给后端 */
  toolCallId?: string;
  questions: FollowupQuestion[];
  answers: Record<string, string>;
  status: 'pending' | 'submitted';
  /** 该问卷所属轮次，用于在对应轮次内渲染 */
  turnId?: number;
}

// TRACE 条目类型
export interface TraceEntry {
  id: string;
  type: string;
  summary: string;
  payload?: unknown;
  timestamp: number;
}

// 状态通知类型
export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: number;
}

// 轮次分组
export interface TurnGroup {
  turnId: number;
  messages: Message[];
  thinking: Thinking[];
  toolUses: ToolUse[];
  timestamp: number;
}
