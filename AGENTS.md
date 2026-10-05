# Zoer Next.js Template

Production-ready full-stack Next.js application integrated with Supabase, TailwindCSS 4, and Radix UI.

Although this is a Next.js template, only create API routes when necessary. Prioritize implementing sensitive operations on the server-side, such as private key management and API calls requiring authentication credentials.

## Tech Stack

- **PNPM**: Package manager
- **Frontend**: React 19 + Next.js + TypeScript + TailwindCSS 4
- **Backend**: Next.js server-side routing (App Router)
- **UI**: Radix UI + TailwindCSS 4 + Lucide React
- **Database**: Supabase

## Key Features

### Supabase Integration (Partial)

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

### Agent Chat Page

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

## Adding Features

### Create New API Route

1. Create a folder in `src/app/api/` directory, for example `src/app/api/users/`
2. Create a `route.ts` file to handle requests

```typescript
// src/app/api/users/route.ts
export async function GET(request: Request) {
  return Response.json({ message: "Hello" })
}
```

3. Route is automatically registered as `/api/users`

### Create New Page

1. Create a new folder in `src/app/` directory, for example `src/app/dashboard/`
2. Create a `page.tsx` file

```typescript
// src/app/dashboard/page.tsx
export default function Dashboard() {
  return <div>Dashboard Page</div>
}
```

3. Route is automatically registered as `/dashboard`
