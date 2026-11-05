import type {
  AdminExpertDetail,
  ChunkStrategy,
  EmbeddingConfig,
  ExpertCapabilities,
  GrantUser,
  IngestStage,
  KnowledgeBaseStatus,
  KnowledgeBaseSummary,
  KnowledgeChunk,
  KnowledgeDocumentSummary,
  KnowledgeDocumentVersion,
} from '@/types/knowledge';

/**
 * 静态演示数据（阶段一：先做页面，接口后接）。
 *
 * 为什么放在客户端：知识库与专家页需要真实的交互反馈（筛选、上传进度、入库推进、
 * 授权增删），后端 BFF 未开工。接接口时只需把页面的 `getDemoState()` 换成 fetch，
 * 组件与类型不动。数据持久化到 localStorage，刷新不丢，便于验收与演示。
 */

export type DemoState = {
  bases: KnowledgeBaseSummary[];
  documents: KnowledgeDocumentSummary[];
  versions: KnowledgeDocumentVersion[];
  chunks: KnowledgeChunk[];
  experts: AdminExpertDetail[];
  grants: Record<string, GrantUser[]>;
  capabilities: ExpertCapabilities;
  embedding: EmbeddingConfig;
};

const STORAGE_KEY = 'aoteman-knowledge-demo-v1';

/** 固定基准时间（Asia/Shanghai），保证截图与验收结果稳定。 */
function at(month: number, day: number, hour: number, minute: number): number {
  return Date.UTC(2026, month - 1, day, hour - 8, minute);
}

export const DEMO_NOW = at(11, 4, 14, 20);

export const DEMO_ADMIN_USER = {
  userId: 'u_1001',
  username: 'zhangming',
  displayName: '张明',
  email: 'zhangming@aoteman.local',
  status: 'ACTIVE',
  roles: ['ADMIN'],
  createdAt: at(3, 1, 9, 0),
};

export const DEMO_USERS: GrantUser[] = [
  { userId: 'u_1001', username: 'zhangming', displayName: '张明', email: 'zhangming@aoteman.local', roles: ['ADMIN'], status: 'ACTIVE' },
  { userId: 'u_1002', username: 'lijing', displayName: '李静', email: 'lijing@aoteman.local', roles: ['USER'], status: 'ACTIVE' },
  { userId: 'u_1003', username: 'wanglei', displayName: '王磊', email: 'wanglei@aoteman.local', roles: ['USER'], status: 'ACTIVE' },
  { userId: 'u_1004', username: 'chenxiao', displayName: '陈晓', email: 'chenxiao@aoteman.local', roles: ['USER'], status: 'ACTIVE' },
  { userId: 'u_1005', username: 'liuyang', displayName: '刘洋', email: 'liuyang@aoteman.local', roles: ['USER'], status: 'ACTIVE' },
  { userId: 'u_1006', username: 'zhaomin', displayName: '赵敏', email: 'zhaomin@aoteman.local', roles: ['USER'], status: 'ACTIVE' },
  { userId: 'u_1007', username: 'sunpeng', displayName: '孙鹏', email: 'sunpeng@aoteman.local', roles: ['USER'], status: 'DISABLED' },
  { userId: 'u_1008', username: 'zhouting', displayName: '周婷', email: 'zhouting@aoteman.local', roles: ['USER'], status: 'ACTIVE' },
];

const LEGAL_PROMPT = `你是一名资深企业法务顾问，服务对象是公司内部员工。

回答要求：
1. 先给结论，再给依据。依据优先引用检索到的制度条款，写明文件名与章节。
2. 涉及合同、竞业、劳动争议时，指出适用法与风险等级（低 / 中 / 高）。
3. 不确定的事实不要编造；缺少信息时，列出需要补充的两到三个关键点。
4. 不提供正式法律意见的免责表述只在首次回答时出现一句，不要反复强调。
5. 引用检索结果时使用 [K1] 这样的标记，编号必须与检索结果一致，不得自造编号。

语气：专业、直接、可执行。避免空泛的原则性表述，给出员工下一步该做什么。`;

const HR_PROMPT = `你是公司人事政策的解释者，熟悉员工手册、考勤与假期制度。

回答时先用一句话回答员工的问题，再补充办理路径与所需材料。
涉及金额、天数、时限的数字必须来自检索到的制度原文，找不到就说明「制度中未写明」。
不要评价公司政策是否合理，也不要承诺制度之外的例外处理。`;

const FINANCE_PROMPT = `你是财务共享中心的顾问，负责报销、发票与预算口径的解释。

回答结构：结论 → 适用制度 → 需要提交的材料 → 常见退回原因。
金额与比例必须引用制度原文，并标注 [K*]；无法确认时提示员工联系财务值班岗。`;

function daysAgo(days: number, hour = 10, minute = 0): number {
  const base = at(11, 4, hour, minute);
  return base - days * 24 * 60 * 60 * 1000;
}

type DocSeed = {
  id: string;
  kbId: string;
  name: string;
  size: number;
  version: number;
  status: KnowledgeDocumentSummary['status'];
  chunkCount?: number;
  stage?: IngestStage | null;
  progress?: number | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  updatedAt: number;
  strategy?: ChunkStrategy;
  toc?: boolean;
  levels?: number;
};

function makeDoc(seed: DocSeed): KnowledgeDocumentSummary {
  return {
    documentId: seed.id,
    kbId: seed.kbId,
    title: seed.name.replace(/\.docx$/i, ''),
    fileName: seed.name,
    fileSize: seed.size,
    versionNo: seed.version,
    status: seed.status,
    stage: seed.stage ?? null,
    progress: seed.progress ?? null,
    failureCode: seed.failureCode ?? null,
    failureMessage: seed.failureMessage ?? null,
    chunkCount: seed.chunkCount ?? null,
    updatedAt: seed.updatedAt,
    strategy: seed.strategy ?? 'AUTO',
    tocDetected: seed.toc ?? true,
    headingLevels: seed.levels ?? 4,
  };
}

function seedBases(): KnowledgeBaseSummary[] {
  return [
    {
      kbId: 'kb_hr',
      name: '行政制度',
      description: '员工手册、考勤与假期制度等行政类文档',
      status: 'ACTIVE',
      strategy: 'AUTO',
      documentCount: 0,
      chunkCount: 0,
      grantCount: 0,
      updatedAt: at(11, 4, 14, 20),
    },
    {
      kbId: 'kb_finance',
      name: '财务制度',
      description: '报销、发票与预算口径',
      status: 'ACTIVE',
      strategy: 'TOC',
      documentCount: 0,
      chunkCount: 0,
      grantCount: 0,
      updatedAt: at(11, 2, 9, 11),
    },
    {
      kbId: 'kb_it',
      name: '技术规范',
      description: '研发流程、发布规范与安全基线',
      status: 'ACTIVE',
      strategy: 'TOC',
      documentCount: 0,
      chunkCount: 0,
      grantCount: 0,
      updatedAt: at(10, 29, 16, 42),
    },
    {
      kbId: 'kb_cs',
      name: '客服话术',
      description: '常见问题答复口径与升级路径',
      status: 'ACTIVE',
      strategy: 'FIXED',
      documentCount: 0,
      chunkCount: 0,
      grantCount: 0,
      updatedAt: at(10, 21, 11, 5),
    },
    {
      kbId: 'kb_pm',
      name: '项目管理',
      description: '立项、里程碑与验收模板',
      status: 'ACTIVE',
      strategy: 'AUTO',
      documentCount: 0,
      chunkCount: 0,
      grantCount: 0,
      updatedAt: at(10, 9, 15, 30),
    },
    {
      kbId: 'kb_legacy',
      name: '安全规范（已删除）',
      description: '误建后删除，仅保留历史引用的快照',
      status: 'DELETED',
      strategy: 'FIXED',
      documentCount: 0,
      chunkCount: 0,
      grantCount: 0,
      updatedAt: at(9, 12, 10, 0),
    },
    {
      kbId: 'kb_old',
      name: '旧版制度（已停用）',
      description: '2023 年之前的制度归档，仅保留历史引用',
      status: 'DISABLED',
      strategy: 'FIXED',
      documentCount: 0,
      chunkCount: 0,
      grantCount: 0,
      updatedAt: at(9, 28, 10, 0),
    },
  ];
}

function seedDocuments(): KnowledgeDocumentSummary[] {
  const hr = 'kb_hr';
  return [
    makeDoc({ id: 'doc_handbook', kbId: hr, name: '员工手册.docx', size: 1_258_291, version: 3, status: 'READY', chunkCount: 87, updatedAt: at(11, 4, 14, 20) }),
    makeDoc({ id: 'doc_attendance', kbId: hr, name: '考勤管理办法.docx', size: 863_232, version: 2, status: 'READY', chunkCount: 164, updatedAt: at(11, 3, 17, 6) }),
    makeDoc({ id: 'doc_leave', kbId: hr, name: '假期与调休规定.docx', size: 512_000, version: 1, status: 'READY', chunkCount: 141, updatedAt: at(11, 1, 10, 32) }),
    makeDoc({ id: 'doc_travel', kbId: hr, name: '差旅报销制度.docx', size: 2_097_152, version: 4, status: 'READY', chunkCount: 258, updatedAt: at(10, 30, 14, 18) }),
    makeDoc({ id: 'doc_expense', kbId: hr, name: '报销制度.docx', size: 738_197, version: 2, status: 'FAILED', failureCode: 'EMBED_TIMEOUT', failureMessage: 'embedding 服务超时，已重试 3 次（queue wait 42s, 10.26.0.2:8082 无响应）', stage: 'EMBED', updatedAt: at(11, 4, 13, 2) }),
    makeDoc({ id: 'doc_meeting', kbId: hr, name: '会议室使用规定.docx', size: 331_776, version: 1, status: 'PROCESSING', stage: 'CHUNK', progress: 60, updatedAt: at(11, 4, 14, 12) }),
    makeDoc({ id: 'doc_seal', kbId: hr, name: '印章管理规定.docx', size: 420_000, version: 5, status: 'READY', chunkCount: 285, updatedAt: at(10, 27, 9, 45) }),
    makeDoc({ id: 'doc_nda', kbId: hr, name: '保密协议模板.docx', size: 286_720, version: 2, status: 'READY', chunkCount: 74, updatedAt: at(10, 24, 11, 20) }),
    makeDoc({ id: 'doc_visitor', kbId: hr, name: '访客登记流程.docx', size: 174_080, version: 1, status: 'READY', chunkCount: 41, updatedAt: at(10, 20, 15, 3) }),
    makeDoc({ id: 'doc_asset', kbId: hr, name: '固定资产领用.docx', size: 393_216, version: 3, status: 'READY', chunkCount: 93, updatedAt: at(10, 18, 16, 48) }),
    makeDoc({ id: 'doc_onboarding', kbId: hr, name: '员工入职指引.docx', size: 1_048_576, version: 2, status: 'READY', chunkCount: 146, updatedAt: at(10, 15, 9, 30) }),
    makeDoc({ id: 'doc_team', kbId: hr, name: '团建经费说明.docx', size: 118_784, version: 1, status: 'UPLOADED', updatedAt: at(11, 4, 14, 18) }),

    makeDoc({ id: 'doc_reimburse_rule', kbId: 'kb_finance', name: '费用报销管理办法.docx', size: 1_572_864, version: 2, status: 'READY', chunkCount: 96, updatedAt: at(11, 2, 9, 11) }),
    makeDoc({ id: 'doc_invoice', kbId: 'kb_finance', name: '发票合规指引.docx', size: 655_360, version: 1, status: 'READY', chunkCount: 54, updatedAt: at(10, 28, 15, 22) }),
    makeDoc({ id: 'doc_budget', kbId: 'kb_finance', name: '预算编制说明.docx', size: 448_512, version: 3, status: 'READY', chunkCount: 31, updatedAt: at(10, 26, 10, 8) }),

    makeDoc({ id: 'doc_release', kbId: 'kb_it', name: '发布流程规范.docx', size: 921_600, version: 4, status: 'READY', chunkCount: 118, updatedAt: at(10, 29, 16, 42) }),
    makeDoc({ id: 'doc_security', kbId: 'kb_it', name: '研发安全基线.docx', size: 1_310_720, version: 2, status: 'READY', chunkCount: 203, updatedAt: at(10, 22, 11, 16) }),

    makeDoc({ id: 'doc_faq', kbId: 'kb_cs', name: '高频问题答复口径.docx', size: 786_432, version: 3, status: 'READY', chunkCount: 152, updatedAt: at(10, 21, 11, 5) }),
    makeDoc({ id: 'doc_escalate', kbId: 'kb_cs', name: '投诉升级路径.docx', size: 245_760, version: 1, status: 'READY', chunkCount: 48, updatedAt: at(10, 19, 14, 40) }),

    makeDoc({ id: 'doc_kickoff', kbId: 'kb_pm', name: '立项评审模板.docx', size: 532_480, version: 2, status: 'READY', chunkCount: 87, updatedAt: at(10, 9, 15, 30) }),
    makeDoc({ id: 'doc_accept', kbId: 'kb_pm', name: '验收清单模板.docx', size: 286_720, version: 1, status: 'READY', chunkCount: 39, updatedAt: at(10, 6, 9, 20) }),

    makeDoc({ id: 'doc_old_hr', kbId: 'kb_old', name: '2023 版员工手册.docx', size: 1_048_576, version: 1, status: 'READY', chunkCount: 132, updatedAt: at(9, 28, 10, 0), strategy: 'FIXED', toc: false }),
    makeDoc({ id: 'doc_old_fin', kbId: 'kb_old', name: '2022 版报销制度.docx', size: 671_744, version: 1, status: 'READY', chunkCount: 88, updatedAt: at(9, 27, 10, 0), strategy: 'FIXED', toc: false }),
  ];
}

function seedVersions(): KnowledgeDocumentVersion[] {
  return [
    { versionId: 'ver_handbook_v3', documentId: 'doc_handbook', versionNo: 3, status: 'READY', chunkCount: 87, createdAt: at(11, 4, 14, 20), failureMessage: null, isCurrent: true },
    { versionId: 'ver_handbook_v2', documentId: 'doc_handbook', versionNo: 2, status: 'READY', chunkCount: 84, createdAt: at(10, 28, 9, 12), failureMessage: null, isCurrent: false },
    { versionId: 'ver_handbook_v1', documentId: 'doc_handbook', versionNo: 1, status: 'FAILED', chunkCount: null, createdAt: at(10, 27, 18, 40), failureMessage: '向量化超时，10.26.0.2:8082 无响应', isCurrent: false },
  ];
}

function childChunk(
  id: string,
  ordinal: number,
  headingPath: string,
  content: string,
  parentChunkId: string,
): KnowledgeChunk {
  return {
    chunkId: id,
    versionId: 'ver_handbook_v3',
    parentChunkId,
    chunkType: 'CHILD',
    ordinal,
    ordinalTotal: 87,
    headingPath,
    content,
    charCount: content.length,
  };
}

function seedChunks(): KnowledgeChunk[] {
  return [
    {
      chunkId: 'chunk_p8',
      versionId: 'ver_handbook_v3',
      parentChunkId: null,
      chunkType: 'PARENT',
      ordinal: 8,
      ordinalTotal: 87,
      headingPath: '第三章 假期管理',
      content:
        '本章规定年假、病假、调休与婚丧假的申请条件、审批权限与时效要求。3.1 年假计算方式；3.2 年假申请与审批；3.3 病假与医疗期；3.4 调休与加班补偿。各部门可在本章框架内制定实施细则，但不得低于本章标准。',
      charCount: 214,
    },
    childChunk(
      'chunk_c12',
      12,
      '第三章 假期管理 › 3.1 年假',
      '员工累计工作满 1 年不满 10 年的，年休假 5 天；满 10 年不满 20 年的 10 天；满 20 年的 15 天。年假以自然年度为周期计算，跨年度未休部分原则上不结转，因公司原因未能安排的除外。',
      'chunk_p8',
    ),
    childChunk(
      'chunk_c13',
      13,
      '第三章 假期管理 › 3.2 年假申请',
      '年假需提前三个工作日在系统提交申请，由直属主管审批；连续休假超过 5 个工作日的，需部门负责人二次审批。审批通过后，系统自动同步至考勤记录，无需另行报备。',
      'chunk_p8',
    ),
    childChunk(
      'chunk_c14',
      14,
      '第三章 假期管理 › 3.3 病假与医疗期',
      '病假需在当日 10:00 前告知直属主管，并在返岗后三个工作日内补交二级以上医院出具的病假证明。医疗期按国家和当地规定执行，医疗期内工资按公司薪酬制度发放。',
      'chunk_p8',
    ),
    childChunk(
      'chunk_c15',
      15,
      '第三章 假期管理 › 3.4 调休与加班补偿',
      '休息日加班可优先安排调休，调休需在加班之日起 6 个月内使用；法定节假日加班不安排调休，按国家规定支付加班工资。',
      'chunk_p8',
    ),
    {
      chunkId: 'chunk_p9',
      versionId: 'ver_handbook_v3',
      parentChunkId: null,
      chunkType: 'PARENT',
      ordinal: 9,
      ordinalTotal: 87,
      headingPath: '第四章 加班与考勤',
      content:
        '本章规定工作时间、打卡规则、加班认定与异常考勤处理。4.1 工作时间与打卡；4.2 加班申请与认定；4.3 迟到、早退与旷工。',
      charCount: 126,
    },
    childChunk(
      'chunk_c16',
      16,
      '第四章 加班与考勤 › 4.1 工作时间与打卡',
      '公司实行标准工时制，工作时间为 9:00–18:00，午休 12:00–13:00。员工需在到岗与离岗时分别打卡；忘记打卡可在当月内提交补卡申请，每月不超过 3 次。',
      'chunk_p9',
    ),
    childChunk(
      'chunk_c17',
      17,
      '第四章 加班与考勤 › 4.2 加班申请与认定',
      '加班需事先在系统提交申请并经直属主管审批，未经审批的延时工作不认定为加班。紧急故障处理可事后 24 小时内补提，并注明故障单号。',
      'chunk_p9',
    ),
  ];
}

function seedExperts(): AdminExpertDetail[] {
  return [
    {
      expertId: 'exp_legal',
      name: '法务专家',
      description: '合同、合规与劳动争议',
      avatarUrl: null,
      welcomeMessage: '你好，我是法务专家。可以帮你审合同条款、判断劳动用工风险。',
      status: 'ACTIVE',
      promptChars: LEGAL_PROMPT.length,
      resources: { knowledgeBaseCount: 2, skillCount: 0, mcpCount: 0, grantCount: 6 },
      updatedAt: at(11, 3, 10, 22),
      systemPrompt: LEGAL_PROMPT,
      promptHash: 'a1b2c3d4',
      knowledgeBases: [
        { kbId: 'kb_hr', name: '行政制度', status: 'ACTIVE', sortOrder: 1, documentCount: 12, chunkCount: 1284 },
        { kbId: 'kb_finance', name: '财务制度', status: 'ACTIVE', sortOrder: 2, documentCount: 3, chunkCount: 181 },
      ],
      skills: [],
      mcpServers: [],
      grants: DEMO_USERS.slice(1, 7),
      publishedAt: at(11, 3, 10, 22),
    },
    {
      expertId: 'exp_hr',
      name: '人事专家',
      description: '考勤、假期与入离职流程',
      avatarUrl: null,
      welcomeMessage: '你好，我是人事专家，可以解答考勤与假期制度问题。',
      status: 'DRAFT',
      promptChars: HR_PROMPT.length,
      resources: { knowledgeBaseCount: 1, skillCount: 0, mcpCount: 0, grantCount: 0 },
      updatedAt: at(11, 1, 16, 40),
      systemPrompt: HR_PROMPT,
      promptHash: null,
      knowledgeBases: [
        { kbId: 'kb_hr', name: '行政制度', status: 'ACTIVE', sortOrder: 1, documentCount: 12, chunkCount: 1284 },
      ],
      skills: [],
      mcpServers: [],
      grants: [],
      publishedAt: null,
    },
    {
      expertId: 'exp_finance',
      name: '财务顾问',
      description: '报销口径、发票合规与预算',
      avatarUrl: null,
      welcomeMessage: '你好，我是财务顾问，报销前可以先问我材料是否齐全。',
      status: 'ACTIVE',
      promptChars: FINANCE_PROMPT.length,
      resources: { knowledgeBaseCount: 1, skillCount: 0, mcpCount: 0, grantCount: 3 },
      updatedAt: at(10, 30, 9, 15),
      systemPrompt: FINANCE_PROMPT,
      promptHash: 'f7e8d9c0',
      knowledgeBases: [
        { kbId: 'kb_finance', name: '财务制度', status: 'ACTIVE', sortOrder: 1, documentCount: 3, chunkCount: 181 },
      ],
      skills: [],
      mcpServers: [],
      grants: DEMO_USERS.slice(2, 5),
      publishedAt: at(10, 30, 9, 15),
    },
  ];
}

function seedState(): DemoState {
  const grants: Record<string, GrantUser[]> = {
    kb_hr: DEMO_USERS.slice(0, 8),
    kb_finance: DEMO_USERS.slice(0, 3),
    kb_it: [],
    kb_cs: DEMO_USERS.slice(1, 7),
    kb_pm: DEMO_USERS.slice(0, 2),
    kb_old: [],
  };
  return {
    bases: seedBases(),
    documents: seedDocuments(),
    versions: seedVersions(),
    chunks: seedChunks(),
    experts: seedExperts(),
    grants,
    capabilities: { skills: false, mcp: false },
    embedding: {
      modelName: 'qwen3-embedding',
      dimension: 1024,
      endpoint: 'http://10.26.0.2:8082/v1/embeddings',
      rerankModel: 'bge-reranker-base',
    },
  };
}

let memory: DemoState | null = null;

/** 读取演示数据：优先 localStorage，其次种子数据。仅客户端调用。 */
export function getDemoState(): DemoState {
  if (memory) return withCounts(memory);
  if (typeof window === 'undefined') return withCounts(seedState());
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      memory = JSON.parse(raw) as DemoState;
      return withCounts(memory);
    }
  } catch {
    // 本地存储不可用（隐私模式 / 配额）时退回内存态，不影响页面展示。
  }
  memory = seedState();
  return withCounts(memory);
}

export function saveDemoState(next: DemoState): DemoState {
  const normalized = withCounts(next);
  memory = normalized;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // 忽略持久化失败：演示数据仍保存在内存中。
    }
  }
  return normalized;
}

export function resetDemoState(): DemoState {
  memory = seedState();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 忽略。
    }
  }
  return withCounts(memory);
}

/** 列表 / 详情共用：文档数、切片数、授权数一律由明细推导，避免两处漂移。 */
export function withCounts(state: DemoState): DemoState {
  const bases = state.bases.map((base) => {
    const docs = state.documents.filter((doc) => doc.kbId === base.kbId);
    return {
      ...base,
      documentCount: docs.length,
      chunkCount: docs.reduce((sum, doc) => sum + (doc.status === 'READY' ? doc.chunkCount ?? 0 : 0), 0),
      grantCount: state.grants[base.kbId]?.length ?? 0,
    };
  });
  const byId = new Map(bases.map((base) => [base.kbId, base]));
  const experts = state.experts.map((expert) => ({
    ...expert,
    promptChars: expert.systemPrompt.length,
    knowledgeBases: expert.knowledgeBases.map((binding) => {
      const base = byId.get(binding.kbId);
      return base
        ? {
            ...binding,
            name: base.name,
            status: base.status,
            documentCount: base.documentCount,
            chunkCount: base.chunkCount,
          }
        : binding;
    }),
    resources: {
      knowledgeBaseCount: expert.knowledgeBases.length,
      skillCount: expert.skills.length,
      mcpCount: expert.mcpServers.length,
      grantCount: expert.grants.length,
    },
  }));
  return { ...state, bases, experts };
}

export function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}