import type { ArtifactItem } from '@/lib/artifacts';

/**
 * 预览模式（?preview=1）下的演示产物。
 *
 * 只服务前端走查：让 Markdown 画布与 PPTX 画布在没有服务端时也能被打开，
 * 内容全部为本地固定文本，不发起任何后端请求，也不冒充真实产物。
 */

const BASE = Date.UTC(2026, 10, 4, 6, 30);

export const DEMO_ARTIFACT_MD_PATH = 'demo/年假与加班制度摘要.md';
export const DEMO_ARTIFACT_PPTX_PATH = 'demo/2026年假与加班制度说明.pptx';

export const DEMO_ARTIFACTS: ArtifactItem[] = [
  {
    id: 'demo-artifact-md',
    workspacePath: DEMO_ARTIFACT_MD_PATH,
    turnId: '1',
    size: 2867,
    mimeType: 'text/markdown',
    previewable: true,
    downloadable: true,
    contentType: 'text/markdown; charset=utf-8',
    contentDisposition: 'inline',
    modifiedAt: BASE,
  },
  {
    id: 'demo-artifact-pptx',
    workspacePath: DEMO_ARTIFACT_PPTX_PATH,
    turnId: '2',
    size: 428_032,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    previewable: false,
    downloadable: true,
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    contentDisposition: 'attachment',
    modifiedAt: BASE + 60_000,
  },
];

const DEMO_CONTENTS: Record<string, string> = {
  [DEMO_ARTIFACT_MD_PATH]: [
    '# 年假与加班制度摘要',
    '',
    '> 依据《员工手册》第三章「假期管理」与第四章「加班与考勤」整理，仅用于预览走查。',
    '',
    '## 一、年假结转',
    '',
    '- 当年度未休完的年假，可顺延至**次年第一季度**；',
    '- 逾期未休且非因公司原因的，视为自动放弃；',
    '- 年假需提前 **三个工作日** 在系统提交申请，经直属主管审批后生效。',
    '',
    '## 二、加班认定',
    '',
    '| 场景 | 是否认定为加班 | 说明 |',
    '| --- | --- | --- |',
    '| 事先申请并审批 | 是 | 按实际审批时长计算 |',
    '| 未经审批的延时工作 | 否 | 不计入加班 |',
    '| 紧急故障处理 | 是 | 事后 24 小时内补提，并注明故障单号 |',
    '',
    '## 三、办理建议',
    '',
    '1. 每年 3 月底前完成上年度年假的休假或提交申请；',
    '2. 加班尽量走事前审批，紧急场景保留故障单号；',
    '3. 病假与差旅报销分属两条审批链路，材料分开提交。',
    '',
    '---',
    '',
    '*本文件由智能体根据知识库内容生成，引用可回溯到《员工手册》对应章节。*',
  ].join('\n'),
};

/** 预览模式下按路径取演示正文；真实产物返回 null。 */
export function demoArtifactContent(workspacePath: string): string | null {
  return DEMO_CONTENTS[workspacePath] ?? null;
}

/** 是否为预览模式下的演示产物。 */
export function isDemoArtifact(workspacePath: string): boolean {
  return DEMO_ARTIFACTS.some(item => item.workspacePath === workspacePath);
}
