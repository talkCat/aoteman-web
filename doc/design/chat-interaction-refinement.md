# 对话交互降噪与轮次导航设计（aoteman-web）

> 本文仅输出设计与实施方案，不在本轮改代码；确认后进入实施。
> 关联文档：`doc/design/frontend-redesign-plan.md`（令牌与整体视觉基线）、`doc/tool-interaction-redesign.md`、`doc/user-message-render-fix.md`。
> 项目栈：Next.js（App Router, Turbopack）/ React 19 / TypeScript / Tailwind CSS v4 / shadcn-ui（new-york, neutral, lucide）。

---

## 0. 需求来源

用户提出三点：

1. **工具调用的展示过于突出**：现在每次工具调用都渲染成一张带底色的 `Card`（`bg-secondary/40` / `bg-skill/5` + 边框 + 加粗标题「工具调用: xxx」），抢了正文的注意力，且背景框没有必要。
2. **智能体回答单独做了对话框背景**：助手消息是一张带边框、背景、阴影的气泡卡（`rounded-2xl border bg-card shadow-soft`），和用户气泡堆在一起显得笨重。
3. **缺少多轮对话目录锚点**：希望在最左侧加一个轮次目录（ToC），可以快速查看、点击跳转到指定轮次；最左侧区域需要为后续的「历史对话 / 项目」预留位置（本轮不做）。

---

## 1. 现状诊断（代码审计）

### 1.1 工具调用（`src/app/page.tsx:118-168`，`ProcessTimeline` 的 tool 分支）

- 每个工具/技能渲染为 `<Card className="rounded-xl p-3.5 border … bg-secondary/40 | bg-skill/5">`：
  - 有整块背景色 + 边框 + 圆角 + padding，是页面上面积最大、最"实"的块，视觉权重高于助手回答。
  - 标题加粗并带前缀「工具调用 / 技能调用」，信息层级过重。
  - 输入/输出又各自套一层 `border bg-background/60` 的 `pre`，形成"框里框"的双层容器。
- 结果：工具作为"过程信息"，却被渲染成了和最终答案同级的、甚至更重的视觉块，违反"过程不抢内容"的原则。

### 1.2 助手回答（`src/app/page.tsx:1082-1093`）

- 助手消息：`max-w-[85%] rounded-2xl rounded-tl-md border border-border/60 bg-card px-4 py-2.5 shadow-soft`。
- 用户消息：`bg-primary text-primary-foreground rounded-2xl`。
- 两侧都是"气泡"，一左一右对称，但助手内容本质是"文档式正文"，用气泡包裹既压缩了阅读宽度，也增加了无信息量的边框/阴影噪音。

### 1.3 布局与轮次结构（`src/app/page.tsx:1036-1160`）

- 布局为 `flex`：主内容区（`max-w-3xl` 居中） + 右侧 TRACE 抽屉，**没有左侧栏**。
- 轮次容器（`page.tsx:1050-1094`）：`<div key={turn.turnId} className="mb-6">`，**没有 DOM id**，无法作为锚点；顶部有一条「第 N 轮」分隔线（仅 `turnId > 0` 时渲染）。
- 滚动容器是 Radix `ScrollArea`（`page.tsx:1038`），视口是内部的 `[data-radix-scroll-area-viewport]`，跳转需要针对该视口滚动，且要处理 sticky header（`h-14`）的遮挡。

### 1.4 可复用资产

- 令牌已具备：`--primary`（唯一强调色）、`--skill`、`--tool`、`--thinking`、`--success/warning/destructive`、`--border`、`--radius-*`、`--shadow-soft/card/float`、`animate-message-in`（含 reduced-motion 兜底）。
- 已安装可复用组件：`ScrollArea`、`Collapsible`、`Tooltip`、`Separator`、`Button`、`Badge` 等，无需新增依赖。
- `buildTurnSteps()`（`page.tsx:37-49`）已能把思考/叙述/工具按时序合并，是重构过程时间线的现成基座。

---

## 2. 设计原则

1. **过程即轻量脚注，内容才是主体**：思考 / 叙述 / 工具统一收敛为一条左侧细竖线的时间线，只用图标 + 小字 + 语义色表达，不用整块色卡。
2. **一个气泡只保留给"用户"**：用户输入用右对齐气泡做"引文"；助手回答回归文档正文，去除容器背景/边框/阴影。
3. **颜色只表达状态与类型**：工具=中性灰（`--tool`）+ `Wrench`；技能=主色（`--skill`）+ `Sparkles`；成功/失败/进行中只用 `success/destructive/muted` 图标，不给整块底色。
4. **导航与内容分层**：最左侧为导航栏（现在放轮次目录，未来放项目/历史），中间为对话主区；导航是"辅助",不挤压阅读区。
5. **锚点跳转必须"稳"**：考虑 sticky header 偏移、滚动容器是内部视口、以及滚动监听高亮。
6. **动效只回答动作**：保留消息入场、展开折叠、当前轮次高亮等必要反馈；尊重 `prefers-reduced-motion`。

反模板纪律：不引入新的饱和强调色，不用"每个步骤一张卡"的 SaaS 套件感，不为了对称而给助手也画气泡。

---

## 3. 目标形态（Before / After 线框）

### 3.1 布局

```
Before                                   After
┌──────────────────────────┬──────┐      ┌──────┬────────────┬──────────┬──────┐
│  header                  │      │      │ 项目/ │ 轮次目录   │ 对话主区 │TRACE │
├──────────────────────────┤TRACE │      │ 历史  │ (ToC)      │          │      │
│        (无左侧栏)         │      │      │ (预  │ 1. 你好…   │  …       │      │
│                          │      │      │  留)  │ 2. 查一下… │          │      │
└──────────────────────────┴──────┘      └──────┴────────────┴──────────┴──────┘
```

- 新增最左侧栏（宽约 248px，可折叠）。本轮内容：顶部预留"项目 / 历史对话"占位区（空态或收起态）；下方为**轮次目录**。
- 窄屏（`< 1024px`）：左栏收起为悬浮按钮 / 抽屉，不挤占对话。

### 3.2 工具调用

```
Before
┌────────────────────────────────────────────┐  ← 整块底色 + 边框 + padding
│ 🔧 工具调用: web_search            ⟳ 成功   │
│  ▸ 输入参数                                 │
│  ▾ 输出结果 (1.2k 字符)                     │
│    ┌──────────────────────────────────────┐ │  ← 又一层框
│    │ {...}                                │ │
│    └──────────────────────────────────────┘ │
└────────────────────────────────────────────┘

After
│  🔧 web_search · 工具        ✓        12:03   ← 无背景、无边框，贴在时间线竖线上
│     ↳ query: "2026 前端趋势"                   ← 单行入参摘要（muted，可点击展开）
│     ✓ 完成 · 1.2k 字符                         ← 状态用文字+图标，不用色块
│     （点击后）详细输入/输出：mono 小字，无底色无边框，超 200 字默认折叠
│
```

### 3.3 助手回答

```
Before
                          ┌────────────────────────────────┐
                          │ 助手正文，被气泡宽度和边框包裹      │
                          └────────────────────────────────┘

After
[◉] 智能体
    助手正文直接铺在画布上，无背景、无边框、无阴影；
    行宽受列宽约束（约 68ch），行高放松，阅读连续。
```

---

## 4. 详细设计

### 4.1 过程时间线：工具调用降噪（重点）

统一 `ProcessTimeline`（`page.tsx:53-175`）三类的视觉语言，全部落在同一条左侧 2px 竖线上，工具不再独立成卡。

**结构（每步）**

```
│  <icon> <主标题> · <类型标签>   <状态图标>   <时间>     [可点击展开]
│     <单行摘要>                                          (muted, 11-12px)
│     <展开区：输入 / 输出>                                (mono, 默认折叠)
```

**逐项规范**

| 元素 | 规范 |
| --- | --- |
| 竖线 | `border-l-2`，思考 `--thinking/40`、叙述 `--border`、工具 `--tool/40`、技能 `--skill/40`；与现有 thinking/narration 分支保持一致 |
| 图标 | 工具 `Wrench`（`text-tool`）；技能 `Sparkles`（`text-skill`）；思考 `Sparkles`（`text-thinking`）；叙述 `MessageSquareText`（`muted`） |
| 主标题 | 工具/技能：显示名（`getToolDisplayName`），`text-[13px] font-medium`，**不再加"工具调用:"前缀** |
| 类型标签 | 11px `muted-foreground`，文案「工具」/「技能」/「思考」/「过程」 |
| 状态 | `success` → `CheckCircle text-success`；`error` → `XCircle text-destructive`；`pending` → `Loader2 animate-spin text-muted-foreground`，放在标题行右端，**不使用实心 badge** |
| 入参摘要 | 复用并升级 `getInputPreview()`：优先 `path/target/url/query/prompt` 等字段，截断约 60 字，`text-xs text-muted-foreground`，前缀 `↳` |
| 展开交互 | 整行标题可点，或保留一个小 `ChevronDown`；展开区渲染「输入」「输出」两段 |
| 展开区 | `<pre>` 用 `bg-transparent`（**去掉 `border bg-background/60`**），仅用 `text-[11px] font-mono tabular-nums text-muted-foreground` + `max-h-48 overflow-x-auto`；输出 > 200 字默认折叠，折叠时显示「… 点击展开（共 N 字）」 |
| 背景 | **完全移除** `Card` 底色/边框/圆角/padding；整条时间线共享一个外层容器，无需逐步描边 |

**技能 vs 工具**：只靠图标颜色 + 类型标签区分，不再用 `bg-skill/5` 整块着色。

**进行中处理**：当前步的 `Loader2` 旋转；时间线左竖线对当前步做一段主色高亮（可选，用 `::before` 或一层 `bg-primary/40` 渐变），轮次结束后消失。`ProcessTimeline` 现有的 `manualOverride` 自动展开/收起逻辑保留。

### 4.2 助手回答去容器化

改 `page.tsx:1082-1093`：

- 移除助手气泡的 `border bg-card shadow-soft rounded-2xl px-4 py-2.5`。
- 改为"正文块"：
  ```
  <div id/… className="animate-message-in">
    <div className="mb-1.5 flex items-center gap-2 text-muted-foreground">
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Bot className="h-3 w-3" />
      </span>
      <span className="text-[11px] font-medium">智能体</span>
    </div>
    <div className="whitespace-pre-wrap text-sm leading-7 text-foreground">
      {content}
      {isStreaming && <光标 />}
    </div>
  </div>
  ```
- 宽度：不再 `max-w-[85%]` 气泡约束，正文占满对话列（列宽本身 `max-w-3xl` 已约束行宽；如需更佳阅读可给正文 `max-w-[68ch]`）。
- 与用户气泡的区分：用户=右对齐实心气泡；助手=左对齐 `Bot` 小标识 + 纯正文，不再对称画框。
- 流式光标沿用现有内联光标样式。
- **用户气泡保持**（用户未要求改）；如后续想进一步降噪，可把用户气泡由实心 `bg-primary` 调为 `bg-secondary text-secondary-foreground`，本轮作为可选项，不改。

> 说明：助手回答目前是 `whitespace-pre-wrap` 纯文本，不含 markdown 渲染；本设计不改变渲染管线，仅移除容器。

### 4.3 左侧栏与轮次目录（ToC）

**4.3.1 栏位结构**

左栏自上而下：

1. **项目 / 历史对话（预留）**：占位区。本轮呈现为分区标题 + 空态文案（如「项目与历史对话 · 后续开放」）或整体收起的图标条，让布局现在就为将来留出位置，未来只需替换内容。
2. **本轮轮次目录（ToC）**：标题「对话轮次」+ 滚动列表。

**4.3.2 目录条目**

每个条目 = 一轮：

- 序号：`第 N 轮`（或 `N`）；
- 摘要：该轮**首条用户消息**的前 18–24 字，超出省略（工具确认 / 追问提交产生的用户摘要同样可作摘要）；
- 状态点：该轮进行中时显示 `--success` 脉冲点（`isActive`），否则不显示；
- 可选：右侧小字显示该轮工具调用次数（来自 `turn.toolUses.length`）。

条目列表来源：`turns`（已计算，`page.tsx:754-790`）中**含用户消息**的轮次；不含用户消息的纯过程轮次（如工具确认轮）可选择跳过或用兜底文案，建议默认跳过以保持简洁。

**4.3.3 跳转**

- 给每个轮次容器加锚点：`<div id={\`turn-${turn.turnId}\`} data-turn-id={turn.turnId} className="scroll-mt-20 …">`（`scroll-mt-20` 抵消 sticky header）。
- 点击条目：取 Radix 视口 `rootRef.current?.querySelector('[data-radix-scroll-area-viewport]')`，对其调用滚动，或直接 `document.getElementById('turn-N')?.scrollIntoView({ behavior: 'smooth', block: 'start' })`（`scroll-mt` 保证不被 header 遮挡）。
- 需要给主对话 `ScrollArea` 加 `ref`（参考 TRACE 面板 `traceScrollRef` 用法，`page.tsx:1170`）。

**4.3.4 滚动高亮（scroll spy）**

- 用 `IntersectionObserver`，`root` 设为上面的 Radix 视口元素，对每个 `[data-turn-id]` 观察。
- 取"当前进入视口顶部区域"的轮次作为 active，写入 `activeTurnId`，目录条目高亮（`bg-secondary` + 左侧主色条）。
- 监听视口变化（挂载 / `turns` 变化时重建 observer）；`prefers-reduced-motion` 下跳转改为瞬时（`behavior: 'auto'`）。

**4.3.5 折叠与响应式**

- 桌面（`≥ 1024px`）：左栏常驻，宽 ~248px，可折叠为图标条（记住折叠状态于 `localStorage`）。
- 窄屏（`< 1024px`）：左栏默认隐藏，header 提供一个目录按钮，以 `Sheet` / 抽屉形式弹出。
- 目录列表过长时内部滚动，标题吸顶。

---

## 5. 组件与文件改动清单

| 文件 | 改动 |
| --- | --- |
| `src/app/page.tsx` | ① `ProcessTimeline` tool 分支去卡片化、统一时间线；② 助手消息去气泡；③ 轮次容器加 `id / data-turn-id / scroll-mt`；④ 主 `ScrollArea` 加 `ref`；⑤ 接入左栏（或引用新组件）与 `activeTurnId` 状态 |
| `src/components/ConversationToc.tsx`（新增，建议） | 轮次目录组件：入参 `turns` / `activeTurnId` / `onSelect`；含预留的"项目/历史"分区与折叠逻辑。抽出以控制 `page.tsx`（已 1231 行）体积 |
| `src/app/globals.css` | 新增少量令牌：左栏宽度 `--sidebar-width` 复用；时间线竖线/当前步高亮；`scroll-margin` 兜底；如需可加 `.animate-toc-active`。避免新增饱和色 |
| `src/types/agent.ts` | **不改**（`TurnGroup` 已含所需字段） |
| `src/hooks/useSSEStream.ts` | **不改**（不触碰连接/去重/turnId 逻辑） |
| 后端 / API | **不改** |

TRACE 抽屉、追问卡、确认卡仍保留 `Card` 外观（它们是需要聚焦的**交互动作**，与"过程信息"不同，保留容器是合理的）。

---

## 6. 交互动效

- 助手正文入场：沿用 `animate-message-in`（180ms 位移淡入）。
- 工具展开/折叠：高度 + 透明度过渡（用户动作触发）。
- 目录 active 切换：背景/左侧色条 120ms 过渡；不自动滚动目录，仅当 active 条目滚出目录可视区时再 `scrollIntoView(block:'nearest')`。
- 当前步运行脉冲与跳转平滑滚动，`prefers-reduced-motion` 下全部退化为无位移 / 瞬移。

---

## 7. 无障碍

- 目录为语义化 `<nav aria-label="对话轮次">` + 列表；active 项 `aria-current="true"`。
- 每个目录条目是按钮/链接，键盘可 Tab 聚焦，`focus-visible` 可见（已有全局 outline）。
- 工具展开区用 `Collapsible` 自带 `aria-expanded`；状态图标补 `aria-label`（如「成功」「进行中」）。
- 触控目标 ≥ 44px：目录条目高度 ≥ 40px 并做 padding。
- 对比度：muted 小字与背景保持 ≥ 4.5:1（沿用现有 `--muted-foreground`）。
- 保留并复用现有 skip-link「跳到对话区」。

---

## 8. 实施顺序（低风险优先，每步可独立提交）

1. **助手回答去气泡**（改动最小、收益直观）。
2. **工具调用去卡片化**：统一 `ProcessTimeline` 三类为同一时间线语言，去掉背景/边框/双层 `pre` 框。
3. **轮次锚点**：给轮次容器加 `id / scroll-mt`，主 `ScrollArea` 加 `ref`，实现点击跳转。
4. **左栏 + 目录组件**：新增 `ConversationToc`，接入 active 高亮（scroll spy），加"项目/历史"预留区。
5. **折叠与响应式**：桌面折叠、窄屏抽屉、目录吸顶。
6. **打磨**：当前步高亮、动效、a11y 标注、对比度复检。

每步均不改 SSE 逻辑、事件协议与后端。

---

## 9. 约束与红线

- 不改 `useSSEStream.ts` 的连接 / 去重 / 重连 / `turnIdRef` / `beginUserTurn` / 预览帧逻辑。
- 不改 `src/types/agent.ts` 字段与事件名。
- 不改 API 路径与请求/响应体。
- 不迁移 Tailwind 版本，不新增重依赖（左栏折叠/抽屉复用已装的 `Sheet`、`Tooltip`、`Collapsible` 等）。
- 保留全部既有功能：身份编辑/复制、TRACE 开关、深度思考、工具/技能展示、确认、追问、思考/叙述、通知与错误态、乐观用户消息。
- 不触碰后端，不提交/泄露 `token.txt`、`.env*` 等敏感文件。

---

## 10. 验收清单

- **工具调用**：时间线中不再出现整块底色卡片；工具/技能仅靠图标色 + 类型标签区分；输入/输出展开时无"框里框"；长输出默认折叠。
- **助手回答**：无背景/边框/阴影；左对齐带 `Bot` 小标识；正文阅读连贯、行宽舒适。
- **目录**：左栏列出各轮摘要；点击平滑跳转到对应轮且不被 header 遮挡；滚动时对应条目高亮；进行中轮次有状态提示。
- **预留**：左栏存在明确的"项目 / 历史对话"占位，未来可直接填充而不改布局。
- **响应式**：`< 1024px` 左栏以抽屉呈现，不横向溢出。
- **通用**：深浅两模式均正常；无新增硬编码颜色；键盘可完整操作；`prefers-reduced-motion` 生效；不改动接口协议与后端。

---

## 11. 评审与修订（结合 Codex / Claude / 豆包 与 ui-ux-pro-max）

> 评审依据：`ui-ux-pro-max`（UX / 导航 / 无障碍规则）与 Codex CLI、Claude Code、豆包 的线上实现。

### 11.1 总体结论

方案方向正确且与一线产品一致，三项改动均有竞品直接佐证；但有 4 个会被放大的风险点，需修订后再实施。

**竞品对照**

| 维度 | Codex CLI | Claude Code / Claude UI | 豆包 | 本方案 | 评定 |
| --- | --- | --- | --- | --- | --- |
| 工具调用呈现 | `• Ran/Read/Search` + `└` 树状输出，无框，dim 截断 | 折叠在助手消息内，完成后默认收起 | 「逐步执行」进度 | 去卡片、并入时间线竖线 | ✅ 方向一致 |
| 助手回答 | 纯文本前缀，无边框 | **无硬气泡**，2px 左侧色条 + 平铺 | 平铺正文 | 去背景/边框，`Bot` 小标识 | ✅ 高度一致 |
| 用户消息 | 背景色块（非分隔框） | 右对齐实心 pill | 右对齐 | 保留气泡 | ✅ 一致 |
| 左侧栏 | 无（TUI） | Projects / 历史 | **新对话 + 最近对话 + 创作** | 目录 + 预留项目/历史 | ✅ 预判正确 |
| 折叠态信息量 | 动词 + 对象（`Ran git status`） | `Called X 5 times` 聚合 | 步骤可读 | 仅工具名 | ⚠️ 偏弱 |
| 连续同类工具 | **合并**成 `• Exploring` 一块 | **折叠**成一行计数 | 分组进度 | 一调用一行 | ⚠️ 长任务刷屏 |
| 助手 Markdown | 代码块 / 列表 | 代码块 / 表格 | 富文本 | 明确不改，保持 pre-wrap | ⚠️ 见 11.3 D |

**与最佳实践相合、无需改动**

1. 工具去卡片化 + 竖线时间线：即 Codex / Claude 做法，符合技能库「过程即轻量脚注」与 minimalism / Swiss 方向。
2. 助手去气泡：与参考实现的 assistant `no hard bubble, thin 2px accent left-stripe + flat background` 同构。
3. 保留用户气泡、确认/追问仍用 Card：正确——确认与追问是需要聚焦的动作，与过程信息不同级。
4. 左栏为项目/历史预留：与豆包侧边栏、Claude Projects 对齐，属正确的未来向布局。

### 11.2 风险点与修订（按优先级）

**P0 — 叙述（Narration）不应被折叠进时间线**

Claude Code 的 issue #75900 / #81325 是强警示：工具调用之间的助手叙述，是用户纠偏、插话、止损的唯一信号；一旦被折叠，"agent 就像全程沉默"。

本方案把 `Narration` 放进 `ProcessTimeline` 的 `CollapsibleContent`（`page.tsx:105-116`），轮次结束后自动收起（`page.tsx:57-59`），意味着模型的过程叙述默认不可见——这是功能级问题，不只是视觉。

修订：叙述留在主流程可见，或**含叙述时时间线不自动收起**；折叠只留给 thinking 与工具机制细节。

**P1 — 折叠态必须自解释（动词 + 对象）**

Codex 折叠行是 `• Ran git status` / `• Read main.rs`；本方案折叠行只有图标 + 工具名（现为「工具调用: name」）。

修订：把 `getInputPreview`（`page.tsx:839-846`）提升为动作句式——`读取 config.ts` / `搜索 "react hooks" in src`，让收起行本身就是可读的"做了什么"。

**P1 — 连续同类工具应合并**

Codex 把 read/search/list 合并为 `• Exploring`，Claude 折叠为 `Called X 5 times`；一调用一行会在调研任务里产生 15–30 行噪音。

修订：连续的低风险同类型调用合并为一行（显示计数、可展开子项）；审批类 / 写操作永远单独展示。

**P2 — 助手正文缺 Markdown，去盒后可能更难读**

方案明确不改渲染管线（现为 `whitespace-pre-wrap`，`page.tsx:1087`）。但 Codex / ChatGPT / 豆包 的回答都渲染代码块与列表；去掉容器后结构化回答变成一堵纯文本墙，"内容为主"的收益被抵消。

修订：至少支持围栏代码块 + 行内代码 + 有序/无序列表（可限定这三类），或明确列为紧随其后的必做项。

### 11.3 其他细化建议

- **状态视觉**（P2）：长任务里每步都亮 `--success` 绿勾会形成"绿勾海"。参考 Codex——完成态低调处理，**终态只标在"合并组"上**，单步不抢色。
- **对比度**（P1，a11y）：去背景后 11px 的 `muted-foreground` 成为工具行唯一信号。浅色 `--muted-foreground: oklch(0.5)` 对 `oklch(0.982)` 背景接近 4.5:1 临界，11px 属普通文本，须实测达标，建议改用 `foreground/80` 或专用已校验的 `--tool` 色。
- **ToC 可用性**（P2）：a) 用 IntersectionObserver 时给 `rootMargin` 留约 20% 顶部触发带，避免抖动（技能库：Smooth Scroll / Active State / fixed nav 不得遮挡）；b) 超长会话轮次会无限增长，豆包 / ChatGPT 用 LLM 生成标题，本轮先用首条用户消息摘要，但应预留"分组 / 折叠章节"；c) 「项目/历史」占位应是**带空态文案的可折叠分区**（Empty State 需给出引导），而非禁用灰块。
- **组件选择**（a11y）：技能库建议用 `Accordion` 而非自研 `<div onClick>`；项目已用 Radix `Collapsible`（Accordion 底层原语），保留即可，确认 `aria-expanded` 与状态图标 `aria-label / aria-hidden`。触控目标：Web 用 WCAG Target Size（≥24px），移动端 44pt / 48dp——用 padding 扩大命中区即可，不必放大视觉。
- **响应式**（P1）：`<1024px` 抽屉方案正确；补充 375px 验证，注意 header 现有 4 个图标按钮加 ToC 开关后窄屏需收纳。

### 11.4 修订后的实施顺序（替换第 8 节）

1. 助手去气泡（不动渲染管线，但**同步评估 Markdown 是否纳入本轮**）。
2. 工具去卡片化 + **折叠态改为动作句式** + 状态收敛（dim / 绿勾只在组上）。
3. 轮次锚点（`id / scroll-mt` + 视口 ref）。
4. 左栏 + 目录（空态分区 + scroll spy + 20% 触发带）。
5. **叙事可见性修正**（P0，与 2 / 4 同批，避免回归）。
6. 连续同类工具合并（可独立提交）。

红线维持不变：不改 `useSSEStream.ts`、`types/agent.ts`、API 与后端；以上均为纯前端呈现层改动。

### 11.5 布局语义修正（据产品澄清，覆盖第 4.3 节旧描述）

对照早期设计，产品对「最左侧」的意图做了澄清，据此修正：

1. **最左侧栏 = 会话导航，而非轮次目录**。最左侧（`SessionSidebar`，宽约 240px）规划用于「项目」与「历史对话」，且**历史对话按 session 区分**；本轮仅做骨架与空态占位，不接入数据。
2. **轮次锚点 = 对话框模块左侧的悬停轨道**（`TurnAnchorRail`），不再放在最左侧栏。它是紧贴对话主区左侧的细轨道：
   - 常规态**不展示任何内容**，只保留极简标记（细横条），当前轮次加长/高亮；
   - 鼠标悬停或键盘聚焦到某个标记时，才在右侧浮出该轮摘要卡片（轮次序号 + 工具次数 + 首条用户消息摘要），点击跳转；
   - **锚点集中排列**：所有锚点在对话区左侧**垂直居中聚拢**（`justify-center` + 小间距），不按内容位置分散；滚动时仅**当前轮次标记高亮**随之切换；
   - 触控端无 hover，`< lg` 默认隐藏轨道（移动端抽屉只承载最左侧的会话导航）。
3. **整体不随对话滚动**：根容器由 `min-h-screen` 改为 `h-dvh overflow-hidden`，并给滚动区加 `min-h-0`；滚动只发生在对话内部 `ScrollArea`，header 与输入框保持固定，不再被长会话顶下去。
4. 因此横轴层次为：`[会话导航 SessionSidebar] [轮次锚点轨道 TurnAnchorRail] [对话主区] [TRACE]`。
5. 组件更名：`ConversationToc.tsx`（已删除）拆分为 `SessionSidebar.tsx` 与 `TurnAnchorRail.tsx`；`page.tsx` 中原「左栏轮次目录」的接入点相应替换。

> 第 4.3 节中「最左侧栏内含轮次目录（ToC）」的旧描述作废，以本 11.5 节为准；第 4.3 节关于「轮次条目生成 / scroll spy / 锚点跳转」的技术要点仍然适用，只是承载组件由左栏改为悬停轨道。

### 11.6 助手 Markdown 渲染（已接入，取代 11.2-P2 的「不改渲染管线」）

**问题定性（据线上现象）**：服务端把助手答复作为纯字符串放在 `payload.text`（流式为 `payload.delta`）里透传，内容本身是 GFM Markdown；前端此前用 `whitespace-pre-wrap` 当纯文本输出，导致 `## / ** / --- / 列表` 原样显示。**属前端渲染缺口，非服务端 bug**；契约层面 `text` 未声明格式，仅靠「默认 Markdown」的隐含约定。

**落地**：
- 新增依赖 `react-markdown@10` + `remark-gfm@4`（`pnpm add`）；新增组件 `src/components/Markdown.tsx`，用 `components` 映射贴 Tailwind 样式（标题 / 列表 / 引用 / 分隔线 / 代码块 / 表格 / 链接），无需 `@tailwindcss/typography`。
- `page.tsx` 助手消息改用 `<Markdown content=… />`；流式时在正文末尾追加 `▍` 作为光标。
- 安全性：`react-markdown` 默认**不渲染原始 HTML**（未启用 `rehype-raw`），并用内置 `defaultUrlTransform` 过滤 `javascript:` 等协议；外链加 `target=_blank rel=noreferrer noopener`。
- 成本：首页 First Load JS 约 +45KB（154KB → 199KB）。

**契约建议（待服务端确认）**：`agent.message` 增加 `format: 'markdown' | 'text'`（默认 `markdown`），前端按声明渲染；叙述 `narration` / 思考 `thinking` 维持纯文本。

---

（本方案为设计稿，含第 11 节评审修订；布局语义以 11.5 节为准，Markdown 渲染见 11.6，实施按第 11.4 节顺序推进。）
