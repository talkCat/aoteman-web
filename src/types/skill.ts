/** 技能广场条目（与数据面 SkillController.SkillView 对齐）。 */
export interface SkillItem {
  name: string;
  description: string;
  source: string;
  installed: boolean;
}