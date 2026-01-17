/**
 * SubTask 子任务系统
 *
 * 提供四种执行模式：
 * - ask_llm: 单次 LLM 调用，无工具（原 api）
 * - run_agent: 独立子 Agent Loop（原 agent）
 * - fork_agent: 继承父会话上下文的子 Agent（新增）
 * - run_workflow: 预定义流程执行（原 workflow）
 */

import type { ZodSchema } from "zod"
import type { Message } from "../session"

// ============================================================================
// Mode Types
// ============================================================================

/**
 * 子任务模式
 * @deprecated 使用新的模式名称
 */
export type SubTaskMode = "api" | "workflow" | "agent" | "ask_llm" | "run_agent" | "fork_agent" | "run_workflow"

/**
 * 新的子任务模式（推荐）
 */
export type SubTaskModeNew = "ask_llm" | "run_agent" | "fork_agent" | "run_workflow"

// ============================================================================
// Token Budget
// ============================================================================

/**
 * Token 预算配置
 */
export interface TokenBudget {
  /** 总预算 */
  total: number
  /** 系统提示预留 */
  system: number
  /** 上下文预留 */
  context: number
  /** 历史消息预留 */
  history: number
  /** 响应预留 */
  response: number
}

/**
 * 默认 Token 预算
 */
export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  total: 128000,
  system: 4000,
  context: 40000,
  history: 60000,
  response: 24000,
}

// ============================================================================
// Context Summary
// ============================================================================

/**
 * 上下文摘要
 */
export interface ContextSummary {
  /** 摘要文本 */
  summary: string
  /** 关键文件列表 */
  keyFiles?: string[]
  /** 关键决策 */
  keyDecisions?: string[]
  /** Token 数量 */
  tokenCount: number
}

/**
 * 消息压缩策略
 */
export type CompressionStrategy = "sliding_window" | "summary" | "importance"

/**
 * 消息压缩配置
 */
export interface CompressionConfig {
  /** 压缩策略 */
  strategy: CompressionStrategy
  /** 滑动窗口大小（sliding_window 策略） */
  windowSize?: number
  /** 保留的重要消息数量 */
  keepImportant?: number
  /** 目标 Token 数量 */
  targetTokens?: number
}

// ============================================================================
// Base Config
// ============================================================================

/**
 * 子任务基础配置
 */
export interface SubTaskBaseConfig {
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
  /** 工作目录 */
  cwd?: string
  /** Token 预算 */
  tokenBudget?: Partial<TokenBudget>
}

// ============================================================================
// ask_llm (原 API) 模式
// ============================================================================

/**
 * ask_llm 模式配置
 */
export interface AskLlmConfig extends SubTaskBaseConfig {
  mode: "ask_llm" | "api"
  /** 系统提示词 */
  systemPrompt?: string
  /** 输出格式 */
  outputFormat?: "text" | "json"
  /** JSON Schema（outputFormat 为 json 时） */
  schema?: ZodSchema
}

/**
 * @deprecated 使用 AskLlmConfig
 */
export type APITaskConfig = AskLlmConfig

// ============================================================================
// run_agent (原 Agent) 模式
// ============================================================================

/**
 * run_agent 模式配置
 */
export interface RunAgentConfig extends SubTaskBaseConfig {
  mode: "run_agent" | "agent"
  /** Agent 类型 */
  agentType?: "build" | "plan" | "explore"
  /** 可用工具（可选，默认按 agentType） */
  tools?: string[]
  /** 最大轮数 */
  maxTurns?: number
  /** @deprecated 使用 maxTurns */
  maxSteps?: number
}

/**
 * @deprecated 使用 RunAgentConfig
 */
export type AgentTaskConfig = RunAgentConfig

// ============================================================================
// fork_agent 模式（新增）
// ============================================================================

/**
 * 上下文继承配置
 */
export interface InheritConfig {
  /** 继承消息：true=全部, number=最近N条, false=不继承 */
  messages?: boolean | number
  /** 继承文件上下文 */
  context?: boolean
  /** 继承工具权限 */
  tools?: boolean
  /** 继承系统提示 */
  systemPrompt?: boolean
}

/**
 * fork_agent 模式配置
 */
export interface ForkAgentConfig extends SubTaskBaseConfig {
  mode: "fork_agent"
  /** 继承父会话的哪些内容 */
  inherit?: InheritConfig
  /** 最大轮数 */
  maxTurns?: number
  /** Agent 类型（可选，默认继承父会话） */
  agentType?: "build" | "plan" | "explore"
  /** 可用工具（可选，默认继承父会话） */
  tools?: string[]
}

/**
 * 父会话上下文（fork_agent 需要）
 */
export interface ParentContext {
  /** 父会话 ID */
  sessionId: string
  /** 父会话消息历史 */
  messages: Message[]
  /** 父会话系统提示 */
  systemPrompt?: string
  /** 父会话工具列表 */
  tools?: string[]
  /** 父会话 Agent 类型 */
  agentType?: "build" | "plan" | "explore"
  /** 文件上下文摘要 */
  contextSummary?: ContextSummary
}

// ============================================================================
// run_workflow (原 Workflow) 模式
// ============================================================================

/**
 * run_workflow 模式配置
 */
export interface RunWorkflowConfig extends SubTaskBaseConfig {
  mode: "run_workflow" | "workflow"
  /** 工作流名称 */
  workflow: string
  /** 工作流参数 */
  params?: Record<string, unknown>
}

/**
 * @deprecated 使用 RunWorkflowConfig
 */
export type WorkflowTaskConfig = RunWorkflowConfig

// ============================================================================
// Unified Config
// ============================================================================

/**
 * 统一子任务配置
 */
export type SubTaskConfig =
  | AskLlmConfig
  | RunAgentConfig
  | ForkAgentConfig
  | RunWorkflowConfig

// ============================================================================
// Execution Types
// ============================================================================

/**
 * 执行步骤
 */
export interface SubTaskStep {
  /** 步骤名称 */
  name: string
  /** 步骤类型 */
  type: "tool" | "llm" | "condition"
  /** 输入 */
  input?: unknown
  /** 输出 */
  output?: unknown
  /** 耗时（毫秒） */
  duration: number
  /** 是否成功 */
  success: boolean
  /** 错误信息 */
  error?: string
}

/**
 * 任务执行状态
 */
export type TaskExecutionStatus = "pending" | "running" | "done" | "error" | "cancelled"

/**
 * 任务执行追踪
 */
export interface TaskExecution {
  /** 任务 ID */
  id: string
  /** 执行模式 */
  mode: SubTaskMode
  /** 执行状态 */
  status: TaskExecutionStatus
  /** 进度（0-100） */
  progress?: number
  /** 执行结果 */
  result?: SubTaskResult
  /** 开始时间 */
  startedAt?: number
  /** 结束时间 */
  endedAt?: number
}

/**
 * 子任务结果
 */
export interface SubTaskResult {
  /** 是否成功 */
  success: boolean
  /** 输出内容 */
  output: string
  /** 结构化数据（ask_llm json 模式） */
  data?: unknown
  /** 执行的步骤（run_workflow/run_agent/fork_agent） */
  steps?: SubTaskStep[]
  /** Token 使用 */
  usage: {
    inputTokens: number
    outputTokens: number
  }
  /** 错误信息 */
  error?: string
  /** 执行时间（毫秒） */
  duration: number
  /** 子会话 ID（fork_agent 模式） */
  childSessionId?: string
}

// ============================================================================
// Workflow Types
// ============================================================================

/**
 * 工作流上下文
 */
export interface WorkflowContext {
  /** 原始参数 */
  params: Record<string, unknown>
  /** 步骤结果 */
  results: Record<string, unknown>
  /** 工作目录 */
  cwd: string
  /** 取消信号 */
  abort?: AbortSignal
}

/**
 * 工作流步骤类型
 */
export type WorkflowStepType = "tool" | "llm" | "condition" | "parallel"

/**
 * 工作流步骤定义
 */
export interface WorkflowStep {
  /** 步骤名称 */
  name: string
  /** 步骤类型 */
  type: WorkflowStepType
  /** 工具调用配置 */
  tool?: {
    name: string
    params: Record<string, unknown> | ((ctx: WorkflowContext) => Record<string, unknown>)
  }
  /** LLM 调用配置 */
  llm?: {
    prompt: string | ((ctx: WorkflowContext) => string)
    systemPrompt?: string
    outputFormat?: "text" | "json"
    schema?: ZodSchema
  }
  /** 条件分支 */
  condition?: {
    check: (ctx: WorkflowContext) => boolean
    then: string  // 跳转到步骤名
    else?: string
  }
  /** 并行执行的步骤名 */
  parallel?: string[]
  /** 是否可选（失败不中断流程） */
  optional?: boolean
}

/**
 * 工作流定义
 */
export interface WorkflowDefinition {
  /** 工作流名称 */
  name: string
  /** 描述 */
  description: string
  /** 步骤定义 */
  steps: WorkflowStep[]
  /** 入口步骤（默认第一个） */
  entryStep?: string
}

// ============================================================================
// Provider Interface (for dependency injection)
// ============================================================================

/**
 * LLM 调用接口（用于依赖注入）
 */
export interface SubTaskProvider {
  /** 单次聊天调用 */
  chat(options: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
    model?: string
    temperature?: number
    maxTokens?: number
  }): Promise<{
    content: string
    usage: { inputTokens: number; outputTokens: number }
  }>

  /** 结构化输出调用 */
  chatWithSchema<T>(options: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
    schema: ZodSchema<T>
    model?: string
    temperature?: number
    maxTokens?: number
  }): Promise<{
    data: T
    usage: { inputTokens: number; outputTokens: number }
  }>
}

/**
 * 工具执行接口（用于依赖注入）
 */
export interface SubTaskToolExecutor {
  /** 执行工具 */
  execute(
    toolName: string,
    params: Record<string, unknown>,
    ctx: { cwd: string }
  ): Promise<{ output: string; error?: string }>
}
