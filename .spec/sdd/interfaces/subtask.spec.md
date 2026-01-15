# Interface Spec: SubTask 子任务系统

> 子任务执行的三种模式：API、Workflow、Agent

## 概述

子任务系统提供三种执行模式，适应不同场景：

| 模式 | 控制权 | 灵活性 | 可预测性 | Token 消耗 | 适用场景 |
|------|--------|--------|----------|-----------|---------|
| API | 开发者 | 低 | 高 | 低 | 简单生成、翻译、总结 |
| Workflow | 开发者 | 中 | 高 | 中 | 固定流程、Skills |
| Agent | LLM | 高 | 低 | 高 | 复杂探索、多步任务 |

## Types

```typescript
/**
 * 子任务模式
 */
type SubTaskMode = "api" | "workflow" | "agent"

/**
 * 子任务基础配置
 */
interface SubTaskConfig {
  /** 执行模式 */
  mode: SubTaskMode
  /** 提示词/任务描述 */
  prompt: string
  /** 模型配置（可选，默认继承父任务） */
  model?: {
    provider?: string
    model?: string
    temperature?: number
    maxTokens?: number
  }
  /** 超时时间（毫秒） */
  timeout?: number
  /** 取消信号 */
  abort?: AbortSignal
}

/**
 * API 模式配置
 */
interface APITaskConfig extends SubTaskConfig {
  mode: "api"
  /** 系统提示词 */
  systemPrompt?: string
  /** 输出格式 */
  outputFormat?: "text" | "json"
  /** JSON Schema（outputFormat 为 json 时） */
  schema?: ZodSchema
}

/**
 * Workflow 模式配置
 */
interface WorkflowTaskConfig extends SubTaskConfig {
  mode: "workflow"
  /** 工作流名称 */
  workflow: string
  /** 工作流参数 */
  params?: Record<string, unknown>
}

/**
 * Agent 模式配置
 */
interface AgentTaskConfig extends SubTaskConfig {
  mode: "agent"
  /** Agent 类型 */
  agentType?: "build" | "plan" | "explore"
  /** 可用工具（可选，默认按 agentType） */
  tools?: string[]
  /** 最大步数 */
  maxSteps?: number
}

/**
 * 统一子任务配置
 */
type SubTask = APITaskConfig | WorkflowTaskConfig | AgentTaskConfig

/**
 * 子任务结果
 */
interface SubTaskResult {
  /** 是否成功 */
  success: boolean
  /** 输出内容 */
  output: string
  /** 结构化数据（API json 模式） */
  data?: unknown
  /** 执行的步骤（Workflow/Agent） */
  steps?: SubTaskStep[]
  /** Token 使用 */
  usage: {
    inputTokens: number
    outputTokens: number
  }
  /** 错误信息 */
  error?: string
}

/**
 * 执行步骤
 */
interface SubTaskStep {
  /** 步骤名称 */
  name: string
  /** 输入 */
  input?: unknown
  /** 输出 */
  output?: unknown
  /** 耗时（毫秒） */
  duration: number
}
```

## 1. API 模式

最简单的模式，单次 LLM 调用，无工具。

### 使用场景

- 文本生成、翻译、总结
- 代码解释、注释生成
- 简单问答
- 结构化数据提取

### 接口

```typescript
/**
 * 执行 API 模式子任务
 */
async function runAPITask(config: APITaskConfig): Promise<SubTaskResult>
```

### 示例

```typescript
// 文本生成
const result = await runAPITask({
  mode: "api",
  prompt: "用一句话总结这段代码的功能",
  systemPrompt: "你是一个代码分析专家",
})

// 结构化输出
const result = await runAPITask({
  mode: "api",
  prompt: "提取这段代码中的所有函数名",
  outputFormat: "json",
  schema: z.object({
    functions: z.array(z.string())
  }),
})
```

### 实现要点

1. 单次 `provider.chat()` 调用
2. 无工具注入
3. 支持 JSON 模式（structured output）
4. 最低 Token 消耗

---

## 2. Workflow 模式

预定义流程，开发者控制每一步。

### 使用场景

- Skills（/commit、/pr、/review）
- 固定流程任务
- 需要可预测结果的场景
- 多步骤但步骤固定的任务

### 接口

```typescript
/**
 * 工作流定义
 */
interface WorkflowDefinition {
  /** 工作流名称 */
  name: string
  /** 描述 */
  description: string
  /** 步骤定义 */
  steps: WorkflowStep[]
}

/**
 * 工作流步骤
 */
interface WorkflowStep {
  /** 步骤名称 */
  name: string
  /** 步骤类型 */
  type: "tool" | "llm" | "condition" | "parallel"
  /** 工具调用配置 */
  tool?: {
    name: string
    params: Record<string, unknown> | ((ctx: WorkflowContext) => Record<string, unknown>)
  }
  /** LLM 调用配置 */
  llm?: {
    prompt: string | ((ctx: WorkflowContext) => string)
    outputFormat?: "text" | "json"
    schema?: ZodSchema
  }
  /** 条件分支 */
  condition?: {
    check: (ctx: WorkflowContext) => boolean
    then: string  // 跳转到步骤名
    else?: string
  }
  /** 并行执行 */
  parallel?: string[]  // 并行执行的步骤名
}

/**
 * 工作流上下文
 */
interface WorkflowContext {
  /** 原始参数 */
  params: Record<string, unknown>
  /** 步骤结果 */
  results: Record<string, unknown>
  /** 工作目录 */
  cwd: string
}

/**
 * 执行 Workflow 模式子任务
 */
async function runWorkflowTask(config: WorkflowTaskConfig): Promise<SubTaskResult>

/**
 * 注册工作流
 */
function registerWorkflow(definition: WorkflowDefinition): void
```

### 示例：/commit Skill

```typescript
registerWorkflow({
  name: "commit",
  description: "生成 commit 消息并提交",
  steps: [
    {
      name: "get-diff",
      type: "tool",
      tool: {
        name: "bash",
        params: { command: "git diff --staged" }
      }
    },
    {
      name: "check-empty",
      type: "condition",
      condition: {
        check: (ctx) => ctx.results["get-diff"] !== "",
        then: "generate-message",
        else: "no-changes"
      }
    },
    {
      name: "generate-message",
      type: "llm",
      llm: {
        prompt: (ctx) => `根据以下 diff 生成 commit 消息：\n${ctx.results["get-diff"]}`,
        outputFormat: "json",
        schema: z.object({
          type: z.enum(["feat", "fix", "docs", "refactor", "chore"]),
          scope: z.string().optional(),
          message: z.string()
        })
      }
    },
    {
      name: "commit",
      type: "tool",
      tool: {
        name: "bash",
        params: (ctx) => ({
          command: `git commit -m "${ctx.results["generate-message"].type}: ${ctx.results["generate-message"].message}"`
        })
      }
    },
    {
      name: "no-changes",
      type: "llm",
      llm: {
        prompt: "没有暂存的更改，请先 git add"
      }
    }
  ]
})

// 使用
const result = await runWorkflowTask({
  mode: "workflow",
  prompt: "提交代码",
  workflow: "commit",
})
```

### 实现要点

1. 步骤按顺序执行
2. 支持条件分支
3. 支持并行执行
4. 上下文在步骤间传递
5. 每步可以是工具调用或 LLM 调用

---

## 3. Agent 模式

LLM 自主决策，最灵活但不可预测。

### 使用场景

- 复杂探索任务
- 需要多步推理的任务
- 不确定需要哪些步骤的任务
- 子 Agent 分解

### 接口

```typescript
/**
 * 执行 Agent 模式子任务
 */
async function runAgentTask(config: AgentTaskConfig): Promise<SubTaskResult>
```

### 示例

```typescript
// 代码探索
const result = await runAgentTask({
  mode: "agent",
  prompt: "找到所有处理用户认证的代码，分析其安全性",
  agentType: "explore",
  maxSteps: 20,
})

// 复杂任务
const result = await runAgentTask({
  mode: "agent",
  prompt: "重构这个模块，提取公共逻辑",
  agentType: "build",
  tools: ["read", "write", "edit", "glob", "grep"],
  maxSteps: 50,
})
```

### 实现要点

1. 完整的 Agent Loop
2. 工具自主选择
3. 最大步数限制
4. 可中止
5. 继承或覆盖权限

---

## 统一入口

```typescript
/**
 * 执行子任务（统一入口）
 */
async function runSubTask(config: SubTask): Promise<SubTaskResult> {
  switch (config.mode) {
    case "api":
      return runAPITask(config)
    case "workflow":
      return runWorkflowTask(config)
    case "agent":
      return runAgentTask(config)
  }
}
```

## Task 工具集成

```typescript
// Task 工具支持三种模式
const TaskTool = Tool.define({
  id: "task",
  parameters: z.object({
    mode: z.enum(["api", "workflow", "agent"]).default("agent"),
    prompt: z.string(),
    // API 模式
    outputFormat: z.enum(["text", "json"]).optional(),
    // Workflow 模式
    workflow: z.string().optional(),
    params: z.record(z.unknown()).optional(),
    // Agent 模式
    agentType: z.enum(["build", "plan", "explore"]).optional(),
    maxSteps: z.number().optional(),
  }),

  async execute(params, ctx) {
    const result = await runSubTask({
      mode: params.mode,
      prompt: params.prompt,
      ...params,
    })
    return {
      output: result.output,
      metadata: {
        success: result.success,
        steps: result.steps?.length,
        usage: result.usage,
      }
    }
  }
})
```

## 错误处理

| 错误场景 | 处理方式 |
|---------|---------|
| 超时 | 返回已完成的步骤 + 超时错误 |
| 取消 | 返回已完成的步骤 + 取消标记 |
| 工作流不存在 | 抛出 Error |
| 步骤执行失败 | 根据配置决定继续或中止 |
| Token 超限 | 返回部分结果 + 错误信息 |

## 与现有系统集成

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI / Server                          │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Agent Loop (主)                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    Task 工具                         │    │
│  │                                                      │    │
│  │   mode: "api"      mode: "workflow"   mode: "agent" │    │
│  │       │                  │                  │        │    │
│  │       ▼                  ▼                  ▼        │    │
│  │  ┌─────────┐      ┌───────────┐      ┌─────────┐   │    │
│  │  │ 单次LLM │      │ 预定义流程 │      │ 子Agent │   │    │
│  │  │  调用   │      │   执行    │      │  Loop   │   │    │
│  │  └─────────┘      └───────────┘      └─────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```
