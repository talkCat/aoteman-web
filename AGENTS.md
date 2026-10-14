# aoteman-web 协作约定

> 本文件是 **aoteman-web** 前端仓库的协作约定与工程说明。凡涉及 Git 提交、推送、合并、凭证管理之前，**必须先读本文件**。

---

## 一、Git 管理准则：统一使用 GitHub CLI（gh）

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

## 二、工程说明（Zoer Next.js Template）

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
