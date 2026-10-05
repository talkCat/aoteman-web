# 前端工具调用交互重构计划

## Summary

修复 Thinking / ToolUse 类型缺少 	urnId 导致的「所有工具堆在顶部」的 bug，并将思考过程从全局块移入每个对话轮次内。

## Root Cause

1. Thinking 和 ToolUse TypeScript 接口缺少 	urnId 字段 → 分组时全部归入 turnId=0
2. 思考过程在 JSX 全局渲染（所有轮次之前）→ 不跟随轮次

## Changes

### 1. 类型修复 — src/types/agent.ts
- Thinking 接口增加 	urnId?: number
- ToolUse 接口增加 	urnId?: number

### 2. 渲染重构 — src/app/page.tsx
- 移除全局思考块
- 每轮次渲染顺序：思考(折叠) → 消息 → 工具卡片 → 追问表单
- 工具输出 > 200 字符默认折叠

## Test Scenarios
1. 单轮普通对话
2. 工具调用轮次
3. 多轮工具调用
4. 追问问卷
5. 工具确认
6. 空状态