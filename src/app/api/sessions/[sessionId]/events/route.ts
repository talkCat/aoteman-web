import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const body = await request.json();
    const { userId, events } = body;

    if (!userId || !events || !Array.isArray(events)) {
      return NextResponse.json(
        { error: 'Missing required fields: userId or events' },
        { status: 400 }
      );
    }

    console.log(`[Proxy POST] Forwarding ${events.length} events to ${BACKEND_URL}/api/sessions/${sessionId}/events`);

    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('[Proxy POST Error]', error);
    return NextResponse.json(
      { error: 'Failed to forward events to backend' },
      { status: 502 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const after = searchParams.get('after') || '0';
    const types = searchParams.get('types') || '';
    const userId = searchParams.get('userId') || 'anonymous';

    const query = new URLSearchParams({ after, userId });
    if (types) query.set('types', types);

    const url = `${BACKEND_URL}/api/sessions/${sessionId}/events?${query}`;

    console.log(`[Proxy GET] Fetching events from ${url}`);

    const res = await fetch(url);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Proxy GET Error]', error);
    return NextResponse.json(
      { error: 'Failed to fetch events from backend' },
      { status: 502 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId') || 'anonymous';

    console.log(`[Proxy DELETE] Session ${sessionId}, User ${userId}`);

    const res = await fetch(
      `${BACKEND_URL}/api/sessions/${sessionId}/events?userId=${userId}`,
      { method: 'DELETE' }
    );

    return new NextResponse(null, { status: res.status });
  } catch (error) {
    console.error('[Proxy DELETE Error]', error);
    return NextResponse.json(
      { error: 'Failed to delete events' },
      { status: 502 }
    );
  }
}
