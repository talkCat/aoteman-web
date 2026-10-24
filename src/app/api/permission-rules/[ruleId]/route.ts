import { NextRequest, NextResponse } from 'next/server';

import { bearerHeaders } from '@/lib/bff-auth';
import { currentUserErrorResponse, resolveCurrentUser } from '@/lib/current-user';
import {
  DATA_PLANE_BASE_URL,
  proxyPermissionError,
  readUpstreamPayload,
} from '@/lib/permission-server';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ ruleId: string }> };

/** 删除一条本人规则；规则不存在或不属于当前用户时由数据面返回 404。 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { ruleId } = await context.params;
  if (!/^\d+$/.test(ruleId)) {
    return NextResponse.json({ error: '规则 ID 不合法' }, { status: 400 });
  }

  try {
    const user = await resolveCurrentUser(request);
    const res = await fetch(
      `${DATA_PLANE_BASE_URL}/api/permission-rules/${ruleId}?userId=${encodeURIComponent(user.userId)}`,
      {
        method: 'DELETE',
        headers: { ...bearerHeaders(request), Accept: 'application/json' },
        cache: 'no-store',
      },
    );

    if (!res.ok) return proxyPermissionError(res, '删除权限规则失败');
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    return NextResponse.json(await readUpstreamPayload(res), { status: res.status });
  } catch (error) {
    return currentUserErrorResponse(error);
  }
}