# 前端视觉与交互优化方案设计（aoteman-web）

> 依据技能：frontend-design、redesign-existing-projects、design-taste-frontend（taste-skill v2）、ui-ux-pro-max。
> 本文仅输出方案，不在本轮改代码；确认后进入实施阶段。
> 项目栈：Next.js 15.5.7（Turbopack） / React 19 / TypeScript 5 / Tailwind CSS v4 / shadcn-ui（new-york, neutral, lucide）/ framer-motion / next-themes。

---

## 0. 设计定位（Design Read）

一句话判断：

> 这是一个「面向个人用户与开发者的 AI 智能体工作台」，语气克制、偏工具/工作台语言。视觉上向 Claude / ChatGPT 式克制对话界面靠拢，同时用一条清晰、轻量的「过程时间线」作为差异化的记忆点：让用户能看见「思考 → 叙述 → 工具/技能调用 → 最终回答」的完整执行脉络，而不是把中间过程堆成噪音。

产品核心任务（audience 的 job）：
1. 和助手进行自然语言对话，得到可靠回答。
2. 在长任务中看清助手正在做什么（工具、技能、中间叙述）。
3. 调试时能定位问题（trace 面板、可编辑的 userId/sessionId）。

三只旋钮（taste-skill 基线校准）：

- DESIGN_VARIANCE = 5（克制、接近对称，不追求花哨）;
- MOTION_INTENSITY = 4（动效只回答用户动作，不做大面积自动动画）;
- VISUAL_DENSITY = 4（对话区留白充足，过程时间线展开时可到 5）。

反模板纪律（明确要避免的 AI 默认脸）：
- 不用紫色/蓝色「AI 渐变」，不用奶油底色 + 陶土色强调。
- 不用全大写的 eyebrow 标签、不用「词 · 词 · 词」元信息串联。
- 不用 Inter + slate-900 的默认组合（本项目已用 Geist/Geist Mono，保留并规范化）。
- 不做「每个卡片都一样圆角 + 同一种灰影」的 SaaS 卡片套件。

---

## 1. 现状诊断（基于代码审计）

### 1.1 全局令牌层（src/app/globals.css）

- 当前是 shadcn 默认的全中性 oklch 变量，纯灰、零品牌性格，没有本项目的气味。
- 缺少「过程类型语义色」（思考/叙述/工具/技能）与「多级阴影/圆角/字号」令牌，导致页面各处用魔数表达样式。
- radius 只有单一 --radius，圆角层级表达弱。

### 1.2 页面（src/app/page.tsx）

- 大量硬编码 Tailwind 颜色散落各处：用户气泡 bg-blue-500、思考 purple、运行脉冲 emerald、确认 amber、通知 red/green/amber、工具卡 blue、技能 purple。四个以上强调色同时存在，违反「单一强调色」原则。
- header 上方还有一整条「身份信息栏」常驻显示 userId/sessionId，占用主视线，与「对话」主任务关系弱。
- 主题存在双轨管理：页面用本地 theme state + 手动 document.documentElement.classList.toggle，同时 layout.tsx 又挂了 next-themes 的 ThemeProvider(attribute=class) 与现成的 ThemeToggle 组件，两套逻辑并存，易冲突。
- 用户气泡为实心纯色块（bg-blue-500），缺少层次；助手气泡与思考/工具卡片的边框语言不统一（生硬 1px 边框感）。
- 空状态、流式中的「输入中」光标、通知、错误提示都是极简默认样式，没有设计落点。
- 工具卡 / 过程时间线虽已具备「折叠与按 seq 排序」的正确结构，但视觉是临时搭建感，未与全局令牌打通。

### 1.3 项目级细节

- layout.tsx：html lang="en"（应为 zh-CN），metadata.title 仍是 "Zoer.ai"，缺 favicon 与 description。
- 组件库齐全（framer-motion、next-themes、lucide、sonner 均已在依赖里），无需新增重依赖即可完成优化。

### 1.4 已知但属于功能 bug（不在本设计范围内，实施阶段一并处理或单列）

- 追问问卷「提交答案」在部分流式/第二轮场景下按钮保持置灰（功能问题，不在视觉修改中引入回归）。
- 主题双轨管理（上文 1.2 已列，实施时统一到 next-themes）。

---

## 2. 设计原则（融合四套技能）

1. 单一强调色：全站只保留一个低饱和度主色，其余均为中性灰；颜色只用来传达状态（成功/警告/错误）与过程类型，不做装饰。
2. 过程即内容：把「思考/叙述/工具/技能」做成一条轻量的轮次内时间线，左侧细竖线 + 灰/弱彩小字，不抢最终回答。
3. 字体的差异感来自用途而非花样：正文用规范化 Geist，工具 I/O、ID、序号、时间戳用 Geist Mono + tabular-nums，形成「工作台/操作台」气质，而不是靠花哨字体。
4. 留白最大化：对话区居中约束宽度，悬浮输入区，减少卡片边框压迫感。
5. 动效只回答动作：消息入场、展开折叠、确认状态切换才动；尊重 prefers-reduced-motion，不做分散的 hover 动画群。
6. 无障碍先行：对比度 4.5:1、:focus-visible 可见、触控目标 ≥ 44px、流式内容用 aria-live 聚合播报。

---

## 3. 设计令牌（Design Tokens）

在现有 shadcn oklch 变量体系之上扩展，不迁移 Tailwind 版本。

### 3.1 色板（统一冷灰基底 + 单一青蓝主色）

| Token | Light | Dark | 用途 |
| --- | --- | --- | --- |
| --background | oklch(0.985 0.003 250) | oklch(0.17 0.012 250) | 页面底 |
| --card / --surface | oklch(0.995 0.001 250) | oklch(0.21 0.012 250) | 卡片/气泡 |
| --surface-2 | oklch(0.97 0.003 250) | oklch(0.25 0.012 250) | 悬浮/悬停 |
| --border | oklch(0.91 0.005 250) | oklch(0.28 0.012 250) | 分隔 |
| --foreground | oklch(0.22 0.02 250) | oklch(0.93 0.005 250) | 主文本 |
| --muted-foreground | oklch(0.55 0.01 250) | oklch(0.68 0.01 250) | 次级文本 |
| --primary | oklch(0.60 0.11 205) | oklch(0.74 0.10 205) | 唯一强调色 |
| --primary-foreground | oklch(0.99 0 0) | oklch(0.16 0.02 250) | 主色之上的文字 |
| --ring | oklch(0.60 0.11 205 / .6) | oklch(0.74 0.10 205 / .6) | 焦点环 |

语义色（两模式共用，饱和度 < 80%）：

| Token | Light | Dark | 用途 |
| --- | --- | --- | --- |
| --success | oklch(0.62 0.14 160) | oklch(0.72 0.14 160) | 工具成功/完成 |
| --warning | oklch(0.73 0.12 85) | oklch(0.80 0.11 85) | 确认/中断提醒 |
| --destructive | oklch(0.58 0.20 25) | oklch(0.70 0.18 25) | 错误/失败 |
| --info | = --primary | = --primary | 中性提示 |

过程类型色（只做细线与淡背景，不做饱和填充）：

| Token | Light | Dark | 含义 |
| --- | --- | --- | --- |
| --process-thinking | oklch(0.57 0.06 300) | oklch(0.70 0.06 300) | 思考（保留极低饱和的灰紫，语义已确立） |
| --process-narration | oklch(0.58 0.01 250) | oklch(0.66 0.01 250) | 中间叙述（中性，贴近文本） |
| --process-tool | oklch(0.55 0.01 250) | oklch(0.68 0.01 250) | 工具调用（中性 mono，操作台感） |
| --process-skill | = --primary | = --primary | 技能调用（用主色区分，不新增第二种饱和色） |

说明：工具用中性灰 + Wrench 图标、技能用主色 teal + Sparkles 图标来区分，避免「工具=蓝、技能=紫」的双饱和色散点；状态色只用于 success/warning/error。

### 3.2 字号与行高

| Token | 大小 | 行高 | 用途 |
| --- | --- | --- | --- |
| --text-2xs | 11px | 1.4 | 元信息、seq、状态标签 |
| --text-xs | 12px | 1.45 | 标签、工具 I/O |
| --text-sm | 13px | 1.5 | 辅助说明 |
| --text-base | 14px | 1.6 | 聊天正文 |
| --text-lg | 16px | 1.5 | 小节标题 |
| --text-xl | 18px | 1.45 | 面板标题 |
| --text-2xl | 22px | 1.4 | 页面标题 |
| --text-3xl | 28px | 1.35 | 空状态引导标题 |

- 正文 mono 与 ID/时间戳/序号启用 tabular-nums，数字对齐。
- 中文文案一律句子式大小写，不做全大写标签；标签用 2xs/xs 灰字即可。

### 3.3 间距（4px 基准栅格）

与 Tailwind v4 默认 spacing=0.25rem 对齐，只新增语义阶，不引入非栅格值：

--spacing-1 4 / --spacing-2 8 / --spacing-3 12 / --spacing-4 16 / --spacing-5 20 / --spacing-6 24 / --spacing-8 32 / --spacing-10 40 / --spacing-12 48 / --spacing-16 64。

- 对话区行距、卡片 padding、气泡圆角一律取该阶，消灭 gap-1.5 / p-4 与 px-2 混用的不一致。

### 3.4 圆角阶梯

| Token | 值 | 用途 |
| --- | --- | --- |
| --radius-sm | 6px | 代码块、chip、badge |
| --radius-md | 10px | 工具卡、表单、确认卡 |
| --radius-lg | 14px | 气泡、面板 |
| --radius-xl | 18px | 弹层/浮层 |
| --radius-pill | 999px | 状态点、胶囊标签 |

### 3.5 阴影层级（有色阴影，不叠纯黑 0.1）

统一光源从顶部来，阴影带冷灰底色：

| Token | 值 | 用途 |
| --- | --- | --- |
| --shadow-1 | 0 1px 2px oklch(.2 .02 250 / .06), 0 1px 3px / .04 | 静止卡片 |
| --shadow-2 | 0 4px 12px / .08, 0 2px 4px / .05 | 悬浮输入区 |
| --shadow-3 | 0 12px 32px / .14, 0 4px 12px / .08 | popover/模态 |
| --shadow-ring | 0 0 0 2px var(--ring) | 焦点环 |

暗色的阴影更强、更模糊，但底色仍带冷灰，避免发灰发脏。

---

## 4. 布局结构

- 全局：flex 纵向，header 固定、内容区 flex-1、footer 输入区悬浮。
- 对话区：max-width 约 720px（窄屏 100%），mx-auto 居中，留白充足；消息气泡 max-w 约 78%。
- 代码块：工具 I/O、trace 详情用 pre 横向滚动（overflow-x auto），不撑破容器。
- footer 输入区：做成悬浮卡片（贴底、与对话区同宽、shadow-2），textarea 自动增高，上限 160px。
- trace 面板：保留右侧抽屉式（当前已点击展开），视觉统一到令牌。
- 窄屏（<640px）：气泡宽度放开、footer 输入区竖排、header 简化为图标。

---

## 5. 组件视觉规范

### 5.1 header

- 精简为一行：品牌（Bot 图标 + 名称）+ 连接状态做成「小圆点 + 文字」的微型徽标。
- 身份信息（userId/sessionId 首 6~8 位）收进一个 hover 展开的小徽标（Popover），点开才编辑/复制，不常驻整条信息栏。
- 右侧动作：主题切换、trace 开关、重置身份，均为图标按钮（触控 ≥ 44px）。

### 5.2 气泡

- 用户：主色淡底 + 深色文字，或主色实心 + 白字，圆角 lg，右对齐；去掉生硬蓝块。
- 助手：浅灰 surface + 次级边框，左对齐，圆角 lg，白字/深字随主题。
- 流式：文末 细光标（1.5px × 14px）脉冲，不闪烁刺眼。

### 5.3 过程时间线（记忆点，重点打磨）

- 轮次内一条左侧细竖线（2px），按 seq/timestamp 排好思考 → 叙述 → 工具/技能。
- 思考：灰紫细线 + 灰紫小字，默认折叠，可展开；不在主消息里抢戏。
- 叙述（中间执行信息，如「我先读取文件看看」）：中性灰、左细线、正文小一号 + 引号语气，与最终回答分离。
- 工具/技能：紧凑卡片（半径 md、弱边框），卡片内包含——图标 + 显示名 + 入参摘要 + 状态标签；入参默认折叠，输出 > 200 字符默认折叠。
- 状态用色：pending 灰脉冲 / success 绿勾 / error 红叉；技能用主色 teal，工具用中性灰。
- 轮次进行中自动展开并跟随最新步骤；结束自动收成一行摘要（保留用户手动展开优先，现有 manualOverride 逻辑保留）。

### 5.4 追问表单

- 单选选项用 radio 语义（或可点卡片），选中态明确（主色描边 + 淡底 + 勾）。
- 提交按钮在有未答项时禁用，disabled 态用低对比灰，满足状态可见性。
- 卡片与工具卡共享一套半径/阴影/间距。

### 5.5 工具确认

- 允许 = 主按钮（primary 实心）；拒绝 = 幽灵按钮（outline/ghost），主次分明。

### 5.6 通知 / 错误 / 空态 / 加载

- 通知：右下角短栈，语义色底 + 白字，浅阴影，自动消失 5s。
- 错误：顶部居中，destructive 色，带关闭。
- 空态：Bot 图标 + 一句可执行引导（按「发送消息开始」），避免干巴巴一行。
- 加载：连接中/生成中用 dots 或细光标，流式中才出现，不整屏 spinner。

---

## 6. 交互动效

- 消息入场：opacity 0→1 + translateY 4px→0，约 180ms，一次性，不做每卡片 hover 动画群。
- 展开/折叠：高度与透明度过渡（用户动作触发）；工具结果落地时给一次轻盈揭示。
- 焦点反馈：input 聚焦时主色 ring 清晰；按钮 hover/active 用 surface-2 变化。
- 全部动效包在 prefers-reduced-motion 下退化为无位移淡入。
- 不滥用 framer-motion spring；微交互用 CSS transition，列表入场与 accordion 才用 framer-motion。

---

## 7. 无障碍

- 文本对比度 ≥ 4.5:1（工具输出 mono 底色与文字都验证）。
- :focus-visible 用 --shadow-ring 可见焦点，键盘可遍历所有按钮/选项。
- 触控目标 ≥ 44 × 44px（现有 h-6 图标按钮在移动端需放大触控区，可用 padding 扩大感而非视觉变大）。
- 加入 skip-to-content 锚点。
- 流式消息 aria-live="polite"，聚合播报而非每条 delta 都播报。
- html lang 改 zh-CN，补 description 与 favicon。

---

## 8. 实施顺序（按 redesign 的 Fix Priority，低风险优先）

- 阶段 0：globals.css 建立完整令牌（色板/字号/间距/圆角/阴影/暗色），不动任何组件。
- 阶段 1：统一主题（删除页面本地 theme + 手动 class 切换，改用 next-themes 的 useTheme / resolvedTheme，复用 ThemeToggle）。
- 阶段 2：header 与身份信息收进 Popover；布局加 max-width 居中与悬浮输入区 + 自适应高度。
- 阶段 3：气泡、过程时间线、工具卡、追问、确认卡接入令牌，清除硬编码颜色。
- 阶段 4：交互态（hover/active/focus-visible、工具长输出折叠、追问选中态、确认主次按钮）。
- 阶段 5：动效 + reduced-motion。
- 阶段 6：空/加载/错误态 + 通知样式。
- 阶段 7：排版/圆角/阴影打磨 + a11y + metadata/lang/favicon。

每阶段单独可提交，均不改变 SSE 逻辑与接口协议。

---

## 9. 约束与不可改动（红线）

- 不改 useSSEStream.ts 的连接/去重/重连/turnIdRef/beginUserTurn/PREVIEW_TYPES 逻辑。
- 不改 src/types/agent.ts 的类型字段与事件名。
- 不改 API 路径与请求/响应体（/api/sessions/... 与 events 提交结构）。
- 不迁移 Tailwind v3↔v4，不引入 React/Vue 重写，不额外引重依赖。
- 保留全部既有功能：身份编辑/复制、trace 开关、深度思考、工具/技能卡、确认、追问单选+提交、思考折叠、错误与通知。
- 不触碰后端，不提交/泄露 key.txt、.env、token。
- 单文件改动为主，样式尽量收敛到 globals.css 令牌 + 少量组件类名调整。

---

## 10. 验收清单

- 深浅两模式均无硬编码颜色泄漏，仅一个强调色 + 中性灰 + 语义状态色。
- 连接/生成/中断三种状态一眼可辨。
- 工具卡长输出可折叠，过程时间线按轮次显示且运行中跟手。
- 追问选中态清晰、未答完禁用提交；确认卡允许/拒绝主次分明。
- 键盘可完整操作，focus 可见，对比度达标，reduced-motion 生效。
- 空态、加载、错误、通知均有专门样式。
- 窄屏 <640px 布局不横向溢出。

---

（本方案为设计稿，待确认后再按第 8 节顺序实施。）