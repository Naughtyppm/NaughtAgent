# 子 Agent 可见性改进方案

## 实现状态

✅ **已完成** - 2025-02-05

所有6种子 Agent 模式都已添加事件支持：
- `run_agent` - 独立代理
- `fork_agent` - 分叉代理
- `parallel_agents` - 融合并行
- `multi_agent` - 多角色讨论
- `run_workflow` - 工作流
- `ask_llm` - LLM 查询

## 问题分析

### 当前状态

1. **子 Agent 执行完全不可见**
   - `run_agent` 工具执行时，UI 只显示工具调用开始/结束
   - 子 Agent 内部的思考、工具调用、进度完全不显示
   - 用户无法知道子 Agent 在做什么

2. **事件传递断层**
   - 主 Agent Loop 发出事件 → UI 接收并显示
   - 子 Agent Loop 发出事件 → 被 `runRunAgent` 内部消费 → 只返回最终结果
   - 子 Agent 的中间事件没有传递到 UI

3. **架构图示**

```
当前架构：
┌─────────────────────────────────────────────────────────────┐
│  UI (Ink)                                                   │
│  ├── MessageList                                            │
│  │   ├── AIMessage (主 Agent 文本)                          │
│  │   └── ToolPanel (工具调用)                               │
│  │       └── run_agent: "执行中..." → "完成"                │
│  │           (内部过程完全不可见!)                          │
│  └── StatusIndicator                                        │
└─────────────────────────────────────────────────────────────┘
         ↑ 事件
┌─────────────────────────────────────────────────────────────┐
│  主 Agent Loop                                              │
│  ├── text → UI                                              │
│  ├── tool_start → UI                                        │
│  ├── tool_end → UI                                          │
│  └── 执行 run_agent 工具                                    │
│      └── runRunAgent()                                      │
│          └── 子 Agent Loop                                  │
│              ├── text → (丢失)                              │
│              ├── tool_start → (丢失)                        │
│              └── tool_end → (丢失)                          │
└─────────────────────────────────────────────────────────────┘
```


## 解决方案

### 方案 A：事件冒泡（推荐）

将子 Agent 的事件向上传递，让 UI 能够接收并显示。

#### 核心思路

1. 子 Agent 执行时，通过回调函数将事件传递给父级
2. 父级（工具执行器）将事件转发到 UI
3. UI 显示嵌套的子 Agent 状态

#### 新增事件类型

```typescript
// 在 AgentEvent 中新增子 Agent 相关事件
export type AgentEvent =
  | { type: "text"; content: string }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_end"; id: string; result: Tool.Result; isError: boolean }
  | { type: "error"; error: AgentError }
  | { type: "done"; usage: TokenUsage }
  // 新增：子 Agent 事件
  | { type: "subagent_start"; id: string; prompt: string; agentType: string }
  | { type: "subagent_text"; id: string; content: string }
  | { type: "subagent_tool_start"; id: string; toolId: string; name: string; input: unknown }
  | { type: "subagent_tool_end"; id: string; toolId: string; result: Tool.Result; isError: boolean }
  | { type: "subagent_end"; id: string; success: boolean; output: string }
```

#### 修改 RunAgentRuntime

```typescript
export interface RunAgentRuntime {
  apiKey?: string
  baseURL?: string
  model?: string
  // 新增：事件回调
  onEvent?: (event: SubAgentEvent) => void
}

export type SubAgentEvent =
  | { type: "start"; prompt: string; agentType: string }
  | { type: "text"; content: string }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_end"; id: string; result: Tool.Result; isError: boolean }
  | { type: "step"; current: number; total: number }
  | { type: "end"; success: boolean; output: string }
```

#### 修改 runRunAgent

```typescript
export async function runRunAgent(
  config: RunAgentConfig,
  runtime: RunAgentRuntime
): Promise<SubTaskResult> {
  const { onEvent } = runtime
  
  // 发送开始事件
  onEvent?.({ type: "start", prompt: config.prompt, agentType: config.agentType || "build" })
  
  // ... 创建 Agent Loop ...
  
  for await (const event of loop.run(config.prompt)) {
    // 转发事件到回调
    switch (event.type) {
      case "text":
        onEvent?.({ type: "text", content: event.content })
        break
      case "tool_start":
        onEvent?.({ type: "tool_start", id: event.id, name: event.name, input: event.input })
        break
      case "tool_end":
        onEvent?.({ type: "tool_end", id: event.id, result: event.result, isError: event.isError })
        break
    }
    
    // ... 原有逻辑 ...
  }
  
  // 发送结束事件
  onEvent?.({ type: "end", success: true, output })
  
  return result
}
```


### 方案 B：全局事件总线

创建一个全局事件总线，所有 Agent（主/子）都向其发送事件。

#### 核心思路

```typescript
// event-bus.ts
import { EventEmitter } from "events"

export interface AgentEventBus {
  emit(agentId: string, event: AgentEvent): void
  on(listener: (agentId: string, event: AgentEvent) => void): void
  off(listener: (agentId: string, event: AgentEvent) => void): void
}

class GlobalEventBus implements AgentEventBus {
  private emitter = new EventEmitter()
  
  emit(agentId: string, event: AgentEvent) {
    this.emitter.emit("agent-event", { agentId, event })
  }
  
  on(listener: (agentId: string, event: AgentEvent) => void) {
    this.emitter.on("agent-event", ({ agentId, event }) => listener(agentId, event))
  }
  
  off(listener: (agentId: string, event: AgentEvent) => void) {
    this.emitter.off("agent-event", listener)
  }
}

export const eventBus = new GlobalEventBus()
```

#### 优点
- 解耦：Agent 不需要知道谁在监听
- 灵活：可以有多个监听者
- 简单：不需要修改现有接口

#### 缺点
- 全局状态：可能导致测试困难
- 生命周期管理：需要正确清理监听器


## UI 改进方案

### 1. 嵌套工具面板

在 ToolPanel 中支持显示子 Agent 的工具调用：

```typescript
// types.ts 新增
export interface SubAgentState {
  id: string
  prompt: string
  agentType: string
  status: 'running' | 'completed' | 'error'
  text: string
  tools: ToolCall[]
  currentStep: number
  totalSteps: number
}

export interface ToolCall {
  // ... 现有字段 ...
  // 新增：如果是 run_agent 工具，包含子 Agent 状态
  subAgent?: SubAgentState
}
```

### 2. 子 Agent 面板组件

```tsx
// SubAgentPanel.tsx
export function SubAgentPanel({ subAgent }: { subAgent: SubAgentState }) {
  return (
    <Box flexDirection="column" marginLeft={4} borderStyle="single" borderColor="cyan">
      {/* 子 Agent 头部 */}
      <Box gap={1}>
        <Text color="cyan">🤖 子 Agent</Text>
        <Text color="gray">({subAgent.agentType})</Text>
        {subAgent.status === 'running' && <Spinner />}
        {subAgent.status === 'completed' && <Text color="green">✓</Text>}
        {subAgent.status === 'error' && <Text color="red">✗</Text>}
      </Box>
      
      {/* 任务描述 */}
      <Box marginLeft={2}>
        <Text color="gray" dimColor>任务: {truncate(subAgent.prompt, 60)}</Text>
      </Box>
      
      {/* 进度 */}
      <Box marginLeft={2}>
        <Text color="yellow">步骤 {subAgent.currentStep}/{subAgent.totalSteps}</Text>
      </Box>
      
      {/* 子 Agent 的工具调用 */}
      {subAgent.tools.map(tool => (
        <Box key={tool.id} marginLeft={2}>
          <ToolPanel tool={tool} isExpanded={false} onToggle={() => {}} />
        </Box>
      ))}
      
      {/* 子 Agent 输出预览 */}
      {subAgent.text && (
        <Box marginLeft={2}>
          <Text color="white">{truncate(subAgent.text, 100)}</Text>
        </Box>
      )}
    </Box>
  )
}
```

### 3. 状态指示器增强

```tsx
// StatusIndicator.tsx 增强
export function StatusIndicator({ status, subAgents }: StatusIndicatorProps) {
  return (
    <Box flexDirection="column">
      {/* 主状态 */}
      <Box gap={1}>
        <Text color={getStatusColor(status)}>{getStatusIcon(status)}</Text>
        <Text>{status.message}</Text>
      </Box>
      
      {/* 活跃的子 Agent 列表 */}
      {subAgents && subAgents.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          <Text color="cyan" dimColor>活跃子任务:</Text>
          {subAgents.map(sa => (
            <Box key={sa.id} gap={1}>
              <Spinner />
              <Text color="gray">{sa.agentType}: {truncate(sa.prompt, 40)}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
```


## 实现计划

### Phase 1: 事件传递基础设施

**目标**: 让子 Agent 的事件能够传递到 UI

**任务**:
1. 定义 `SubAgentEvent` 类型
2. 修改 `RunAgentRuntime` 接口，添加 `onEvent` 回调
3. 修改 `runRunAgent` 函数，在执行过程中调用回调
4. 修改 `RunAgentTool`，将回调传递给 runtime

**文件变更**:
- `packages/agent/src/subtask/types.ts` - 新增事件类型
- `packages/agent/src/subtask/run-agent.ts` - 添加事件回调
- `packages/agent/src/tool/subagent/run-agent-tool.ts` - 传递回调

### Phase 2: UI 组件支持

**目标**: UI 能够显示子 Agent 状态

**任务**:
1. 扩展 `ToolCall` 类型，支持 `subAgent` 字段
2. 创建 `SubAgentPanel` 组件
3. 修改 `ToolPanel`，当工具是 `run_agent` 时显示子 Agent 面板
4. 修改 `useMessages` hook，处理子 Agent 事件

**文件变更**:
- `packages/agent/src/cli/ink/types.ts` - 扩展类型
- `packages/agent/src/cli/ink/components/SubAgentPanel.tsx` - 新组件
- `packages/agent/src/cli/ink/components/ToolPanel.tsx` - 集成子 Agent 面板
- `packages/agent/src/cli/ink/hooks/useMessages.ts` - 处理事件

### Phase 3: 状态指示器增强

**目标**: 在状态栏显示活跃的子 Agent

**任务**:
1. 扩展 `StatusIndicatorProps`，添加 `subAgents` 字段
2. 修改 `StatusIndicator` 组件，显示子 Agent 列表
3. 在 `App` 组件中维护活跃子 Agent 状态

**文件变更**:
- `packages/agent/src/cli/ink/types.ts` - 扩展 Props
- `packages/agent/src/cli/ink/components/StatusIndicator.tsx` - 显示子 Agent
- `packages/agent/src/cli/ink/App.tsx` - 状态管理

### Phase 4: 并行子 Agent 支持

**目标**: 支持多个子 Agent 同时执行时的显示

**任务**:
1. 修改 `parallel-agents-tool.ts`，传递事件回调
2. UI 支持同时显示多个子 Agent 状态
3. 添加子 Agent ID 区分不同实例

**文件变更**:
- `packages/agent/src/tool/subagent/parallel-agents-tool.ts`
- `packages/agent/src/cli/ink/components/SubAgentPanel.tsx`


## 详细实现代码

### 1. 事件类型定义

```typescript
// packages/agent/src/subtask/events.ts

/**
 * 子 Agent 事件类型
 */
export type SubAgentEventType =
  | "start"
  | "text"
  | "tool_start"
  | "tool_end"
  | "step"
  | "thinking"
  | "end"

/**
 * 子 Agent 事件
 */
export type SubAgentEvent =
  | { type: "start"; id: string; prompt: string; agentType: string }
  | { type: "text"; id: string; content: string; delta?: string }
  | { type: "tool_start"; id: string; toolId: string; name: string; input: unknown }
  | { type: "tool_end"; id: string; toolId: string; output: string; isError: boolean }
  | { type: "step"; id: string; current: number; total: number }
  | { type: "thinking"; id: string; message: string }
  | { type: "end"; id: string; success: boolean; output: string; usage?: { inputTokens: number; outputTokens: number } }

/**
 * 子 Agent 事件监听器
 */
export type SubAgentEventListener = (event: SubAgentEvent) => void

/**
 * 生成唯一的子 Agent ID
 */
export function generateSubAgentId(): string {
  return `subagent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
```

### 2. 修改 RunAgentRuntime

```typescript
// packages/agent/src/subtask/run-agent.ts (修改)

import { generateSubAgentId, type SubAgentEvent, type SubAgentEventListener } from "./events"

export interface RunAgentRuntime {
  apiKey?: string
  baseURL?: string
  model?: string
  /** 事件监听器 - 用于向 UI 传递子 Agent 状态 */
  onEvent?: SubAgentEventListener
}

export async function runRunAgent(
  config: RunAgentConfig,
  runtime: RunAgentRuntime
): Promise<SubTaskResult> {
  const startTime = Date.now()
  const steps: SubTaskStep[] = []
  const { onEvent } = runtime
  
  // 生成子 Agent ID
  const subAgentId = generateSubAgentId()

  try {
    // 发送开始事件
    onEvent?.({
      type: "start",
      id: subAgentId,
      prompt: config.prompt,
      agentType: config.agentType || "build"
    })

    // ... 创建 Provider, Agent Loop 等 ...

    let output = ""
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let turnCount = 0
    const maxTurns = config.maxTurns || 30

    for await (const event of loop.run(config.prompt)) {
      if (config.abort?.aborted) {
        onEvent?.({ type: "end", id: subAgentId, success: false, output: "Aborted" })
        return { success: false, output, error: "Task was aborted", steps, usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }, duration: Date.now() - startTime }
      }

      switch (event.type) {
        case "text":
          output = event.content
          // 转发文本事件
          onEvent?.({ type: "text", id: subAgentId, content: event.content })
          break

        case "tool_start":
          turnCount++
          // 转发工具开始事件
          onEvent?.({
            type: "tool_start",
            id: subAgentId,
            toolId: event.id,
            name: event.name,
            input: event.input
          })
          // 发送步骤进度
          onEvent?.({
            type: "step",
            id: subAgentId,
            current: turnCount,
            total: maxTurns
          })
          steps.push({ name: event.name, type: "tool", input: event.input, duration: 0, success: true })
          break

        case "tool_end":
          // 转发工具结束事件
          onEvent?.({
            type: "tool_end",
            id: subAgentId,
            toolId: event.id,
            output: event.result.output,
            isError: event.isError
          })
          // 更新步骤
          const lastStep = steps[steps.length - 1]
          if (lastStep) {
            lastStep.output = event.result.output
            lastStep.success = !event.isError
          }
          break

        case "done":
          totalInputTokens = event.usage.inputTokens
          totalOutputTokens = event.usage.outputTokens
          break

        case "error":
          onEvent?.({ type: "end", id: subAgentId, success: false, output: event.error.message })
          return { success: false, output, error: event.error.message, steps, usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }, duration: Date.now() - startTime }
      }
    }

    // 发送结束事件
    onEvent?.({
      type: "end",
      id: subAgentId,
      success: true,
      output,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
    })

    return { success: true, output, steps, usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }, duration: Date.now() - startTime }
  } catch (error) {
    onEvent?.({ type: "end", id: subAgentId, success: false, output: error instanceof Error ? error.message : String(error) })
    return { success: false, output: "", error: error instanceof Error ? error.message : String(error), steps, usage: { inputTokens: 0, outputTokens: 0 }, duration: Date.now() - startTime }
  }
}
```


### 3. 修改 RunAgentTool

```typescript
// packages/agent/src/tool/subagent/run-agent-tool.ts (修改)

import type { SubAgentEventListener } from "../../subtask/events"

// 全局运行时引用
let globalRuntime: RunAgentRuntime | null = null
// 全局事件监听器
let globalEventListener: SubAgentEventListener | null = null

export function setRunAgentRuntime(runtime: RunAgentRuntime) {
  globalRuntime = runtime
}

/** 设置子 Agent 事件监听器 */
export function setSubAgentEventListener(listener: SubAgentEventListener | null) {
  globalEventListener = listener
}

export const RunAgentTool = Tool.define({
  id: "run_agent",
  description: DESCRIPTION,
  parameters: z.object({
    prompt: z.string().describe("The task description for the sub-agent"),
    agentType: z.enum(["build", "plan", "explore"]).optional(),
    tools: z.array(z.string()).optional(),
    maxTurns: z.number().optional(),
  }),

  async execute(params, ctx) {
    if (!globalRuntime) {
      return { title: "run_agent", output: "Error: RunAgent runtime not configured.", metadata: { error: true } }
    }

    const startTime = Date.now()

    try {
      // 将事件监听器传递给 runtime
      const runtimeWithListener: RunAgentRuntime = {
        ...globalRuntime,
        onEvent: globalEventListener || undefined
      }

      const result = await runRunAgent(
        {
          mode: "run_agent",
          prompt: params.prompt,
          agentType: params.agentType || "build",
          tools: params.tools,
          maxTurns: params.maxTurns || 30,
          cwd: ctx.cwd,
          abort: ctx.abort,
        },
        runtimeWithListener
      )

      // ... 返回结果 ...
    } catch (error) {
      return { title: "run_agent", output: `Error: ${error instanceof Error ? error.message : String(error)}`, metadata: { error: true } }
    }
  },
})
```

### 4. UI 类型扩展

```typescript
// packages/agent/src/cli/ink/types.ts (新增)

/**
 * 子 Agent 状态
 */
export interface SubAgentState {
  /** 子 Agent ID */
  id: string
  /** 任务描述 */
  prompt: string
  /** Agent 类型 */
  agentType: string
  /** 执行状态 */
  status: 'running' | 'completed' | 'error'
  /** 累积文本输出 */
  text: string
  /** 工具调用列表 */
  tools: ToolCall[]
  /** 当前步骤 */
  currentStep: number
  /** 最大步骤 */
  maxSteps: number
  /** 开始时间 */
  startTime: number
  /** 结束时间 */
  endTime?: number
  /** Token 使用 */
  usage?: { inputTokens: number; outputTokens: number }
}

/**
 * 扩展 ToolCall，支持子 Agent
 */
export interface ToolCall {
  // ... 现有字段 ...
  /** 如果是 run_agent 工具，包含子 Agent 状态 */
  subAgent?: SubAgentState
}
```


### 5. SubAgentPanel 组件

```tsx
// packages/agent/src/cli/ink/components/SubAgentPanel.tsx

import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import { Spinner } from '@inkjs/ui'
import type { SubAgentState, ToolCall } from '../types.js'
import { truncateString } from '../utils/format.js'
import { getToolIcon, getToolColor } from '../utils/colors.js'

interface SubAgentPanelProps {
  subAgent: SubAgentState
  isExpanded?: boolean
}

export function SubAgentPanel({ subAgent, isExpanded = false }: SubAgentPanelProps): React.ReactElement {
  const [elapsedTime, setElapsedTime] = useState(0)
  const isRunning = subAgent.status === 'running'

  // 实时计时
  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - subAgent.startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [isRunning, subAgent.startTime])

  const formatTime = (s: number) => s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`

  return (
    <Box flexDirection="column" marginLeft={2} borderStyle="round" borderColor="cyan" paddingX={1}>
      {/* 头部 */}
      <Box gap={1}>
        <Text color="cyan">🤖</Text>
        <Text color="cyan" bold>子 Agent</Text>
        <Text color="gray">({subAgent.agentType})</Text>
        {isRunning && <Spinner />}
        {subAgent.status === 'completed' && <Text color="green">✓</Text>}
        {subAgent.status === 'error' && <Text color="red">✗</Text>}
        <Text color="yellow">{formatTime(elapsedTime)}</Text>
      </Box>

      {/* 任务描述 */}
      <Box marginLeft={2}>
        <Text color="gray" dimColor>
          任务: {truncateString(subAgent.prompt, 50)}
        </Text>
      </Box>

      {/* 进度条 */}
      <Box marginLeft={2} gap={1}>
        <Text color="yellow">
          步骤 {subAgent.currentStep}/{subAgent.maxSteps}
        </Text>
        <Text color="gray">
          [{renderProgressBar(subAgent.currentStep, subAgent.maxSteps, 20)}]
        </Text>
      </Box>

      {/* 工具调用列表（最近 3 个） */}
      {subAgent.tools.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <Text color="gray" dimColor>最近操作:</Text>
          {subAgent.tools.slice(-3).map((tool, i) => (
            <Box key={tool.id} marginLeft={2} gap={1}>
              <Text color={getToolColor(tool.name)}>{getToolIcon(tool.name)}</Text>
              <Text color="white">{tool.displayName}</Text>
              <Text color="gray">{truncateString(formatToolSummary(tool), 40)}</Text>
              {tool.status === 'pending' && <Spinner />}
              {tool.status === 'completed' && <Text color="green">✓</Text>}
              {tool.status === 'error' && <Text color="red">✗</Text>}
            </Box>
          ))}
        </Box>
      )}

      {/* 展开时显示完整输出 */}
      {isExpanded && subAgent.text && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          <Text color="gray" dimColor>输出预览:</Text>
          <Box marginLeft={2}>
            <Text color="white">{truncateString(subAgent.text, 200)}</Text>
          </Box>
        </Box>
      )}

      {/* Token 使用（完成后显示） */}
      {subAgent.status !== 'running' && subAgent.usage && (
        <Box marginLeft={2} marginTop={1}>
          <Text color="gray" dimColor>
            Token: {subAgent.usage.inputTokens} in / {subAgent.usage.outputTokens} out
          </Text>
        </Box>
      )}
    </Box>
  )
}

function renderProgressBar(current: number, total: number, width: number): string {
  const filled = Math.round((current / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function formatToolSummary(tool: ToolCall): string {
  const input = tool.input as Record<string, unknown>
  if (input.filePath) return String(input.filePath)
  if (input.command) return String(input.command).slice(0, 30)
  if (input.pattern) return String(input.pattern)
  return JSON.stringify(input).slice(0, 30)
}
```


### 6. 修改 ToolPanel 集成子 Agent

```tsx
// packages/agent/src/cli/ink/components/ToolPanel.tsx (修改)

import { SubAgentPanel } from './SubAgentPanel.js'

export function ToolPanel({ tool, isExpanded, onToggle, isSelected }: ToolPanelProps): React.ReactElement {
  // ... 现有代码 ...

  // 如果是 run_agent 工具且有子 Agent 状态，显示子 Agent 面板
  const isSubAgentTool = tool.name === 'run_agent' && tool.subAgent

  return (
    <Box flexDirection="column" marginY={0}>
      {/* 摘要行 */}
      <Box>{renderSummary()}</Box>

      {/* 子 Agent 面板（如果是 run_agent 工具） */}
      {isSubAgentTool && (
        <SubAgentPanel 
          subAgent={tool.subAgent!} 
          isExpanded={isExpanded}
        />
      )}

      {/* 普通工具的输出预览（折叠时） */}
      {!isSubAgentTool && renderPreview()}

      {/* 普通工具的详细内容（展开时） */}
      {!isSubAgentTool && renderDetails()}
    </Box>
  )
}
```

### 7. useMessages Hook 处理子 Agent 事件

```typescript
// packages/agent/src/cli/ink/hooks/useSubAgent.ts (新建)

import { useState, useCallback } from 'react'
import type { SubAgentState, ToolCall } from '../types.js'
import type { SubAgentEvent } from '../../../subtask/events.js'

export interface UseSubAgentReturn {
  /** 活跃的子 Agent 列表 */
  activeSubAgents: Map<string, SubAgentState>
  /** 处理子 Agent 事件 */
  handleSubAgentEvent: (event: SubAgentEvent) => void
  /** 将子 Agent 状态关联到工具调用 */
  linkToToolCall: (toolCallId: string, subAgentId: string) => void
  /** 获取工具调用关联的子 Agent */
  getSubAgentForTool: (toolCallId: string) => SubAgentState | undefined
}

export function useSubAgent(): UseSubAgentReturn {
  const [activeSubAgents, setActiveSubAgents] = useState<Map<string, SubAgentState>>(new Map())
  const [toolToSubAgent, setToolToSubAgent] = useState<Map<string, string>>(new Map())

  const handleSubAgentEvent = useCallback((event: SubAgentEvent) => {
    setActiveSubAgents(prev => {
      const next = new Map(prev)
      
      switch (event.type) {
        case 'start':
          next.set(event.id, {
            id: event.id,
            prompt: event.prompt,
            agentType: event.agentType,
            status: 'running',
            text: '',
            tools: [],
            currentStep: 0,
            maxSteps: 30,
            startTime: Date.now(),
          })
          break

        case 'text':
          const textState = next.get(event.id)
          if (textState) {
            next.set(event.id, { ...textState, text: event.content })
          }
          break

        case 'tool_start':
          const toolStartState = next.get(event.id)
          if (toolStartState) {
            const newTool: ToolCall = {
              id: event.toolId,
              name: event.name as any,
              displayName: event.name,
              input: event.input as any,
              isError: false,
              status: 'pending',
              startTime: Date.now(),
            }
            next.set(event.id, {
              ...toolStartState,
              tools: [...toolStartState.tools, newTool],
            })
          }
          break

        case 'tool_end':
          const toolEndState = next.get(event.id)
          if (toolEndState) {
            const updatedTools = toolEndState.tools.map(t =>
              t.id === event.toolId
                ? { ...t, output: event.output, isError: event.isError, status: event.isError ? 'error' : 'completed' as const, endTime: Date.now() }
                : t
            )
            next.set(event.id, { ...toolEndState, tools: updatedTools })
          }
          break

        case 'step':
          const stepState = next.get(event.id)
          if (stepState) {
            next.set(event.id, { ...stepState, currentStep: event.current, maxSteps: event.total })
          }
          break

        case 'end':
          const endState = next.get(event.id)
          if (endState) {
            next.set(event.id, {
              ...endState,
              status: event.success ? 'completed' : 'error',
              endTime: Date.now(),
              usage: event.usage,
            })
          }
          break
      }
      
      return next
    })
  }, [])

  const linkToToolCall = useCallback((toolCallId: string, subAgentId: string) => {
    setToolToSubAgent(prev => new Map(prev).set(toolCallId, subAgentId))
  }, [])

  const getSubAgentForTool = useCallback((toolCallId: string): SubAgentState | undefined => {
    const subAgentId = toolToSubAgent.get(toolCallId)
    return subAgentId ? activeSubAgents.get(subAgentId) : undefined
  }, [activeSubAgents, toolToSubAgent])

  return {
    activeSubAgents,
    handleSubAgentEvent,
    linkToToolCall,
    getSubAgentForTool,
  }
}
```


### 8. 在 App 中集成

```tsx
// packages/agent/src/cli/ink/App.tsx (修改关键部分)

import { useSubAgent } from './hooks/useSubAgent.js'
import { setSubAgentEventListener } from '../../tool/subagent/run-agent-tool.js'

export function App({ config }: AppProps): React.ReactElement {
  // ... 现有 hooks ...
  
  // 子 Agent 状态管理
  const { activeSubAgents, handleSubAgentEvent, linkToToolCall, getSubAgentForTool } = useSubAgent()

  // 设置全局事件监听器
  useEffect(() => {
    setSubAgentEventListener(handleSubAgentEvent)
    return () => setSubAgentEventListener(null)
  }, [handleSubAgentEvent])

  // 修改 useRunner 的 onToolStart 回调
  const handleToolStart = useCallback((toolId: string, name: string, input: unknown) => {
    const id = addToolCall({ name, displayName: name, input })
    
    // 如果是 run_agent 工具，监听子 Agent 事件
    if (name === 'run_agent') {
      // 子 Agent 会在执行时自动发送 start 事件
      // 我们需要在收到 start 事件时关联到这个工具调用
      // 这里设置一个临时标记
      pendingSubAgentToolRef.current = id
    }
    
    return id
  }, [addToolCall])

  // 监听子 Agent start 事件，关联到工具调用
  useEffect(() => {
    const originalHandler = handleSubAgentEvent
    const wrappedHandler = (event: SubAgentEvent) => {
      originalHandler(event)
      
      if (event.type === 'start' && pendingSubAgentToolRef.current) {
        linkToToolCall(pendingSubAgentToolRef.current, event.id)
        pendingSubAgentToolRef.current = null
      }
    }
    setSubAgentEventListener(wrappedHandler)
    return () => setSubAgentEventListener(null)
  }, [handleSubAgentEvent, linkToToolCall])

  // 在渲染消息时，为 run_agent 工具注入子 Agent 状态
  const messagesWithSubAgents = useMemo(() => {
    return messages.map(msg => {
      if (msg.type !== 'tool') return msg
      
      const subAgent = getSubAgentForTool(msg.tool.id)
      if (!subAgent) return msg
      
      return {
        ...msg,
        tool: { ...msg.tool, subAgent }
      }
    })
  }, [messages, getSubAgentForTool])

  return (
    <Box flexDirection="column" height="100%">
      {/* ... 其他组件 ... */}
      
      <MessageList
        messages={messagesWithSubAgents}
        expandedTools={expandedTools}
        onToggleTool={toggleTool}
        selectedToolId={selectedToolId}
      />
      
      {/* 状态指示器显示活跃子 Agent */}
      <StatusIndicator
        status={status}
        message={statusMessage}
        detail={statusDetail}
        activeSubAgents={Array.from(activeSubAgents.values()).filter(s => s.status === 'running')}
      />
      
      {/* ... 其他组件 ... */}
    </Box>
  )
}
```

### 9. StatusIndicator 增强

```tsx
// packages/agent/src/cli/ink/components/StatusIndicator.tsx (修改)

interface StatusIndicatorProps {
  // ... 现有 props ...
  /** 活跃的子 Agent 列表 */
  activeSubAgents?: SubAgentState[]
}

export function StatusIndicator({ status, message, detail, activeSubAgents }: StatusIndicatorProps) {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      {/* 主状态行 */}
      <Box gap={1}>
        {status === 'thinking' && <Spinner />}
        <Text color={getStatusColor(status)}>{getStatusIcon(status)}</Text>
        <Text>{message || getDefaultMessage(status)}</Text>
        {detail && <Text color="gray" dimColor>- {detail}</Text>}
      </Box>

      {/* 活跃子 Agent 列表 */}
      {activeSubAgents && activeSubAgents.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan" dimColor>🤖 活跃子任务 ({activeSubAgents.length}):</Text>
          {activeSubAgents.map(sa => (
            <Box key={sa.id} marginLeft={2} gap={1}>
              <Spinner />
              <Text color="gray">{sa.agentType}</Text>
              <Text color="white">{truncateString(sa.prompt, 40)}</Text>
              <Text color="yellow">步骤 {sa.currentStep}/{sa.maxSteps}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
```


## 预期效果

实现后的 UI 效果：

```
┌─────────────────────────────────────────────────────────────────┐
│ 🤖 claude-opus ═══════════════════════════════════════════════  │
│                                                                 │
│ 我来帮你分析这个代码库的结构...                                 │
│                                                                 │
│ ▶ 🤖 run_agent 分析项目结构 ⏳ (12s)                            │
│   ╭──────────────────────────────────────────────────────────╮  │
│   │ 🤖 子 Agent (explore) ⏳ 12s                              │  │
│   │   任务: 分析项目结构并生成报告                            │  │
│   │   步骤 5/30 [████████░░░░░░░░░░░░]                        │  │
│   │                                                          │  │
│   │   最近操作:                                              │  │
│   │     📖 read src/index.ts ✓                               │  │
│   │     🔍 glob **/*.ts ✓                                    │  │
│   │     📖 read package.json ⏳                              │  │
│   ╰──────────────────────────────────────────────────────────╯  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ ⏳ 思考中... - 等待子任务完成                                   │
│ 🤖 活跃子任务 (1):                                              │
│   ⏳ explore: 分析项目结构并生成报告 步骤 5/30                  │
└─────────────────────────────────────────────────────────────────┘
```

## 总结

### 核心改动

1. **事件传递**: 子 Agent 执行时通过回调函数向上传递事件
2. **状态管理**: 新增 `useSubAgent` hook 管理子 Agent 状态
3. **UI 组件**: 新增 `SubAgentPanel` 组件显示子 Agent 详情
4. **集成**: 修改 `ToolPanel` 和 `StatusIndicator` 显示子 Agent 信息

### 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/subtask/events.ts` | 新建 | 子 Agent 事件类型定义 |
| `src/subtask/run-agent.ts` | 修改 | 添加事件回调支持 |
| `src/tool/subagent/run-agent-tool.ts` | 修改 | 传递事件监听器 |
| `src/cli/ink/types.ts` | 修改 | 添加 SubAgentState 类型 |
| `src/cli/ink/components/SubAgentPanel.tsx` | 新建 | 子 Agent 面板组件 |
| `src/cli/ink/components/ToolPanel.tsx` | 修改 | 集成子 Agent 面板 |
| `src/cli/ink/components/StatusIndicator.tsx` | 修改 | 显示活跃子 Agent |
| `src/cli/ink/hooks/useSubAgent.ts` | 新建 | 子 Agent 状态管理 |
| `src/cli/ink/App.tsx` | 修改 | 集成子 Agent 系统 |

### 后续扩展

1. **并行子 Agent**: 支持 `parallel_agents` 工具的多子 Agent 显示
2. **嵌套子 Agent**: 支持子 Agent 再调用子 Agent 的递归显示
3. **历史记录**: 保存子 Agent 执行历史，支持回放
4. **性能优化**: 大量子 Agent 时的渲染优化
