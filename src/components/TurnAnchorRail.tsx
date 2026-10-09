'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { TurnGroup } from '@/types/agent';

interface TurnAnchorRailProps {
  turns: TurnGroup[];
  activeTurnId: number | null;
  onSelect: (turnId: number) => void;
  className?: string;
}

interface TurnAnchor {
  turnId: number;
  text: string;
  toolCount: number;
}

const MAX_ANCHOR_TEXT = 120;

function buildAnchors(turns: TurnGroup[]): TurnAnchor[] {
  return turns
    .filter(turn => turn.messages.some(m => m.type === 'user'))
    .map(turn => {
      const firstUser = turn.messages.find(m => m.type === 'user');
      const raw = (firstUser?.content || '').replace(/\s+/g, ' ').trim();
      return {
        turnId: turn.turnId,
        text: raw.length > MAX_ANCHOR_TEXT ? raw.slice(0, MAX_ANCHOR_TEXT) + '…' : raw,
        toolCount: turn.toolUses.length,
      };
    });
}

/**
 * 对话框模块左侧的轮次锚点轨道。
 * 所有锚点集中排列在对话区左侧（垂直居中），不随内容位置分散；
 * 常规态只显示极简标记（不展示文字），悬停 / 键盘聚焦时才浮出该轮摘要，点击跳转，
 * 当前轮次标记随滚动高亮。
 */
export function TurnAnchorRail({ turns, activeTurnId, onSelect, className }: TurnAnchorRailProps) {
  const anchors = useMemo(() => buildAnchors(turns), [turns]);

  if (anchors.length === 0) return null;

  return (
    <nav
      aria-label="对话轮次锚点"
      className={cn('flex w-10 shrink-0 flex-col items-center justify-center gap-1.5 py-6', className)}
    >
      {anchors.map((anchor, index) => {
        const active = anchor.turnId === activeTurnId;
        const label = anchor.text || `第 ${anchor.turnId} 轮`;
        return (
          <div key={anchor.turnId} className="group relative flex items-center">
            <button
              type="button"
              onClick={() => onSelect(anchor.turnId)}
              aria-current={active ? 'location' : undefined}
              aria-label={`第 ${index + 1} 轮：${label}`}
              className={cn(
                'h-1 rounded-full transition-[width,background-color]',
                active ? 'w-6 bg-primary' : 'w-3.5 bg-border hover:w-5 hover:bg-foreground/40',
              )}
            />
            <div className="pointer-events-none absolute left-full top-1/2 z-30 ml-3 w-56 -translate-y-1/2 rounded-lg border border-border bg-popover p-2.5 text-popover-foreground opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
              <div className="mb-0.5 text-[11px] text-muted-foreground">
                第 {index + 1} 轮{anchor.toolCount > 0 ? ` · ${anchor.toolCount} 次工具` : ''}
              </div>
              <div className="line-clamp-3 text-xs leading-relaxed text-foreground">{label}</div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
