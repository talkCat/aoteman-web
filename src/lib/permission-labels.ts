import type {
  PermissionBaselineBehavior,
  PermissionToolClass,
} from '@/types/permission';

/** 工具语义分类的中文名（与 PermissionRuleCatalog.ToolClass 对齐）。 */
export const TOOL_CLASS_LABELS: Record<PermissionToolClass, string> = {
  READ: '只读',
  WRITE: '写入',
  EXECUTE: '执行',
  DELETE: '删除',
  INTERACT: '交互',
  COORDINATION: '协作',
  UNCLASSIFIED: '未分类',
};

/** 基线 / 规则行为的中文名。 */
export const BEHAVIOR_LABELS: Record<PermissionBaselineBehavior, string> = {
  allow: '放行',
  ask: '每次询问',
  deny: '拒绝',
};