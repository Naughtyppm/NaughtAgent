# CLI Plain-Text 模式实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用纯文本流式输出替代 Ink React UI，对标 Claude Code CLI 体验，代码量从 8088 行降至 ~1200 行。

**Architecture:** 新建 `cli/plain-text/` 模块，消费现有 `RunnerEventHandlers` 事件接口，用 Node.js readline + ANSI 直写 stdout 替代 Ink React 渲染树。保留 Ink 作为 `--ui=ink` 备选。

**Tech Stack:** Node.js `readline`（内置）、ANSI 转义码（复用 `ink/utils/colors.ts` 中的 `ANSI` 常量）、`vitest` 测试

---

## 文件结构

### 新建文件

```
packages/agent/src/cli/plain-text/
├── types.ts              (~60 行) 消息类型、符号常量、颜色定义
├── constants.ts          (~80 行) 格式常量：符号集、ANSI 色码、折叠阈值
├── formatter.ts          (~150 行) 消息格式化引擎
├── renderer.ts           (~200 行) StreamRenderer 流式输出、行状态管理
├── fold-manager.ts       (~120 行) 折叠/展开管理器
├── scroll-buffer.ts      (~100 行) 虚拟滚动缓冲区
├── interaction.ts        (~200 行) readline 输入、选择菜单、Ctrl+C 处理
├── permission-dialog.ts  (~100 行) Box 绘制权限对话框
└── index.ts              (~250 行) startPlainTextRepl 入口、事件-UI 桥接
```

### 修改文件

```
packages/agent/src/cli/cli.ts           添加 --ui=plain-text|ink 参数解析
packages/agent/src/cli/repl-ink.ts      重命名为 repl.ts，根据 ui 参数分发
```

### 测试文件

```
packages/agent/src/__tests__/plain-text/
├── formatter.test.ts
├── fold-manager.test.ts
├── scroll-buffer.test.ts
└── renderer.test.ts
```

---

## 关键接口（已有，不修改）

```typescript
// runner.ts — 新 UI 消费的事件源
export interface RunnerEventHandlers {
  onText?: (content: string) => void
  onTextDelta?: (delta: string) => void
  onThinking?: (content: string) => void
  onThinkingEnd?: () => void
  onToolStart?: (id: string, name: string, input: unknown) => void
  onToolEnd?: (id: string, output: string, isError?: boolean) => void
  onError?: (error: Error) => void
  onDone?: (usage: { inputTokens: number; outputTokens: number; ... }) => void
  onPermissionRequest?: (request: PermissionRequest) => void
}

// runner.ts — Runner 配置
export interface RunnerConfig {
  agentType?: AgentType
  cwd?: string
  model?: string
  apiKey?: string
  baseURL?: string
  permissions?: Partial<PermissionSet>
  onConfirm?: ConfirmCallback
  autoConfirm?: boolean
  thinking?: { enabled: boolean; budgetTokens?: number }
}

// repl-ink.ts — REPL 配置
export interface ReplConfig {
  cwd: string
  agent: "build" | "plan" | "explore"
  model?: string
  autoConfirm: boolean
  thinking?: { enabled: boolean; budgetTokens?: number }
}
```

---
