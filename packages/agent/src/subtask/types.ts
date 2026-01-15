/**
 * SubTask 子任务系统
 *
 * 提供三种执行模式：
 * - API: 单次 LLM 调用，无工具
 * - Workflow: 预定义流程执行
 * - Agent: 子 Agent Loop
 */

import { z, type ZodSchema } from "zod"

// ============================================================================
// Types
// ============================================================================

/**
 * 子任务模式
 */
export type SubTaskMode = "api" | "workflow" | "agent"

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
}

/**
 * API 模式配置
 */
export interface APITaskConfig extends SubTaskBaseConfig {
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
export interface WorkflowTaskConfig extends SubTaskBaseConfig {
  mode: "workflow"
  /** 工作流名称 */
  workflow: string
  /** 工作流参数 */
  params?: Record<string, unknown>
}

/**
 * Agent 模式配置
 */
export interface AgentTaskConfig extends SubTaskBaseConfig {
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
export type SubTaskConfig = APITaskConfig | WorkflowTaskConfig | AgentTaskConfig

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
 * 子任务结果
 */
export interface SubTaskResult {
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
  /** 执行时间（毫秒） */
  duration: number
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
