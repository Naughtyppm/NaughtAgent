# Design Document: 子 Agent 系统增强

## Overview

本设计文档描述 NaughtyAgent 子 Agent 系统增强功能的技术实现方案。该功能基于现有的子 Agent 基础设施（6 种工具 + 事件系统），进行以下增强：

1. **统一 Task 工具** - 提供简化的子 Agent 调用接口
2. **自定义 Agent 注册表** - 支持通过 Markdown 文件定义专用子 Agent
3. **Abort 信号链** - 完善取消信号的传递机制
4. **并发控制器** - 优化并行执行的资源管理
5. **状态可视化** - 增强 UI 组件的信息展示

### 设计原则

- **向后兼容**: 现有的 6 种子 Agent 工具保持不变，Task 工具作为统一入口
- **渐进增强**: 在现有事件系统基础上扩展，不破坏已有功能
- **最小侵入**: 尽量复用现有代码，减少重构范围

## Architecture

### 系统架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                           主 Agent Loop                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────────────────────────────────┐    │
│  │  Task Tool  │───▶│           Agent Registry                │    │
│  │  (统一入口)  │    │  ┌─────────────┐  ┌─────────────────┐  │    │
│  └─────────────┘    │  │ Built-in    │  │ Custom Agents   │  │    │
│         │           │  │ (explore,   │  │ (.naughty/      │  │    │
│         │           │  │  plan,      │  │  agents/*.md)   │  │    │
│         │           │  │  build)     │  │                 │  │    │
│         │           │  └─────────────┘  └─────────────────┘  │    │
│         │           └─────────────────────────────────────────┘    │
│         │                                                          │
│         ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    SubTask Executor                          │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │  │
│  │  │run_agent │ │fork_agent│ │ask_llm   │ │parallel_agents│   │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │  │
│  │  ┌──────────┐ ┌──────────────┐                              │  │
│  │  │multi_agent│ │run_workflow │                              │  │
│  │  └──────────┘ └──────────────┘                              │  │
│  └─────────────────────────────────────────────────────────────┘  │
│         │                                                          │
│         │ Events                                                   │
│         ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              Global Event Listener                           │  │
│  │  (setGlobalSubAgentEventListener)                           │  │
│  └─────────────────────────────────────────────────────────────┘  │
│         │                                                          │
└─────────│──────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           UI Layer (Ink)                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐    │
│  │useSubAgent  │  │SubAgentPanel│  │StatusIndicator          │    │
│  │(状态管理)    │  │(详情展示)    │  │(活跃子 Agent 摘要)      │    │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Abort 信号链

```
┌──────────────────────────────────────────────────────────────────┐
│  User Ctrl+C                                                     │
│       │                                                          │
│       ▼                                                          │
│  AbortController.abort()                                         │
│       │                                                          │
│       ├──────────────────────────────────────────────────────┐  │
│       │                                                      │  │
│       ▼                                                      ▼  │
│  Main Agent Loop                                    Task Tool   │
│  (检查 abort.aborted)                              (传递 abort) │
│                                                          │      │
│                                                          ▼      │
│                                              ┌───────────────┐  │
│                                              │ SubTask       │  │
│                                              │ Executor      │  │
│                                              │ (检查 abort)  │  │
│                                              └───────┬───────┘  │
│                                                      │          │
│                                    ┌─────────────────┼──────────┤
│                                    ▼                 ▼          │
│                              Child Agent 1    Child Agent 2     │
│                              (检查 abort)     (检查 abort)      │
└──────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Task Tool (统一入口)

```typescript
// packages/agent/src/subtask/task-tool.ts

interface TaskParams {
  /** 任务描述 */
  description: string
  /** 任务类型 */
  type: "explore" | "plan" | "build" | "custom"
  /** 自定义 Agent 名称（type 为 custom 时必填） */
  customAgent?: string
  /** 初始文件上下文 */
  files?: string[]
  /** 工具白名单（覆盖默认） */
  tools?: string[]
  /** 最大轮数 */
  maxTurns?: number
  /** 超时时间（毫秒） */
  timeout?: number
}

interface TaskResult {
  success: boolean
  output: string
  steps?: SubTaskStep[]
  usage: { inputTokens: number; outputTokens: number }
  duration: number
  error?: string
}

// Task 工具定义
const TaskTool = Tool.define({
  id: "task",
  description: `Delegate a task to a specialized sub-agent.
  
Types:
- explore: Read-only analysis (tools: read, glob, grep)
- plan: Planning and research (tools: read, glob, grep, write for plans)
- build: Full implementation (tools: all)
- custom: Use a custom agent defined in .naughty/agents/`,
  parameters: z.object({
    description: z.string(),
    type: z.enum(["explore", "plan", "build", "custom"]),
    customAgent: z.string().optional(),
    files: z.array(z.string()).optional(),
    tools: z.array(z.string()).optional(),
    maxTurns: z.number().optional(),
    timeout: z.number().optional(),
  }),
  execute: async (params, ctx) => { /* ... */ }
})
```

### 2. Agent Registry (Agent 注册表)

```typescript
// packages/agent/src/subtask/agent-registry.ts

interface CustomAgentDefinition {
  /** Agent 名称（唯一标识） */
  name: string
  /** 描述 */
  description: string
  /** 可用工具列表 */
  tools: string[]
  /** 模型配置 */
  model?: string
  /** 权限模式 */
  permissionMode?: "ask" | "allow" | "plan"
  /** 系统提示词 */
  systemPrompt: string
  /** 定义文件路径 */
  filePath: string
}

interface AgentRegistry {
  /** 加载自定义 Agent 定义 */
  loadCustomAgents(dir: string): Promise<void>
  /** 获取 Agent 定义 */
  getAgent(name: string): CustomAgentDefinition | undefined
  /** 列出所有 Agent */
  listAgents(): CustomAgentDefinition[]
  /** 检查 Agent 是否存在 */
  hasAgent(name: string): boolean
  /** 刷新 Agent 定义 */
  refresh(): Promise<void>
}

// 单例实例
const agentRegistry: AgentRegistry = createAgentRegistry()
```

### 3. Concurrency Controller (并发控制器)

```typescript
// packages/agent/src/subtask/concurrency.ts

interface ConcurrencyConfig {
  /** 最大并发数 */
  maxConcurrency: number
  /** 遇错即停 */
  failFast: boolean
  /** 单任务超时（毫秒） */
  timeout?: number
}

interface ConcurrencyController<T, R> {
  /** 并行执行任务 */
  run(
    items: T[],
    executor: (item: T, signal: AbortSignal) => Promise<R>,
    config?: Partial<ConcurrencyConfig>
  ): Promise<ConcurrencyResult<R>>
  
  /** 取消所有任务 */
  abort(): void
}

interface ConcurrencyResult<R> {
  results: Array<{ success: boolean; value?: R; error?: string }>
  completed: number
  failed: number
  aborted: number
  totalDuration: number
}
```

### 4. Enhanced Event Types (增强事件类型)

```typescript
// packages/agent/src/subtask/events.ts (扩展)

// 新增：配置变更事件
interface SubAgentConfigEvent {
  type: "config"
  id: string
  config: {
    maxTurns?: number
    timeout?: number
    tools?: string[]
  }
}

// 新增：重试事件
interface SubAgentRetryEvent {
  type: "retry"
  id: string
  attempt: number
  maxAttempts: number
  error: string
  delay: number
}

// 扩展事件联合类型
type SubAgentEvent =
  | SubAgentStartEvent
  | SubAgentTextEvent
  | SubAgentToolStartEvent
  | SubAgentToolEndEvent
  | SubAgentStepEvent
  | SubAgentThinkingEvent
  | SubAgentEndEvent
  | SubAgentChildStartEvent
  | SubAgentChildEndEvent
  | SubAgentConfigEvent  // 新增
  | SubAgentRetryEvent   // 新增
```

### 5. Configuration Manager (配置管理器)

```typescript
// packages/agent/src/subtask/config.ts

interface SubAgentConfig {
  /** 默认超时（毫秒） */
  defaultTimeout: number
  /** 最大并发数 */
  maxConcurrency: number
  /** 重试配置 */
  retry: {
    maxAttempts: number
    initialDelay: number
    maxDelay: number
    backoffMultiplier: number
  }
  /** 默认模型 */
  defaultModel?: string
  /** 自定义 Agent 目录 */
  customAgentsDir: string
}

const DEFAULT_CONFIG: SubAgentConfig = {
  defaultTimeout: 180000,  // 3 分钟
  maxConcurrency: 3,
  retry: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
  },
  customAgentsDir: ".naughty/agents",
}

interface ConfigManager {
  /** 加载配置 */
  load(cwd: string): Promise<SubAgentConfig>
  /** 获取当前配置 */
  get(): SubAgentConfig
  /** 合并配置 */
  merge(partial: Partial<SubAgentConfig>): SubAgentConfig
}
```

## Data Models

### Custom Agent Definition File Format

自定义 Agent 通过 Markdown 文件定义，使用 YAML frontmatter 配置：

```markdown
# .naughty/agents/security-reviewer.md

---
name: security-reviewer
description: 代码安全审查专家，专注 OWASP Top 10 漏洞检测
tools:
  - read
  - glob
  - grep
model: claude-sonnet
permissionMode: plan
---

## 系统提示

你是一位资深的安全审计专家，专注于代码安全审查。

### 审查重点

1. **注入漏洞**
   - SQL 注入
   - 命令注入
   - XSS（跨站脚本）

2. **认证和会话**
   - 弱密码策略
   - 会话固定
   - 不安全的令牌存储

3. **敏感数据**
   - 硬编码凭证
   - 不安全的数据传输
   - 日志中的敏感信息

### 输出格式

请以结构化报告形式输出，包含：
- 严重级别（Critical/High/Medium/Low）
- 漏洞位置（文件:行号）
- 问题描述
- 修复建议
```

### Parsed Agent Definition

```typescript
interface ParsedAgentDefinition {
  // Frontmatter 字段
  name: string
  description: string
  tools: string[]
  model?: string
  permissionMode?: "ask" | "allow" | "plan"
  
  // 解析后的字段
  systemPrompt: string  // Markdown body
  filePath: string      // 源文件路径
  lastModified: number  // 最后修改时间
}
```

### Configuration File Format

```json
// .naughty/config.json
{
  "subagent": {
    "defaultTimeout": 180000,
    "maxConcurrency": 3,
    "retry": {
      "maxAttempts": 3,
      "initialDelay": 1000,
      "maxDelay": 10000,
      "backoffMultiplier": 2
    },
    "defaultModel": "claude-sonnet",
    "customAgentsDir": ".naughty/agents"
  }
}
```

### SubAgent State (UI 状态模型)

```typescript
// 已在 types.ts 中定义，此处为完整参考
interface SubAgentState {
  id: string
  mode: SubAgentMode
  prompt: string
  agentType: string
  status: SubAgentStatus
  text: string
  tools: SubAgentToolCall[]
  children?: SubAgentChild[]
  currentStep: number
  maxSteps: number
  startTime: number
  endTime?: number
  usage?: { inputTokens: number; outputTokens: number }
  // 新增字段
  retryCount?: number
  config?: {
    timeout?: number
    maxTurns?: number
  }
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

基于需求分析，以下是本功能的正确性属性：

### Property 1: Task Tool Interface Validation

*For any* valid TaskParams object, the Task tool SHALL accept the parameters and return a TaskResult containing all required fields (success, output, usage, duration).

**Validates: Requirements 1.1, 1.5**

### Property 2: Agent Type Routing

*For any* task type in ["explore", "plan", "build"], the Task tool SHALL route to the corresponding built-in agent with the correct tool permissions.

**Validates: Requirements 1.2, 1.3**

### Property 3: Custom Agent Loading

*For any* task with type "custom" and a valid customAgent name, the Task tool SHALL load the agent definition from the registry.

**Validates: Requirements 1.4**

### Property 4: Markdown Parsing Round-Trip

*For any* valid Markdown file with YAML frontmatter in `.naughty/agents/`, parsing SHALL extract name, description, tools, model, permissionMode from frontmatter and the body as systemPrompt.

**Validates: Requirements 2.2, 2.3, 2.4**

### Property 5: Agent Registry Lookup

*For any* agent name, the registry SHALL return the definition if it exists, or undefined if not found.

**Validates: Requirements 2.5**

### Property 6: Agent Definition Validation

*For any* agent definition missing required fields (name or description), the registry SHALL reject the definition and not include it in the available agents.

**Validates: Requirements 2.6, 2.7**

### Property 7: Abort Signal Propagation

*For any* abort signal received by a parent agent, all active child sub-agents SHALL receive the abort signal within the same event loop tick.

**Validates: Requirements 3.1, 3.5**

### Property 8: Abort Timing

*For any* sub-agent that receives an abort signal, the sub-agent SHALL terminate and return within 1 second.

**Validates: Requirements 3.2**

### Property 9: Partial Results on Abort

*For any* aborted sub-agent that has produced partial output, the result SHALL include the partial output and steps completed.

**Validates: Requirements 3.3**

### Property 10: Concurrency Limiting

*For any* parallel execution with maxConcurrency=N, at most N sub-agents SHALL be running simultaneously at any point in time.

**Validates: Requirements 4.1**

### Property 11: Parallel Error Handling

*For any* parallel execution with failFast=false, a failing sub-agent SHALL NOT prevent other sub-agents from completing.

**Validates: Requirements 4.2**

### Property 12: Timeout Enforcement

*For any* sub-agent with a timeout configured, exceeding the timeout SHALL result in abort and a timeout error in the result.

**Validates: Requirements 4.3, 4.4**

### Property 13: Progress Reporting

*For any* parallel execution, completing a sub-agent SHALL emit a progress event with the current completion count.

**Validates: Requirements 4.5**

### Property 14: Event Structure Completeness

*For any* SubAgentEvent of type "start", the event SHALL contain id, mode, prompt, agentType, and maxSteps. *For any* SubAgentEvent of type "end", the event SHALL contain id, success, output, duration, and optionally error and usage.

**Validates: Requirements 6.1, 6.5**

### Property 15: Tool Event Timing

*For any* tool_end event, the event SHALL contain the duration field representing execution time in milliseconds.

**Validates: Requirements 6.3**

### Property 16: Child Event Emission

*For any* sub-agent that spawns child tasks (parallel_agents, multi_agent), child_start and child_end events SHALL be emitted for each child.

**Validates: Requirements 6.6**

### Property 17: Error Structure

*For any* sub-agent error, the error SHALL be structured with type, message, and context fields.

**Validates: Requirements 7.1**

### Property 18: Retry Behavior

*For any* Task tool execution with retry enabled, failed attempts SHALL be retried up to maxAttempts times with exponential backoff delay.

**Validates: Requirements 7.3**

### Property 19: Configuration Defaults

*For any* missing configuration value, the system SHALL use the defined default value.

**Validates: Requirements 8.3**

### Property 20: Configuration Validation

*For any* invalid configuration value (e.g., negative timeout, non-integer concurrency), loading SHALL report a validation error.

**Validates: Requirements 8.4**

## Error Handling

### Error Types

```typescript
// packages/agent/src/subtask/errors.ts

enum SubAgentErrorType {
  /** 配置错误 */
  CONFIG_ERROR = "CONFIG_ERROR",
  /** Agent 未找到 */
  AGENT_NOT_FOUND = "AGENT_NOT_FOUND",
  /** 执行超时 */
  TIMEOUT = "TIMEOUT",
  /** 用户取消 */
  ABORTED = "ABORTED",
  /** LLM 调用失败 */
  LLM_ERROR = "LLM_ERROR",
  /** 工具执行失败 */
  TOOL_ERROR = "TOOL_ERROR",
  /** 并发限制 */
  CONCURRENCY_ERROR = "CONCURRENCY_ERROR",
  /** 重试耗尽 */
  RETRY_EXHAUSTED = "RETRY_EXHAUSTED",
}

interface SubAgentError {
  type: SubAgentErrorType
  message: string
  context: {
    agentId?: string
    agentType?: string
    step?: number
    toolName?: string
    duration?: number
    retryCount?: number
  }
  cause?: Error
}
```

### Error Handling Strategy

| 错误类型 | 处理策略 | 是否重试 |
|---------|---------|---------|
| CONFIG_ERROR | 立即失败，返回配置错误详情 | 否 |
| AGENT_NOT_FOUND | 立即失败，列出可用 Agent | 否 |
| TIMEOUT | 返回部分结果和超时信息 | 可配置 |
| ABORTED | 返回部分结果，标记为已取消 | 否 |
| LLM_ERROR | 重试（网络错误）或失败（API 错误） | 部分 |
| TOOL_ERROR | 继续执行，记录错误 | 否 |
| CONCURRENCY_ERROR | 等待或失败 | 是 |
| RETRY_EXHAUSTED | 返回所有尝试的错误详情 | 否 |

### Retry Configuration

```typescript
interface RetryConfig {
  /** 最大重试次数 */
  maxAttempts: number
  /** 初始延迟（毫秒） */
  initialDelay: number
  /** 最大延迟（毫秒） */
  maxDelay: number
  /** 退避乘数 */
  backoffMultiplier: number
  /** 可重试的错误类型 */
  retryableErrors: SubAgentErrorType[]
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    SubAgentErrorType.LLM_ERROR,
    SubAgentErrorType.TIMEOUT,
    SubAgentErrorType.CONCURRENCY_ERROR,
  ],
}
```

## Testing Strategy

### 测试方法

本功能采用双重测试策略：

1. **单元测试**: 验证具体示例和边界情况
2. **属性测试**: 验证跨所有输入的通用属性

### 属性测试库

使用 **fast-check** 作为属性测试库（TypeScript 生态中最成熟的 PBT 库）。

### 测试配置

- 每个属性测试运行 **100 次迭代**
- 使用 `fc.assert` 和 `fc.property` 进行属性验证
- 每个测试标注对应的设计属性编号

### 测试文件结构

```
packages/agent/test/subtask/
├── task-tool.test.ts           # Task 工具测试
├── agent-registry.test.ts      # Agent 注册表测试
├── concurrency.test.ts         # 并发控制器测试
├── abort-chain.test.ts         # Abort 信号链测试
├── events.test.ts              # 事件系统测试
├── config.test.ts              # 配置管理测试
└── properties/                 # 属性测试
    ├── task-tool.property.ts
    ├── registry.property.ts
    ├── concurrency.property.ts
    └── events.property.ts
```

### 属性测试示例

```typescript
// packages/agent/test/subtask/properties/task-tool.property.ts

import { describe, it } from 'vitest'
import * as fc from 'fast-check'

describe('Task Tool Properties', () => {
  // Feature: subagent-enhancement, Property 1: Task Tool Interface Validation
  it('should return result with all required fields for any valid params', () => {
    fc.assert(
      fc.property(
        fc.record({
          description: fc.string({ minLength: 1 }),
          type: fc.constantFrom('explore', 'plan', 'build'),
        }),
        async (params) => {
          const result = await executeMockTask(params)
          expect(result).toHaveProperty('success')
          expect(result).toHaveProperty('output')
          expect(result).toHaveProperty('usage')
          expect(result).toHaveProperty('duration')
        }
      ),
      { numRuns: 100 }
    )
  })

  // Feature: subagent-enhancement, Property 2: Agent Type Routing
  it('should route to correct agent for any valid type', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('explore', 'plan', 'build'),
        (type) => {
          const agent = getAgentForType(type)
          expect(agent.tools).toEqual(EXPECTED_TOOLS[type])
        }
      ),
      { numRuns: 100 }
    )
  })
})
```

### 单元测试示例

```typescript
// packages/agent/test/subtask/agent-registry.test.ts

describe('Agent Registry', () => {
  // 示例测试：加载自定义 Agent
  it('should load custom agent from markdown file', async () => {
    const registry = createAgentRegistry()
    await registry.loadCustomAgents('.naughty/agents')
    
    const agent = registry.getAgent('security-reviewer')
    expect(agent).toBeDefined()
    expect(agent?.name).toBe('security-reviewer')
    expect(agent?.tools).toContain('read')
  })

  // 边界情况：无效定义
  it('should skip invalid agent definitions', async () => {
    const registry = createAgentRegistry()
    // 创建缺少 name 的定义文件
    await registry.loadCustomAgents('.naughty/agents-invalid')
    
    expect(registry.listAgents()).toHaveLength(0)
  })
})
```

### 测试覆盖目标

| 模块 | 语句覆盖 | 分支覆盖 | 函数覆盖 |
|------|---------|---------|---------|
| task-tool | 85% | 80% | 90% |
| agent-registry | 90% | 85% | 95% |
| concurrency | 85% | 80% | 90% |
| events | 80% | 75% | 85% |
| config | 90% | 85% | 95% |

