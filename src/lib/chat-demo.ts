import type { Message, Narration, Thinking, ToolUse } from '@/types/agent';
import type { ExpertRef } from '@/types/knowledge';

/**
 * 问答页静态演示数据。
 *
 * 控制面 / 数据面未启动时，`/?preview=1` 用这里的本地对话走查引用、专家标记、
 * 过程时间线等交互；不发起任何后端请求。接上服务端后，本文件只在预览模式下使用。
 */

export const CHAT_PREVIEW_STORAGE_KEY = 'aoteman-chat-preview';

/** 与 expertSelection 的演示专家保持一致（exp_hr 是 DRAFT，问答页不可选）。 */
const LEGAL_EXPERT: ExpertRef = {
  expertId: 'exp_legal',
  name: '法务专家',
  promptHash: 'sha256:8c1f3d9a',
};

const FINANCE_EXPERT: ExpertRef = {
  expertId: 'exp_finance',
  name: '财务顾问',
  promptHash: 'sha256:2b7e41c0',
};

/** 固定基准时间（Asia/Shanghai），避免每次刷新时间线跳动。 */
const BASE = Date.UTC(2026, 10, 4, 6, 20);

export type DemoConversation = {
  messages: Message[];
  thinking: Thinking[];
  narrations: Narration[];
  toolUses: ToolUse[];
};

export function buildDemoConversation(): DemoConversation {
  const messages: Message[] = [
    {
      id: 'demo_u1',
      type: 'user',
      content: '年假没休完可以顺延到什么时候？加班又是怎么认定的？',
      timestamp: BASE,
      turnId: 1,
    },
    {
      id: 'demo_a1',
      type: 'assistant',
      content: [
        '**年假**：当年度未休完的年假可以顺延至次年第一季度；逾期未休且非因公司原因的，视为自动放弃 [K1]。年假需提前 **三个工作日** 在系统提交申请，经直属主管审批后生效 [K1]。',
        '',
        '**加班**：加班需事先在系统提交申请并经直属主管审批，未经审批的延时工作不认定为加班 [K2]。紧急故障处理可在事后 24 小时内补提，并注明故障单号 [K2]。',
        '',
        '提醒：顺延只到次年第一季度末，建议在 3 月底前完成休假或提交申请。',
      ].join('\n'),
      timestamp: BASE + 12_000,
      turnId: 1,
    },
    {
      id: 'demo_u2',
      type: 'user',
      content: '出差期间生病请病假，病假证明和差旅报销分别怎么处理？',
      timestamp: BASE + 5 * 60_000,
      turnId: 2,
      experts: [LEGAL_EXPERT, FINANCE_EXPERT],
    },
    {
      id: 'demo_a2',
      type: 'assistant',
      content: [
        '**病假**：病假需在当日 10:00 前告知直属主管并在系统登记；连续病假超过 2 个工作日的，需提交二级及以上医院出具的病假证明 [K3]。',
        '',
        '**差旅报销**：差旅报销需在返回后 15 个工作日内提交，逾期需附情况说明并由部门负责人审批；跨年度费用最迟于次年 1 月 31 日前提交 [K5]。',
        '',
        '建议：出差期间的就诊病历与发票一并留存；病假证明走请假流程，差旅单据走报销流程，分开提交，避免审批链路混淆。',
      ].join('\n'),
      timestamp: BASE + 5 * 60_000 + 20_000,
      turnId: 2,
    },
  ];

  const thinking: Thinking[] = [
    {
      id: 'demo_t1',
      content: '问题同时涉及年假结转与加班认定，先检索《员工手册》第三章假期管理与第四章加班考勤。',
      turnId: 1,
      seq: 1,
      timestamp: BASE + 1_000,
    },
  ];

  const narrations: Narration[] = [
    {
      id: 'demo_n1',
      content: '已检索到相关制度片段，正在核对条款与生效范围。',
      turnId: 1,
      seq: 2,
      timestamp: BASE + 2_000,
    },
    {
      id: 'demo_n2',
      content: '已交由法务专家（exp_legal）与财务顾问（exp_finance）并行处理，正在汇总结论。',
      turnId: 2,
      seq: 4,
      timestamp: BASE + 5 * 60_000 + 2_000,
    },
  ];

  const toolUses: ToolUse[] = [
    {
      id: 'demo_tool1',
      toolCallId: 'call_demo_1',
      name: 'knowledge_search',
      input: JSON.stringify({ query: '年假 顺延 加班 认定', top_k: 5 }, null, 2),
      output: JSON.stringify(
        {
          degraded: false,
          hits: [
            { ref: 'K1', headingPath: '第三章 假期管理 › 3.2 年假', vectorScore: 0.83, rerankScore: 0.91 },
            { ref: 'K2', headingPath: '第四章 加班与考勤 › 4.2 加班申请与认定', vectorScore: 0.79, rerankScore: 0.88 },
          ],
        },
        null,
        2,
      ),
      type: 'tool',
      status: 'success',
      turnId: 1,
      seq: 3,
      timestamp: BASE + 3_000,
    },
  ];

  return { messages, thinking, narrations, toolUses };
}

/**
 * 预览模式下发送消息后的本地答复。
 *
 * 只用于页面走查：文案明确标注「静态预览」，引用固定命中 K1 / K2，
 * 避免与真实召回结果混淆。
 */
export function buildDemoReply(turnId: number, text: string): Message {
  const trimmed = text.trim();
  const quoted = trimmed.length > 48 ? trimmed.slice(0, 48) + '…' : trimmed;
  return {
    id: `demo_reply_${turnId}`,
    type: 'assistant',
    content: [
      `（静态预览回复）你问的是「${quoted}」。`,
      '',
      '演示口径：年假需提前 **三个工作日** 在系统提交申请，经直属主管审批后生效 [K1]；未经审批的延时工作不认定为加班 [K2]。',
      '',
      '接上服务端后，这里会显示知识库的真实召回结果与引用详情。',
    ].join('\n'),
    timestamp: Date.now(),
    turnId,
  };
}