/**
 * 子 Agent 错误类型定义
 *
 * 提供结构化的错误类型，用于子 Agent 执行过程中的错误处理。
 * 每个错误包含类型、消息和上下文信息，便于调试和错误恢复。
 *
 * @module subtask/errors
 * @see Requirements 7.1: 结构化错误返回
 */

// ============================================================================
// Error Type Enum
// ============================================================================

/**
 * 子 Agent 错误类型枚举
 *
 * 定义所有可能的错误类型，用于分类和处理不同的错误场景。
 */
export enum SubAgentErrorType {
  /** 配置错误 - 配置文件无效或缺少必要配置 */
  CONFIG_ERROR = "CONFIG_ERROR",

  /** Agent 未找到 - 请求的自定义 Agent 不存在 */
  AGENT_NOT_FOUND = "AGENT_NOT_FOUND",

  /** 执行超时 - 子 Agent 执行超过配置的超时时间 */
  TIMEOUT = "TIMEOUT",

  /** 用户取消 - 用户通过 Ctrl+C 或其他方式取消执行 */
  ABORTED = "ABORTED",

  /** LLM 调用失败 - API 调用错误、网络问题等 */
  LLM_ERROR = "LLM_ERROR",

  /** 工具执行失败 - 工具调用过程中发生错误 */
  TOOL_ERROR = "TOOL_ERROR",

  /** 并发限制 - 超过最大并发数限制 */
  CONCURRENCY_ERROR = "CONCURRENCY_ERROR",

  /** 重试耗尽 - 所有重试尝试都失败 */
  RETRY_EXHAUSTED = "RETRY_EXHAUSTED",
}

// ============================================================================
// Error Context Interface
// ============================================================================

/**
 * 错误上下文信息
 *
 * 提供错误发生时的详细上下文，便于调试和问题定位。
 */
export interface SubAgentErrorContext {
  /** 子 Agent ID */
  agentId?: string

  /** Agent 类型（explore/plan/build/custom） */
  agentType?: string

  /** 发生错误时的步骤编号 */
  step?: number

  /** 导致错误的工具名称（TOOL_ERROR 时） */
  toolName?: string

  /** 执行持续时间（毫秒） */
  duration?: number

  /** 重试次数（RETRY_EXHAUSTED 时） */
  retryCount?: number

  /** 超时配置（毫秒，TIMEOUT 时） */
  timeoutMs?: number

  /** 最大并发数（CONCURRENCY_ERROR 时） */
  maxConcurrency?: number

  /** 当前并发数（CONCURRENCY_ERROR 时） */
  currentConcurrency?: number

  /** 自定义 Agent 名称（AGENT_NOT_FOUND 时） */
  customAgentName?: string

  /** 配置文件路径（CONFIG_ERROR 时） */
  configPath?: string

  /** 部分结果（ABORTED/TIMEOUT 时可能有） */
  partialOutput?: string

  /** 已完成的步骤数 */
  completedSteps?: number

  /** 额外的元数据 */
  metadata?: Record<string, unknown>
}

// ============================================================================
// Error Interface
// ============================================================================

/**
 * 子 Agent 结构化错误
 *
 * 统一的错误格式，包含类型、消息、上下文和原始错误。
 * 满足 Requirements 7.1: 结构化错误返回。
 */
export interface SubAgentError {
  /** 错误类型 */
  type: SubAgentErrorType

  /** 人类可读的错误消息 */
  message: string

  /** 错误上下文信息 */
  context: SubAgentErrorContext

  /** 原始错误（如果有） */
  cause?: Error
}

// ============================================================================
// Error Class
// ============================================================================

/**
 * 子 Agent 错误类
 *
 * 继承自 Error，提供结构化的错误信息。
 * 可以直接 throw，也可以作为普通对象使用。
 */
export class SubAgentErrorClass extends Error implements SubAgentError {
  /** 错误类型 */
  readonly type: SubAgentErrorType

  /** 错误上下文 */
  readonly context: SubAgentErrorContext

  /** 原始错误 */
  readonly cause?: Error

  constructor(
    type: SubAgentErrorType,
    message: string,
    context: SubAgentErrorContext = {},
    cause?: Error
  ) {
    super(message)
    this.name = "SubAgentError"
    this.type = type
    this.context = context
    this.cause = cause

    // 保持原型链
    Object.setPrototypeOf(this, SubAgentErrorClass.prototype)
  }

  /**
   * 转换为普通对象
   */
  toJSON(): SubAgentError {
    return {
      type: this.type,
      message: this.message,
      context: this.context,
      cause: this.cause,
    }
  }

  /**
   * 获取完整的错误描述
   */
  getFullMessage(): string {
    const parts = [`[${this.type}] ${this.message}`]

    if (this.context.agentId) {
      parts.push(`Agent: ${this.context.agentId}`)
    }
    if (this.context.step !== undefined) {
      parts.push(`Step: ${this.context.step}`)
    }
    if (this.context.toolName) {
      parts.push(`Tool: ${this.context.toolName}`)
    }
    if (this.context.duration !== undefined) {
      parts.push(`Duration: ${this.context.duration}ms`)
    }
    if (this.cause) {
      parts.push(`Cause: ${this.cause.message}`)
    }

    return parts.join(" | ")
  }
}

// ============================================================================
// Error Factory Functions
// ============================================================================

/**
 * 创建配置错误
 */
export function createConfigError(
  message: string,
  context: Partial<SubAgentErrorContext> = {},
  cause?: Error
): SubAgentError {
  return {
    type: SubAgentErrorType.CONFIG_ERROR,
    message,
    context,
    cause,
  }
}

/**
 * 创建 Agent 未找到错误
 */
export function createAgentNotFoundError(
  agentName: string,
  availableAgents?: string[]
): SubAgentError {
  const message = availableAgents?.length
    ? `Agent "${agentName}" not found. Available agents: ${availableAgents.join(", ")}`
    : `Agent "${agentName}" not found`

  return {
    type: SubAgentErrorType.AGENT_NOT_FOUND,
    message,
    context: {
      customAgentName: agentName,
      metadata: availableAgents ? { availableAgents } : undefined,
    },
  }
}

/**
 * 创建超时错误
 */
export function createTimeoutError(
  timeoutMs: number,
  context: Partial<SubAgentErrorContext> = {}
): SubAgentError {
  return {
    type: SubAgentErrorType.TIMEOUT,
    message: `Execution timed out after ${timeoutMs}ms`,
    context: {
      ...context,
      timeoutMs,
    },
  }
}

/**
 * 创建取消错误
 */
export function createAbortedError(
  context: Partial<SubAgentErrorContext> = {}
): SubAgentError {
  return {
    type: SubAgentErrorType.ABORTED,
    message: "Execution was aborted by user",
    context,
  }
}

/**
 * 创建 LLM 错误
 */
export function createLLMError(
  message: string,
  context: Partial<SubAgentErrorContext> = {},
  cause?: Error
): SubAgentError {
  return {
    type: SubAgentErrorType.LLM_ERROR,
    message,
    context,
    cause,
  }
}

/**
 * 创建工具错误
 */
export function createToolError(
  toolName: string,
  message: string,
  context: Partial<SubAgentErrorContext> = {},
  cause?: Error
): SubAgentError {
  return {
    type: SubAgentErrorType.TOOL_ERROR,
    message: `Tool "${toolName}" failed: ${message}`,
    context: {
      ...context,
      toolName,
    },
    cause,
  }
}

/**
 * 创建并发错误
 */
export function createConcurrencyError(
  maxConcurrency: number,
  currentConcurrency: number
): SubAgentError {
  return {
    type: SubAgentErrorType.CONCURRENCY_ERROR,
    message: `Concurrency limit exceeded: ${currentConcurrency}/${maxConcurrency}`,
    context: {
      maxConcurrency,
      currentConcurrency,
    },
  }
}

/**
 * 创建重试耗尽错误
 */
export function createRetryExhaustedError(
  retryCount: number,
  lastError: string,
  context: Partial<SubAgentErrorContext> = {},
  cause?: Error
): SubAgentError {
  return {
    type: SubAgentErrorType.RETRY_EXHAUSTED,
    message: `All ${retryCount} retry attempts failed. Last error: ${lastError}`,
    context: {
      ...context,
      retryCount,
    },
    cause,
  }
}

// ============================================================================
// Error Type Guards
// ============================================================================

/**
 * 检查是否为 SubAgentError
 */
export function isSubAgentError(error: unknown): error is SubAgentError {
  if (!error || typeof error !== "object") {
    return false
  }

  const e = error as Record<string, unknown>
  return (
    typeof e.type === "string" &&
    Object.values(SubAgentErrorType).includes(e.type as SubAgentErrorType) &&
    typeof e.message === "string" &&
    typeof e.context === "object"
  )
}

/**
 * 检查是否为 SubAgentErrorClass 实例
 */
export function isSubAgentErrorClass(error: unknown): error is SubAgentErrorClass {
  return error instanceof SubAgentErrorClass
}

/**
 * 检查错误是否为特定类型
 */
export function isErrorType(
  error: unknown,
  type: SubAgentErrorType
): error is SubAgentError {
  return isSubAgentError(error) && error.type === type
}

/**
 * 检查是否为可重试的错误类型
 */
export function isRetryableErrorType(error: SubAgentError): boolean {
  const retryableTypes: SubAgentErrorType[] = [
    SubAgentErrorType.LLM_ERROR,
    SubAgentErrorType.TIMEOUT,
    SubAgentErrorType.CONCURRENCY_ERROR,
  ]
  return retryableTypes.includes(error.type)
}

/**
 * 检查是否为用户取消的错误
 */
export function isUserCancelledError(error: SubAgentError): boolean {
  return error.type === SubAgentErrorType.ABORTED
}

/**
 * 检查是否为配置相关的错误
 */
export function isConfigRelatedError(error: SubAgentError): boolean {
  return (
    error.type === SubAgentErrorType.CONFIG_ERROR ||
    error.type === SubAgentErrorType.AGENT_NOT_FOUND
  )
}

// ============================================================================
// Error Conversion Utilities
// ============================================================================

/**
 * 将普通 Error 转换为 SubAgentError
 */
export function fromError(
  error: Error,
  defaultType: SubAgentErrorType = SubAgentErrorType.LLM_ERROR,
  context: Partial<SubAgentErrorContext> = {}
): SubAgentError {
  // 如果已经是 SubAgentError，直接返回
  if (isSubAgentError(error)) {
    return error
  }

  // 如果是 SubAgentErrorClass，转换为普通对象
  if (isSubAgentErrorClass(error)) {
    return error.toJSON()
  }

  // 根据错误消息推断类型
  const inferredType = inferErrorType(error.message)

  return {
    type: inferredType ?? defaultType,
    message: error.message,
    context,
    cause: error,
  }
}

/**
 * 根据错误消息推断错误类型
 */
export function inferErrorType(message: string): SubAgentErrorType | null {
  const lowerMessage = message.toLowerCase()

  if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
    return SubAgentErrorType.TIMEOUT
  }

  if (lowerMessage.includes("abort") || lowerMessage.includes("cancel")) {
    return SubAgentErrorType.ABORTED
  }

  if (
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("429") ||
    lowerMessage.includes("overloaded") ||
    lowerMessage.includes("api error") ||
    lowerMessage.includes("network")
  ) {
    return SubAgentErrorType.LLM_ERROR
  }

  if (lowerMessage.includes("not found") && lowerMessage.includes("agent")) {
    return SubAgentErrorType.AGENT_NOT_FOUND
  }

  if (lowerMessage.includes("config") || lowerMessage.includes("invalid")) {
    return SubAgentErrorType.CONFIG_ERROR
  }

  if (lowerMessage.includes("concurrency") || lowerMessage.includes("limit")) {
    return SubAgentErrorType.CONCURRENCY_ERROR
  }

  if (lowerMessage.includes("retry") && lowerMessage.includes("exhaust")) {
    return SubAgentErrorType.RETRY_EXHAUSTED
  }

  return null
}

/**
 * 将 SubAgentError 转换为 SubAgentErrorClass
 */
export function toErrorClass(error: SubAgentError): SubAgentErrorClass {
  if (isSubAgentErrorClass(error)) {
    return error
  }

  return new SubAgentErrorClass(
    error.type,
    error.message,
    error.context,
    error.cause
  )
}

// ============================================================================
// Error Formatting
// ============================================================================

/**
 * 格式化错误为用户友好的消息
 */
export function formatErrorMessage(error: SubAgentError): string {
  switch (error.type) {
    case SubAgentErrorType.CONFIG_ERROR:
      return `配置错误: ${error.message}`

    case SubAgentErrorType.AGENT_NOT_FOUND:
      return `Agent 未找到: ${error.context.customAgentName || "unknown"}`

    case SubAgentErrorType.TIMEOUT:
      return `执行超时 (${error.context.timeoutMs || "unknown"}ms): ${error.message}`

    case SubAgentErrorType.ABORTED:
      return `执行已取消${error.context.completedSteps ? ` (已完成 ${error.context.completedSteps} 步)` : ""}`

    case SubAgentErrorType.LLM_ERROR:
      return `LLM 调用失败: ${error.message}`

    case SubAgentErrorType.TOOL_ERROR:
      return `工具执行失败 [${error.context.toolName || "unknown"}]: ${error.message}`

    case SubAgentErrorType.CONCURRENCY_ERROR:
      return `并发限制: ${error.context.currentConcurrency}/${error.context.maxConcurrency}`

    case SubAgentErrorType.RETRY_EXHAUSTED:
      return `重试耗尽 (${error.context.retryCount} 次): ${error.message}`

    default:
      return error.message
  }
}

/**
 * 获取错误类型的中文描述
 */
export function getErrorTypeDescription(type: SubAgentErrorType): string {
  const descriptions: Record<SubAgentErrorType, string> = {
    [SubAgentErrorType.CONFIG_ERROR]: "配置错误",
    [SubAgentErrorType.AGENT_NOT_FOUND]: "Agent 未找到",
    [SubAgentErrorType.TIMEOUT]: "执行超时",
    [SubAgentErrorType.ABORTED]: "用户取消",
    [SubAgentErrorType.LLM_ERROR]: "LLM 调用失败",
    [SubAgentErrorType.TOOL_ERROR]: "工具执行失败",
    [SubAgentErrorType.CONCURRENCY_ERROR]: "并发限制",
    [SubAgentErrorType.RETRY_EXHAUSTED]: "重试耗尽",
  }
  return descriptions[type] || type
}
