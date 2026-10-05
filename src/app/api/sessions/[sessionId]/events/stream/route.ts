import { NextRequest } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

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

  try {
    const res = await fetch(backendUrl, {
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

    if (!res.ok || !res.body) {
      console.error(`[Proxy SSE] Backend returned ${res.status}`);
      return new Response(
        `event: error\ndata: {"message":"Backend returned ${res.status}"}\n\n`,
        {
          status: res.status,
          headers: { 'Content-Type': 'text/event-stream' },
        }
      );
    }

    // Stream the backend SSE directly to the client
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('[Proxy SSE Error]', error);
    return new Response(
      `event: error\ndata: {"message":"Failed to connect to backend"}\n\n`,
      {
        status: 502,
        headers: { 'Content-Type': 'text/event-stream' },
      }
    );
  }
}
