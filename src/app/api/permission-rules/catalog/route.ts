import { NextRequest, NextResponse } from 'next/server';

import { bearerHeaders } from '@/lib/bff-auth';
import {
  DATA_PLANE_BASE_URL,
  proxyPermissionError,
  readUpstreamPayload,
} from '@/lib/permission-server';

export const runtime = 'nodejs';

/** 只读工具目录：无需用户身份，仍透传 Authorization 以适配开启鉴权后的数据面。 */
export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${DATA_PLANE_BASE_URL}/api/permission-rules/catalog`, {
      headers: { ...bearerHeaders(request), Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) return proxyPermissionError(res, '加载工具目录失败');
    return NextResponse.json(await readUpstreamPayload(res));
  } catch (error) {
    console.error('[bff/permission-catalog] 数据面不可达:', error);
    return NextResponse.json(
      { error: '工具目录暂时不可用，请稍后重试' },
      { status: 502 },
    );
  }
}