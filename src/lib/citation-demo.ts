import type { Citation, CitationDetail } from '@/types/citation';

/**
 * 引用静态演示数据。
 *
 * 阶段一只做页面：真实数据由 agent.citation 事件到达，字段与这里完全一致。
 * 接后端时删除本文件，改为从 useSSEStream 的 citation 事件聚合即可。
 */

const CITATIONS: Citation[] = [
  {
    ref: 'K1',
    citationId: 'cit_demo_1',
    finalRank: 1,
    toolCallId: 'call_demo_1',
    documentId: 'doc_demo_1',
    versionId: 'ver_demo_1',
    chunkId: 'chunk_demo_1',
    kbName: '行政制度',
    documentTitle: '员工手册',
    fileName: '员工手册.docx',
    headingPath: '第三章 假期管理 › 3.2 年假',
    pageFrom: null,
    pageTo: null,
    chunkOrdinal: 12,
    chunkTotal: 87,
    snippet:
      '员工年假需提前三个工作日在系统提交申请，经直属主管审批后生效。当年度未休完的年假可顺延至次年第一季度，逾期未休且非因公司原因的，视为自动放弃。',
    vectorScore: 0.83,
    rerankScore: 0.91,
    expertId: 'exp_hr',
    expertName: '人事专家',
  },
  {
    ref: 'K2',
    citationId: 'cit_demo_2',
    finalRank: 2,
    toolCallId: 'call_demo_1',
    documentId: 'doc_demo_2',
    versionId: 'ver_demo_2',
    chunkId: 'chunk_demo_2',
    kbName: '行政制度',
    documentTitle: '员工手册',
    fileName: '员工手册.docx',
    headingPath: '第四章 加班与考勤 › 4.2 加班申请与认定',
    pageFrom: null,
    pageTo: null,
    chunkOrdinal: 17,
    chunkTotal: 87,
    snippet:
      '加班需事先在系统提交申请并经直属主管审批，未经审批的延时工作不认定为加班。紧急故障处理可事后 24 小时内补提，并注明故障单号。',
    vectorScore: 0.79,
    rerankScore: 0.88,
    expertId: 'exp_hr',
    expertName: '人事专家',
  },
  {
    ref: 'K3',
    citationId: 'cit_demo_3',
    finalRank: 3,
    toolCallId: 'call_demo_2',
    documentId: 'doc_demo_3',
    versionId: 'ver_demo_3',
    chunkId: 'chunk_demo_3',
    kbName: '行政制度',
    documentTitle: '员工手册',
    fileName: '员工手册.docx',
    headingPath: '第三章 假期管理 › 3.3 病假',
    pageFrom: null,
    pageTo: null,
    chunkOrdinal: 15,
    chunkTotal: 87,
    snippet:
      '病假需在当日 10:00 前告知直属主管并在系统登记。连续病假超过 2 个工作日的，需提交二级及以上医院出具的病假证明。',
    vectorScore: 0.76,
    rerankScore: 0.84,
    expertId: 'exp_hr',
    expertName: '人事专家',
  },
  {
    ref: 'K4',
    citationId: 'cit_demo_4',
    finalRank: 4,
    toolCallId: 'call_demo_2',
    documentId: 'doc_demo_4',
    versionId: 'ver_demo_4',
    chunkId: 'chunk_demo_4',
    kbName: '行政制度',
    documentTitle: '员工手册',
    fileName: '员工手册.docx',
    headingPath: '第三章 假期管理 › 3.5 婚假与产假',
    pageFrom: null,
    pageTo: null,
    chunkOrdinal: 21,
    chunkTotal: 87,
    snippet:
      '依法登记结婚的员工可享受婚假 10 个工作日，需在领证后 12 个月内一次性休完，并提前 5 个工作日在系统提交申请。',
    vectorScore: 0.71,
    rerankScore: 0.8,
    expertId: 'exp_hr',
    expertName: '人事专家',
  },
  {
    ref: 'K5',
    citationId: 'cit_demo_5',
    finalRank: 5,
    toolCallId: 'call_demo_3',
    documentId: 'doc_demo_5',
    versionId: 'ver_demo_5',
    chunkId: 'chunk_demo_5',
    kbName: '财务制度',
    documentTitle: '差旅报销制度',
    fileName: '差旅报销制度.docx',
    headingPath: '第四章 报销流程 › 4.1 提交时限',
    pageFrom: null,
    pageTo: null,
    chunkOrdinal: 5,
    chunkTotal: 42,
    snippet:
      '差旅报销需在返回后 15 个工作日内提交，逾期需附情况说明并由部门负责人审批；跨年度费用最迟于次年 1 月 31 日前提交。',
    vectorScore: 0.68,
    rerankScore: 0.75,
    expertId: 'exp_finance',
    expertName: '财务顾问',
  },
  {
    ref: 'K6',
    citationId: null,
    finalRank: 6,
    toolCallId: 'call_demo_3',
    documentId: 'doc_demo_6',
    versionId: 'ver_demo_6',
    chunkId: 'chunk_demo_6',
    kbName: '财务制度',
    documentTitle: '发票管理规范',
    fileName: '发票管理规范.docx',
    headingPath: '第二章 发票要求 › 2.2 抬头与税号',
    pageFrom: null,
    pageTo: null,
    chunkOrdinal: 3,
    chunkTotal: 28,
    snippet:
      '报销发票抬头必须为公司全称，税号需与营业执照一致。电子发票需同时提交原件 PDF，纸质发票需保持票面完整、无涂改。',
    vectorScore: 0.64,
    rerankScore: null,
    expertId: 'exp_finance',
    expertName: '财务顾问',
  },
];

/**
 * 取某一轮的引用列表。
 *
 * 静态预览按轮次返回固定的 mock 数据（turn 1 → K1/K2，turn 2 → K3/K5，
 * 之后的自测提问沿用 K1/K2）；非预览模式一律返回空数组 —— 真实引用应由
 * `agent.citation` 事件聚合，禁止把演示数据混进真实链路。
 */
/**
 * 必须返回稳定引用：`Markdown` 用 citations 推导 remark 插件与 components，
 * 数组身份一变就会重建引用徽标的 DOM，抽屉关闭时无法把焦点还给原按钮。
 */
const EMPTY_CITATIONS: Citation[] = [];
const TURN_CITATIONS: Citation[][] = [
  [CITATIONS[0], CITATIONS[1]],
  [CITATIONS[2], CITATIONS[4]],
];

export function citationsForTurn(turnId: number, _content: string, preview = false): Citation[] {
  if (!preview) return EMPTY_CITATIONS;
  return TURN_CITATIONS[turnId - 1] ?? TURN_CITATIONS[0];
}

export function findDemoCitation(citationId: string): CitationDetail | null {
  const citation = CITATIONS.find((item) => item.citationId === citationId);
  if (!citation) return null;
  return {
    citation,
    chunk: {
      chunkId: citation.chunkId,
      content: citation.snippet,
      prevChunkId:
        citation.chunkOrdinal > 1 ? `chunk_demo_${citation.chunkOrdinal - 1}` : '',
      nextChunkId:
        citation.chunkOrdinal < citation.chunkTotal
          ? `chunk_demo_${citation.chunkOrdinal + 1}`
          : '',
    },
    parent: {
      chunkId: `chunk_demo_parent_${citation.chunkOrdinal}`,
      content: citation.snippet,
      headingPath: citation.headingPath ?? '',
    },
    document: {
      documentId: citation.documentId,
      title: citation.documentTitle,
      fileName: citation.fileName,
      fileExt: 'docx',
    },
    accessRevoked: false,
    documentDeleted: false,
  };
}
