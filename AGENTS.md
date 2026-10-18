# aoteman-web 协作约定

> 本文件是 **aoteman-web** 前端仓库的协作约定与工程说明。凡涉及 Git 提交、推送、合并、凭证管理之前，**必须先读本文件**。

---

## 一、开发与修 bug 习惯（约束 · 红线）

**先判断这次改动属于哪一类，再决定要不要查官方文档 / 读源码。**

| 改动性质 | 典型场景 | 要求 |
| --- | --- | --- |
| **① 纯业务逻辑**（不碰框架机制） | JSX 结构与组件状态、文案与样式、类型定义、普通工具函数、配置透传 | **直接写**，不查文档也不读源码 |
| **② 使用框架能力 / API** | Next.js App Router / Server-Client 边界、Route Handler、中间件、SSE、Radix UI / Tailwind / Lucide 组件 API | **必须先查官方文档**，按文档推荐姿势写 |
| **③ 框架机制内部行为存疑** | 文档没写清渲染 / 水合 / 编译行为，或实际表现与文档不符 | 再**读框架源码**确认（Next.js：`node_modules/next`；Radix：`node_modules/@radix-ui/react-*`） |

一句话：**「用框架」查文档，「改框架行为、或搞不清框架怎么了」才读源码；普通业务代码两个都免。**

红线不变：

> **严禁凭记忆或猜测编写框架 API 调用。** 只要属于 ②③，不确定就先查。

判定「查过了」的标准：

- 属于 ②③：能说出这条 API 出自**官方文档的哪一页**或 **`node_modules` 内哪个类型声明的哪一行**。
- 属于 ①：不需要这个证明，正常写即可 —— 但**别顺手去改框架相关代码**。

> 补充：即使是 ①，只要实现过程中**不得不调用框架 API**（哪怕只是一行），那一行自动升级为 ②，按 ② 处理。

### 1.1 Bug 修复：先分析、再设计、后动手（强制）

凡是被要求「修 bug / 排查故障 / 处理异常现象」，**一律按三步走，禁止跳过分析直接改代码**：

1. **分析** —— 先定位根因，用证据说话（console / hydration 报错、网络面板、SSE 事件流、复现步骤），讲清「现象 → 触发条件 → 根因 → 影响范围」。根因不清不动代码。
2. **设计** —— 给出解决方案：改哪些文件、为什么这样改、有无副作用与替代方案、如何验证（`tsc --noEmit` / `next lint` / 浏览器复现）。
3. **动手** —— 方案确定后再改代码；改完按设计好的方式**实测**，不能只以「类型检查 / lint 通过」交差。

产出与提交要求：

- 分析结论与方案**先落盘到仓库根 `doc/bug/<日期>-<简短标题>.md`**，再开始改代码。
- 文档与代码改动**一并提交**，提交信息点明根因与验证方式。
- 只做**最小必要**改动；顺带发现的问题另开一轮，不混进同一次修复。

> 例外：纯笔误 / 文案 / 样式这类**一眼可见、无行为影响**的改动可免正式分析，但仍要在提交信息里一句话说明。

### 1.2 前端问题排查：借助 Chrome DevTools MCP（已安装）

本机已安装 **Chrome DevTools MCP**（配置见 `C:\Users\18115\.codex\config.toml` 的 `[mcp_servers.chrome-devtools]`，经 `npx -y chrome-devtools-mcp@1.11.0` 启动）。

**凡涉及前端现象的排查与验证，先取证、再下结论**，禁止「看代码猜原因」直接改：

| 场景 | 该用的工具 |
| --- | --- |
| 复现交互问题（点击 / 填表 / 悬停 / 按键 / 弹窗） | `navigate_page`、`click`、`fill` / `fill_form`、`hover`、`press_key`、`handle_dialog` |
| 看页面真实 DOM / 可访问性结构 | `take_snapshot`（优先）、`take_screenshot` |
| 读取 React 内部状态、SSE 事件流原始数据 | `evaluate_script` |
| Console 报错、hydration 警告 | `list_console_messages`、`get_console_message` |
| SSE 请求、接口时序、请求 / 响应头与 Cookie | `list_network_requests`、`get_network_request` |
| 卡顿 / 布局抖动（LCP、CLS、INP） | `performance_start_trace` / `stop_trace` / `analyze_insight` |
| 可访问性 / SEO / 最佳实践 | `lighthouse_audit`（`mode: snapshot` 分析当前页，不重载） |
| 内存泄漏 | `take_heapsnapshot` |

使用前提与注意：

- **先起本地 dev server**（`pnpm dev`，默认 `http://localhost:3000`），否则导航只会得到 `ERR_CONNECTION_REFUSED`。
- 抓到的证据（Console 报错、Network 时序、`evaluate_script` 读数）要**写进 `doc/bug/<日期>-<标题>.md`**，作为 1.1「分析」步骤的依据；根因结论必须能被这些证据支撑。
- 验证修复时同样用它**实测复现**，不能只看 `tsc --noEmit` / `next lint` 通过。
- **落盘限制**：该 MCP 未配置 `--filesystemRoot`，默认只允许写系统临时目录（`%TEMP%`），因此 `take_screenshot` / `performance_stop_trace` / `take_heapsnapshot` 指定仓库路径会被拒绝。需要落盘到仓库时，在 `config.toml` 的 `args` 追加 `--filesystemRoot`（可多个）并重启会话。
- 连接的是**独立的调试浏览器实例**（非用户日常 Chrome），不要在单个页面上反复残留探测痕迹；取证完成后把页面恢复原状，且**不提交**由它生成的临时产物（截图 / trace / heapsnapshot）。

---

## 二、Git 管理准则：统一使用 GitHub CLI（gh）

### 1. 认证（一次性配置）

用 GitHub CLI 登录，**不要**把 token 写进 remote URL 或 `.git/config`，也**不要**复用后端 `aoteman-agent` 的 PAT：

```powershell
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
gh auth status
```

- 登录默认申请 `repo` 权限，覆盖本仓库（public）及名下私有仓库的读写。
- `gh auth setup-git` 会让 `git pull / push` 自动复用 gh 凭据，无需再手动粘贴 token。

### 2. 日常操作

```powershell
git pull
git add -A
git commit -m "标题：一句话说明改了什么"   # 描述用中文
git push                                # 凭据自动注入，无需 token
```

快捷操作：

```powershell
gh repo view talkCat/aoteman-web
gh pr create --title "..." --body "..."
gh pr status
```

### 3. 安全红线

- 禁止把 token 写进 remote URL（形如 `https://TOKEN@github.com/...`）。
- 禁止提交 `.env(.local)`、`key.txt`、日志、`node_modules/`、`.next/` 等敏感或生成物（`.gitignore` 已覆盖，提交前用 `git status` 复核）。
- 若 token 曾被写进 URL 或命令历史，视为已泄露，去 GitHub 后台撤销重建。

### 4. 提交前自检

```powershell
git remote -v   # 应为 https://github.com/talkCat/aoteman-web.git，不含 token
git status      # 无 .env(.local) / key.txt / node_modules / .next
```

---

## 三、工程说明（Zoer Next.js Template）

Production-ready full-stack Next.js application integrated with Supabase, TailwindCSS 4, and Radix UI.

Although this is a Next.js template, only create API routes when necessary. Prioritize implementing sensitive operations on the server-side, such as private key management and API calls requiring authentication credentials.

### Tech Stack

- **PNPM**: Package manager
- **Frontend**: React 19 + Next.js + TypeScript + TailwindCSS 4
- **Backend**: Next.js server-side routing (App Router)
- **UI**: Radix UI + TailwindCSS 4 + Lucide React
- **Database**: Supabase

### Key Features

#### Supabase Integration (Partial)

**Architecture**: 
This template includes the `@supabase/supabase-js` SDK, but the server-side implementation is not from Supabase. Zoer has implemented partial functionality. **Available Server Features**:
1. `from` table queries
2. Login
3. Register  
4. Password reset

**Supabase**:
- **Location**: `src/integrations/supabase/`
- **Configuration**:
  - `client.ts` - Exports `supabase` for client-side use, respects RLS policies
  - `server.ts` - Exports `supabaseAdmin` for server-side use, bypasses RLS policies
  - `types.ts` - TypeScript type definitions for Supabase tables

#### Agent Chat Page

**Location**: `/` (Homepage)

A complete AI agent conversation interface with:

- **Identity Management**: Auto-generated userId/sessionId with reset capability
- **SSE Event Streaming**: Real-time event subscription and processing
- **Message Types**: User messages, assistant messages (streaming), thinking process (collapsible)
- **Tool/Skill Calls**: Display tool invocations, inputs, and results with collapsible content
- **Tool Confirmation**: Interactive allow/deny confirmation cards
- **Followup Questionnaire**: Single-choice answer collection and submission
- **TRACE Debug Panel**: Toggleable debug panel showing internal events
- **Theme Toggle**: Light/dark mode with persistence
- **Deep Thinking**: Toggle affecting message submission parameters

**API Routes**:
- `GET /api/sessions/[sessionId]/events/stream` - SSE event stream
- `POST /api/sessions/[sessionId]/events` - Submit events

**Core Hooks**:
- `useSSEStream` (`src/hooks/useSSEStream.ts`) - SSE connection and event handling

**Types**: `src/types/agent.ts` - TypeScript definitions for all event types

### Adding Features

#### Create New API Route

1. Create a folder in `src/app/api/` directory, for example `src/app/api/users/`
2. Create a `route.ts` file to handle requests

```typescript
// src/app/api/users/route.ts
export async function GET(request: Request) {
  return Response.json({ message: "Hello" })
}
```

3. Route is automatically registered as `/api/users`

#### Create New Page

1. Create a new folder in `src/app/` directory, for example `src/app/dashboard/`
2. Create a `page.tsx` file

```typescript
// src/app/dashboard/page.tsx
export default function Dashboard() {
  return <div>Dashboard Page</div>
}
```

3. Route is automatically registered as `/dashboard`
