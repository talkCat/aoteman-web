# 追问答案交互设计（aoteman-web）

> 状态：设计稿（先设计，确认后实施）。
> 关联文档：`doc/design/chat-interaction-refinement.md`（过程时间线基线）、`doc/tool-interaction-redesign.md`、`doc/user-message-render-fix.md`、`doc/design/frontend-redesign-plan.md`。
> 范围：仅前端 `src/app/page.tsx` 与 `src/types/agent.ts`，不改 `useSSEStream.ts`、API 路由与后端。

---

## 0. 需求

用户提交追问答案后，当前会将其作为一条独立的「用户」气泡追加到消息列表。这样存在两个问题：

1. **语义错位**：追问答案是针对表单的一次「中间输入」，不是新发起的对话，不该以用户气泡的身份进入时间线。
2. **视觉割裂**：一条灰底气泡单独冒出，打断了「问卷 → 答案 → 下一轮」的连贯过程，也和「过程不抢内容」的既有原则冲突。

目标：**用户选择后的结果不单独成气泡，而是并入该轮次的过程时间线（推理/过程脚注区）。**

---

## 1. 现状（代码定位）

- `submitFollowupQuestionnaire`（`page.tsx`）：提交成功后 `setMessages(... type:"user")` 追加一条用户气泡，`turnId` 取 `beginUserTurnRef.current?.()` 的新轮次号。
- 过程时间线基座 `buildTurnSteps` / `ProcessTimeline` 已能把「思考 / 叙述 / 工具」按时序合并为左侧细竖线脚注。
- `TurnGroup` 已有 `thinking / narrations / toolUses`，无「追问答案」这一独立类别。

---

## 2. 设计原则

1. **答案 = 过程脚注，而非消息**：复用 `ProcessTimeline`，给「用户答案」一个独立、轻量的条目类型。
2. **归属同轮次**：答案挂在「问卷所在的轮次」，落在问卷下方、与叙述/工具同层，保持时序连贯。
3. **始终可见**：答案作为「回执」需要一眼确认，不随思考/工具一起折叠；但用更轻的视觉（细竖线 + 小字）表达，不抢正文。
4. **原始 JSON 只回传后端**：前端只展示可读摘要 `1. 问题：答案`，不泄露底层数据结构。
5. **推进轮次语义不变**：提交答案仍需 `beginUserTurnRef` 开启新一轮，防止第二轮问卷并入上一轮（历史 bug）。

---

## 3. 数据模型

`src/types/agent.ts`：

```ts
// 追问答案摘要：用户提交后的选择，作为「中间过程」而非独立气泡展示
export interface FollowupAnswer {
  id: string;
  content: string;            // 人类可读摘要「1. 出行时间：寒假」
  turnId?: number;            // 归属轮次 = 问卷所在轮次
  seq?: number;
  timestamp?: number;
}

export interface TurnGroup {
  ...
  answers: FollowupAnswer[];
}
```

---

## 4. 渲染方案

### 4.1 时间线步骤扩展（`page.tsx`）

- `TurnStep` 联合类型新增 `{ kind: "answer"; answer: FollowupAnswer }`。
- `buildTurnSteps` 把 `turn.answers` 与思考/叙述/工具一起纳入，按 `seq ?? timestamp` 排序。

### 4.2 `ProcessTimeline` 内新增「你的选择」条目

- 从 `steps` 中拆分：`narrations`（始终可见）、`answers`（始终可见）、`mechanics`（思考 + 工具，折叠）。
- 答案条目视觉：
  - 左侧 `border-l-2 border-primary/40` 细竖线；
  - 头部 `User` 图标 + 小字「你的选择」；
  - 正文 `whitespace-pre-wrap text-xs text-muted-foreground`，逐行 `1. 问题：答案`。
- 与「过程」叙述同级，位于叙述之后、折叠的工具/思考之前，且**不随折叠收起**。

### 4.3 提交逻辑（`submitFollowupQuestionnaire`）

```
1. 提交后端（tool_use_id 使用模型侧 toolCallId）。
2. 提交失败（409 / 网络异常）→ return，保留问卷供重试，不推进、不追加。
3. 提交成功：
   a. beginUserTurnRef.current?.()  // 开启新一轮（保留，防第二轮问卷并入上一轮）
   b. setFollowupAnswers(... { content, turnId: followupQuestionnaire.turnId })  // 归属原轮次
   c. setFollowupQuestionnaire(null)  // 关闭问卷
   d. 成功通知
```

---

## 5. 关键决策与理由

| 决策 | 理由 |
| --- | --- |
| 答案 `turnId` = 问卷所在轮次，而非新轮次 | 让答案落在问卷正下方，保持「问卷 → 答案」的相邻时序；新轮次留给模型后续输出。 |
| 仍调用 `beginUserTurnRef` | 推进轮次计数是「第二轮追问不并入上一轮」的必要条件，不能因为不再生成用户气泡而删掉。 |
| 答案「始终可见」而非并入思考折叠 | 用户提交后需要确认回执；塞进思考折叠会让「我选了什么」不可见，降低信任。 |
| 不生成 `message` 气泡 | 消除独立气泡与重复渲染，语义上把答案归为「过程信息」。 |

---

## 6. 边界与异常

- 多轮追问：每个问卷有独立 `turnId`，各轮答案分别落位。
- 重复提交：沿用 `handledFollowupIdsRef` 防重复；问卷提交后置空。
- 重置会话：`clearConversation` 一并清空 `followupAnswers`。
- 提交失败：不追加答案、不推进、保留问卷可重试。

---

## 7. 实施计划

1. `agent.ts`：新增 `FollowupAnswer`，`TurnGroup` 加 `answers`。
2. `page.tsx`：
   - import `FollowupAnswer`；
   - 新增 `followupAnswers` 状态并在 `clearConversation` 清空；
   - `TurnStep` / `buildTurnSteps` / `turns` 分组纳入 `answer`；
   - `submitFollowupQuestionnaire` 改为追加 `FollowupAnswer`；
   - `ProcessTimeline` 渲染「你的选择」。
3. `npx tsc --noEmit` 校验。

---

## 8. 测试计划

- 单次追问：提交后问卷消失，答案出现在该轮过程时间线，无独立用户气泡。
- 多轮追问：每轮答案各归其所在轮次，第二轮问卷正常渲染、不并入上一轮。
- 提交失败：问卷保留，可重试；成功后正常流转。
- 重置会话：答案与问卷一并清空。

---

（本方案为设计稿，确认后再进入/合并实施。）