# 用户消息 / 轮次渲染问题排查与修复

## 现象
1. 用户输入完全不显示 / 时有时无（最新）
2. 之前是「同一条用户输入显示两遍」
3. 所有工具卡片堆在顶部/末尾，没有时序
4. 追问问卷提交后重复出现、原始 JSON 直接展示

## 根因（逐条对应）

### 1. 用户消息完全不显示 —— SSE 命名事件没有被渲染
后端 `ConversationController.toSse()` 用
`ServerSentEvent.builder().event(dto.type()).data(json)` 发送，
即**每个事件都是命名事件（event: user.message）**。

浏览器端 `EventSource.onmessage` **只在未命名事件时触发**，所以
`useSSEStream.ts` 里的 `eventSource.onmessage = ... handleEvent(...)`
是**死代码**。真正会触发的是 `addEventListener('user.message', ...)`，
而该监听器当时只调用了 `addTraceEntry(...)`（只写 trace 面板），
**没有调用 onMessage** → 用户消息永远不渲染。

> 静态页 index.html 的做法是：把全部事件类型都注册成
> `addEventListener(type, e => handleEvent(JSON.parse(e.data)))`，
> 由 handleEvent 内部 switch(data.type) 统一分发 —— 所以它能正常工作。

### 2. 显示两遍 —— JSX 里同一个用户消息块写了两份
`page.tsx` 中 `turn.messages.filter(m => m.type === 'user')` 的 **整段 JSX 被复制了两遍**
（569-585 与 587-604 行），一条消息渲染两个气泡。

### 3. 最终消息用错字段
后端 `AgentResultEvent` 落盘的 payload 是
`{ text: "...", content: [{type,text}] }`，
`content` 是**数组**不是字符串。原代码 `String(payload.content)` 会得到
`[object Object]`；且没有用 `payload.text` 替换流式内容，会重复追加。

### 4. 工具结果无法合并回工具卡片
- 工具卡片 id = 事件 id（`evt_xxx`，来自 tool_use 事件 / event_start）
- 工具结果 payload 里的 `tool_use_id` = 模型给的 `call_xxx`

两者不相等，`handleToolResult` 按 id map 更新永远匹配不到 →
卡片一直转圈。需要在前端维护 `call_xxx -> evt_xxx` 映射。

### 5. 轮次（turnId）划分错误
`turnIdRef` 在每个 `session.status_running` 自增，而 status_running 是
一轮里**最先**到达的事件，导致用户消息和紧随其后的工具/回答被分到不同轮次。
改为：以 `user.message` 回显为轮次起点（turnId++）。

### 6. 重连重复回放
`onerror` 重连时固定用 `after=0`，会把整段历史重放一遍 → 消息翻倍。
改为记录已收到的最大 `seq`，重连用 `after=<lastSeq>`。

### 7. 追问问卷重复渲染
`useEffect` 只要发现 toolUses 里有 ask_followup_questions 就重建问卷，
提交后 `setFollowupQuestionnaire(null)` 会立刻被同一个 tool 再次触发。
改为记录已处理过的 tool id。

## 修改清单（前端，不动后端）
- `src/hooks/useSSEStream.ts`：重写为「全部命名事件 → 单一 handleEvent 分发」，
  增加 finalize、去重、turnId、toolCallId 映射、seq 游标
- `src/app/page.tsx`：删除重复的用户消息 JSX；消息按 id 去重；
  新增 onMessageFinalize；修复 update 只按 id 更新；
  问卷调查记录已处理 id；追问答案改为可读文案
- `src/types/agent.ts`：SSEEvent 补充 id/seq 字段

---

## 二次排查（2026-10-04 22:3x）

### A. 真正的「时好时坏 / 完全不显示」根因：两个 Next dev server 共用一个 .next
本机同时有 **两个** `npm run dev`：
- 端口 3000：pid 40168 → 24304 → 16388
- 端口 3001：pid 29080 → 35076 → 39268

两者工作目录都是 `d:\\codex_pro\\aoteman-web`，**同时读写同一个 `.next` 目录**，
互相覆盖编译产物。典型症状：
- `Cannot find module '../chunks/ssr/[turbopack]_runtime.js'`（页面崩溃）
- `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200`（SSE/资源半截）
- Fast Refresh 加载到半成品 bundle → 用户气泡/工具卡片时有时无

**处理**：杀掉全部旧进程 → 删除 `.next` → 只启动 **一个** dev server。
以后不要重复 `npm run dev`（端口被占用时 Next 会静默改用 3001，造成双写）。

### B. 兜底加固：用户消息本地乐观回显（防止依赖 SSE 回显）
原实现「只提交事件、完全等 SSE 回显」——一旦 SSE 断流/重连丢帧，
用户自己发的话就看不到了。
现改为：
1. 发送时立刻插入一条本地乐观气泡（`local_xxx`，半透明）；
2. SSE `user.message` 回显到达时，按**文本 FIFO 匹配**移除对应占位，并写入带 `turnId` 的正式消息；
3. 因此既不会「不显示」（SSE 迟迟不到也有占位），也不会「显示两遍」（回显到达即替换）。

涉及：`src/app/page.tsx` 的 `pendingUserMessages` / `pendingUserRef` / `sendMessage` / `handleMessage`。

### 验证（真实浏览器，清库后单实例）
- 单轮 / 多轮：每轮右侧 1 条用户气泡，左侧 AI 气泡，无重复（unique==total）
- 工具调用：工具卡片落在该轮用户消息与 AI 回答之间，长输出默认折叠
- 无残留流式光标、无 console 报错
