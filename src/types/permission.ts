/**
 * 权限规则相关的数据面 DTO（与 PermissionRuleController 对齐）。
 * 依据：doc/design/2026-10-21-权限引擎集成设计.md §8.1。
 */

/** 用户可写入的行为：只允许收紧，不允许放宽。 */
export type PermissionBehavior = 'ask' | 'deny';

/** 数据面基线行为（P1 基线只会出现 allow / ask）。 */
export type PermissionBaselineBehavior = 'allow' | 'ask' | 'deny';

/** 工具语义分类（PermissionRuleCatalog.ToolClass）。 */
export type PermissionToolClass =
  | 'READ'
  | 'WRITE'
  | 'EXECUTE'
  | 'DELETE'
  | 'INTERACT'
  | 'COORDINATION'
  | 'UNCLASSIFIED';

/** GET /api/permission-rules/catalog 的单项。 */
export interface PermissionCatalogItem {
  toolName: string;
  toolClass: PermissionToolClass;
  baselineBehavior: PermissionBaselineBehavior;
  /** 是否真正受权限引擎控制；false 表示恒放行、规则不生效。 */
  engineControlled: boolean;
  /** 是否允许把基线收紧为 ask（deny 恒允许）。 */
  userAskTightenable: boolean;
  /** 是否可被选入用户规则（后端与 engineControlled 保持一致）。 */
  configurable: boolean;
}

/** GET /api/permission-rules 的单条用户规则。 */
export interface PermissionRule {
  ruleId: number;
  userId: string;
  toolName: string;
  behavior: PermissionBehavior;
  ruleContent: string;
  source: string;
  createdAt: number;
  updatedAt: number;
}

/** POST /api/permission-rules 的请求体（userId 由 BFF 注入）。 */
export interface PermissionRuleInput {
  toolName: string;
  behavior: PermissionBehavior;
  ruleContent?: string;
}

/** POST /api/permission-rules 的响应。 */
export interface PermissionRuleUpsertResult {
  ruleId: number;
}