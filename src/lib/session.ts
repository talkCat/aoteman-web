/**
 * 当前会话的本地持久化（localStorage，按用户隔离）。
 *
 * 设计依据：doc/design/2026-10-13-用户会话列表与历史记录设计.md §6.1（D4）。
 * 会话 ID 的选择顺序：URL ?session= → 本文件的「最近会话」→ 新生成。
 * 所有读写都用 try/catch 包裹：隐私模式 / 配额满时退化为不持久化，不影响主流程。
 */

const KEY_PREFIX = 'aoteman:lastSession:';

function storageKey(userId: string): string {
  return KEY_PREFIX + userId;
}

/** 读取某用户最近一次使用的 sessionId；无记录 / 不可用时返回 null。 */
export function getLastSessionId(userId: string): string | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    return window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

/** 记录某用户最近使用的 sessionId；写失败时静默忽略。 */
export function setLastSessionId(userId: string, sessionId: string): void {
  if (typeof window === 'undefined' || !userId || !sessionId) return;
  try {
    window.localStorage.setItem(storageKey(userId), sessionId);
  } catch {
    // 忽略：退化为「刷新后回到新会话」
  }
}
