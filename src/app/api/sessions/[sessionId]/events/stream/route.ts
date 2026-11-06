import { NextRequest } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId') || 'anonymous';
  const after = searchParams.get('after') || '0';
  const eventDeltas = searchParams.get('event_deltas') || '';

  const query = new URLSearchParams({ userId, after });
  if (eventDeltas) query.set('event_deltas', eventDeltas);

  const backendUrl = `${BACKEND_URL}/api/sessions/${sessionId}/events/stream?${query}`;

  console.log(`[Proxy SSE] Streaming from ${backendUrl}`);

  const encoder = new TextEncoder();
  const abortController = new AbortController();
  request.signal.addEventListener('abort', () => abortController.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 立即写一帧 SSE 注释，让浏览器的 EventSource 立即触发 onopen。
      // 后端在没有待回放事件时不会立即 flush 响应头，
      // 切回历史会话（after > 0）时连接会一直显示「未连接」。
      controller.enqueue(encoder.encode(': connected\n\n'));

      try {
        const res = await fetch(backendUrl, {
          headers: {
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
          signal: abortController.signal,
        });

        if (!res.ok || !res.body) {
          console.error(`[Proxy SSE] Backend returned ${res.status}`);
          controller.enqueue(
            encoder.encode(
              `event: session.error\ndata: ${JSON.stringify({ message: `Backend returned ${res.status}` })}\n\n`
            )
          );
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        // 客户端主动断开：不需要再写任何东西
        if (abortController.signal.aborted) return;
        console.error('[Proxy SSE Error]', error);
        try {
          controller.enqueue(
            encoder.encode(
              `event: session.error\ndata: ${JSON.stringify({ message: 'Failed to connect to backend' })}\n\n`
            )
          );
          controller.close();
        } catch {
          // 流已被取消，忽略
        }
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
