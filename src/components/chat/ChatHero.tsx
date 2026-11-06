'use client';

import Image from 'next/image';
import { ArrowRight, BookOpen, Plug, ShieldCheck, Target } from 'lucide-react';

/**
 * 空态 Hero（P2/T2.1）。
 *
 * 视觉依据：`智能体输出样例/03-智能体平台原型` 的 `hero` 区块——
 * 徽标 + 双行大标题（第二行渐变）+ 说明 + 建议卡片 + 能力说明。
 * 与原型的两点差异（均为本项目真实能力约束，不是遗漏）：
 * 1. 3D 主视觉来自 `public/brand`（iconfont 免费素材，见素材来源台账），只做装饰。
 * 2. 不显示「12 个技能 / 6 个 MCP / 4 个知识库」这类数字，避免写死假数据。
 */

const SUGGESTIONS = [
  {
    icon: Target,
    title: '梳理一份行动清单',
    hint: '把零散信息聚类成可执行事项',
    prompt: '帮我把这周的客户反馈整理成一份带优先级的行动清单',
  },
  {
    icon: Plug,
    title: '盘点已接入的能力',
    hint: '技能、工具与知识库各能做什么',
    prompt: '帮我盘点当前可用的技能、工具和知识库，并说明各自适合什么场景。',
  },
  {
    icon: BookOpen,
    title: '基于知识库写作',
    hint: '检索切片后重组为文档',
    prompt: '基于知识库内容，写一份面向新用户的 3 分钟上手指南。',
  },
  {
    icon: ShieldCheck,
    title: '检查权限配置',
    hint: '发现过度授权与闲置授权',
    prompt: '帮我检查当前权限配置有没有过度授权的地方。',
  },
];

export function ChatHero({ onPickPrompt }: { onPickPrompt: (prompt: string) => void }) {
  return (
    <section
      aria-labelledby="chat-hero-title"
      className="relative flex min-h-[560px] flex-col items-center justify-center px-1 py-10 text-center"
    >
      {/* 唯一的一处装饰光，靠 token 随主题变化；不使用图片，避免半成品素材 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-6 h-64 w-64 -translate-x-1/2 rounded-full bg-accent-wash blur-3xl"
      />

      <div aria-hidden="true" className="brand-art-frame relative mb-1 h-[112px] w-[112px] sm:h-[136px] sm:w-[136px]">
        <span className="brand-art-glow" />
        <Image
          src="/brand/hero-agent-3d.png"
          width={320}
          height={320}
          alt=""
          priority
          className="brand-art brand-art-float"
        />
      </div>

      <div className="relative flex flex-col items-center">
        <span className="surface-chip inline-flex items-center gap-2 rounded-full border border-line-1 bg-surface-1/70 px-3 py-1 text-[11px] font-medium tracking-wide text-fg-3 backdrop-blur">
          <span className="pulse-dot" aria-hidden="true" />
          LUMI AGENT · 已就绪
        </span>

        <h1
          id="chat-hero-title"
          className="mt-5 text-[34px] font-semibold leading-[1.16] tracking-tight text-fg-1 sm:text-[42px]"
        >
          今天，想一起
          <br />
          <span className="hero-gradient-text">完成什么？</span>
        </h1>

        <p className="mt-4 max-w-md text-sm leading-relaxed text-fg-3">
          调用技能、检索知识库、调度专家，
          <br className="sm:hidden" />
          把想法直接变成结果。
        </p>
      </div>

      <div className="mt-9 grid w-full max-w-2xl gap-2.5 text-left sm:grid-cols-2">
        {SUGGESTIONS.map(({ icon: Icon, title, hint, prompt }) => (
          <button
            key={title}
            type="button"
            onClick={() => onPickPrompt(prompt)}
            className="ui-interactive ui-pressable ui-focus-ring group flex items-center gap-3 rounded-xl border border-line-1 bg-surface-1/70 p-3 text-left backdrop-blur hover:bg-surface-2"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-wash text-accent-base">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-fg-1">{title}</span>
              <span className="mt-0.5 block truncate text-[11px] text-fg-3">{hint}</span>
            </span>
            <ArrowRight
              className="h-4 w-4 shrink-0 text-fg-4 opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-fg-4">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-1.5 w-1.5 rounded-full bg-accent-soft" aria-hidden="true" />
          技能调用
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-1.5 w-1.5 rounded-full bg-accent-soft/60" aria-hidden="true" />
          知识库检索
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-1.5 w-1.5 rounded-full bg-accent-soft/40" aria-hidden="true" />
          专家协作
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full border border-line-3" aria-hidden="true" />
          引用可溯源
        </span>
      </div>
    </section>
  );
}
