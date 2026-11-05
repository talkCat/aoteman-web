import { getDemoState } from '@/lib/knowledge-demo';
import type { AdminExpertDetail, UserExpertSummary } from '@/types/knowledge';

/**
 * 用户端专家数据（静态阶段）。
 *
 * 与 AdminExpertDetail 的关键差别：绝不把 systemPrompt 带到浏览器可见的摘要里。
 * 接后端后替换为 GET /api/experts；筛选规则（ACTIVE + 已授权）保持不变。
 */
export function toUserExpertSummary(expert: AdminExpertDetail): UserExpertSummary {
  return {
    expertId: expert.expertId,
    name: expert.name,
    description: expert.description,
    avatarUrl: expert.avatarUrl,
    welcomeMessage: expert.welcomeMessage,
    knowledgeBaseCount: expert.knowledgeBases.filter((binding) => binding.status === 'ACTIVE').length,
    skillCount: expert.skills.filter((skill) => skill.enabled).length,
    mcpCount: expert.mcpServers.filter((mcp) => mcp.enabled).length,
    promptChars: expert.promptChars,
    updatedAt: expert.updatedAt,
  };
}

/**
 * 列出当前用户可选的专家：只包含已发布（ACTIVE）且已授权的专家。
 *
 * 管理员在静态演示中可见全部已发布专家；普通用户按专家授权过滤。
 * 用户没有任何可用专家时返回空数组，问答页据此隐藏「选择专家」入口。
 */
export function listUserExperts(userId: string, isAdmin: boolean): UserExpertSummary[] {
  if (!userId) return [];
  return getDemoState()
    .experts.filter((expert) => expert.status === 'ACTIVE')
    .filter(
      (expert) =>
        isAdmin ||
        expert.grants.some((grant) => grant.userId === userId && grant.status === 'ACTIVE'),
    )
    .map(toUserExpertSummary)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}