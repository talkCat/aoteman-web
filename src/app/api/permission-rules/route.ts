import { NextRequest, NextResponse } from 'next/server';

import { bearerHeaders } from '@/lib/bff-auth';
import { currentUserErrorResponse, resolveCurrentUser } from '@/lib/current-user';
import {
  DATA_PLANE_BASE_URL,
  proxyPermissionError,
  readUpstreamPayload,
} from '@/lib/permission-server';
import type { PermissionBehavior } from '@/types/permission';

export const runtime = 'nodejs';

const ENDPOINT = `${DATA_PLANE_BASE_URL}/api/permission-rules`;

/** 当前用户的规则列表（userId 由服务端解析，不采信前端自报）。 */
export async function GET(request: NextRequest) {
  try {
    const user = await resolveCurrentUser(request);
    const res = await fetch(`${ENDPOINT}?userId=${encodeURIComponent(user.userId)}`, {
      headers: { ...bearerHeaders(request), Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) return proxyPermissionError(res, '加载权限规则失败');
    return NextResponse.json(await readUpstreamPayload(res));
  } catch (error) {
    return currentUserErrorResponse(error);
  }
}

/**
 * 新增 / 更新一条本人规则：仅接受 ask / deny。
 * 请求体里的 userId 一律忽略，由 BFF 注入当前登录用户。
 */
export async function POST(request: NextRequest) {
  type RuleBody = { toolName?: unknown; behavior?: unknown; ruleContent?: unknown };
  let body: RuleBody;
  try {
    body = (await request.json()) as RuleBody;
  } catch {
    return NextResponse.json({ error: '请求格式不正确' }, { status: 400 });
  }

  const toolName = typeof body.toolName === 'string' ? body.toolName.trim() : '';
  const behavior = body.behavior;
  if (!toolName || (behavior !== 'ask' && behavior !== 'deny')) {
    return NextResponse.json(
      { error: '请选择工具，并把行为设为「每次询问」或「拒绝」' },
      { status: 400 },
    );
  }

  try {
    const user = await resolveCurrentUser(request);
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        ...bearerHeaders(request),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: user.userId,
        toolName,
        behavior: behavior as PermissionBehavior,
        // P1 不支持参数级规则，统一存空串。
        ruleContent: typeof body.ruleContent === 'string' ? body.ruleContent : '',
      }),
      cache: 'no-store',
    });

    if (!res.ok) return proxyPermissionError(res, '保存权限规则失败');
    return NextResponse.json(await readUpstreamPayload(res), { status: res.status });
  } catch (error) {
    return currentUserErrorResponse(error);
  }
}