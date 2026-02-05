import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"
import { AgentError, ErrorCode } from "../error"
import { createLogger, LogLevel } from "../logging/logger.js"

/**
 * 工具执行日志器
 */
const toolLogger = createLogger("tool", { minLevel: LogLevel.DEBUG })

/**
 * 工具超时配置（毫秒）
 */
export const TOOL_TIMEOUTS: Record<string, number> = {
  read: 5_000,      // 5 秒
  write: 10_000,    // 10 秒
  edit: 10_000,     // 10 秒
  grep: 15_000,     // 15 秒
  bash: 60_000,     // 60 秒
  glob: 10_000,     // 10 秒
}

/**
 * 默认超时时间（毫秒）
 */
export const DEFAULT_TIMEOUT = 30_000 // 30 秒

/**
 * 获取工具的超时时间
 *
 * @param toolId - 工具 ID
 * @returns 超时时间（毫秒）
 */
export function getToolTimeout(toolId: string): number {
  return TOOL_TIMEOUTS[toolId] ?? DEFAULT_TIMEOUT
}

/**
 * Tool 工具系统核心定义
 */
export namespace Tool {
  // ===== 错误处理类型 =====

  /**
   * 字段级验证错误信息
   */
  export interface FieldError {
    /** 字段路径（如 "user.name" 或 "items[0].id"） */
    path: string
    /** 错误消息 */
    message: string
    /** 错误码（Zod 错误码） */
    code: string
    /** 期望的类型（如果适用） */
    expected?: string
    /** 实际接收的类型（如果适用） */
    received?: string
  }

  /**
   * 验证错误详情
   */
  export interface ValidationErrorDetails {
    /** 工具 ID */
    tool: string
    /** 字段级错误列表 */
    fieldErrors: FieldError[]
    /** 原始 Zod 错误 */
    zodErrors: z.ZodIssue[]
  }

  /**
   * 工具执行错误类型
   */
  export type ToolErrorType =
    | "ValidationError"
    | "ConnectionError"
    | "ToolExecutionError"
    | "PermissionError"
    | "TimeoutError"

  /**
   * 工具执行上下文
   */
  export interface Context {
    /** 会话 ID */
    sessionID: string
    /** 当前工作目录 */
    cwd: string
    /** 取消信号 */
    abort: AbortSignal
  }

  /**
   * 工具执行结果
   */
  export interface Result {
    /** 显示标题 */
    title: string
    /** 主要输出内容 */
    output: string
    /** 是否为错误结果（可选） */
    isError?: boolean
    /** 元数据（可选） */
    metadata?: Record<string, unknown>
  }

  /**
   * JSON Schema 类型定义
   * 符合 JSON Schema Draft 7 规范
   */
  export interface JsonSchema {
    type?: string | string[]
    description?: string
    properties?: Record<string, JsonSchema>
    required?: string[]
    items?: JsonSchema
    enum?: unknown[]
    default?: unknown
    /** 允许其他 JSON Schema 字段 */
    [key: string]: unknown
  }

  /**
   * Schema 缓存
   * 使用 WeakMap 避免内存泄漏（当 Zod schema 被垃圾回收时，缓存也会被清理）
   */
  const schemaCache = new WeakMap<z.ZodType, JsonSchema>()

  // ===== 错误处理辅助函数 =====

  /**
   * 格式化 Zod 错误为字段级错误
   *
   * @param zodError - Zod 验证错误
   * @returns 字段级错误列表
   */
  export function formatZodErrors(zodError: z.ZodError): FieldError[] {
    return zodError.errors.map((issue) => {
      const path = issue.path
        .map((p, i) => {
          if (typeof p === "number") {
            return `[${p}]`
          }
          return i === 0 ? p : `.${p}`
        })
        .join("")

      const fieldError: FieldError = {
        path: path || "(root)",
        message: issue.message,
        code: issue.code,
      }

      // 添加类型信息（如果是类型错误）
      if (issue.code === "invalid_type") {
        const typeIssue = issue as z.ZodInvalidTypeIssue
        fieldError.expected = typeIssue.expected
        fieldError.received = typeIssue.received
      }

      return fieldError
    })
  }

  /**
   * 格式化验证错误消息
   *
   * @param toolId - 工具 ID
   * @param fieldErrors - 字段级错误列表
   * @returns 格式化的错误消息
   */
  export function formatValidationErrorMessage(
    toolId: string,
    fieldErrors: FieldError[]
  ): string {
    if (fieldErrors.length === 0) {
      return `Tool "${toolId}": Invalid parameters`
    }

    if (fieldErrors.length === 1) {
      const err = fieldErrors[0]
      return `Tool "${toolId}": Parameter "${err.path}" ${err.message.toLowerCase()}`
    }

    const details = fieldErrors
      .slice(0, 3) // 最多显示 3 个错误
      .map((err) => `"${err.path}": ${err.message}`)
      .join("; ")

    const suffix =
      fieldErrors.length > 3
        ? ` (and ${fieldErrors.length - 3} more errors)`
        : ""

    return `Tool "${toolId}": Invalid parameters - ${details}${suffix}`
  }

  /**
   * 创建验证错误
   *
   * @param toolId - 工具 ID
   * @param zodError - Zod 验证错误
   * @returns AgentError 实例
   */
  export function createValidationError(
    toolId: string,
    zodError: z.ZodError
  ): AgentError {
    const fieldErrors = formatZodErrors(zodError)
    const message = formatValidationErrorMessage(toolId, fieldErrors)

    const details: ValidationErrorDetails = {
      tool: toolId,
      fieldErrors,
      zodErrors: zodError.errors,
    }

    return new AgentError(message, ErrorCode.INVALID_REQUEST, false, details as unknown as Record<string, unknown>)
  }

  /**
   * 检测错误类型
   *
   * @param error - 原始错误
   * @returns 错误类型
   */
  export function detectErrorType(error: unknown): ToolErrorType {
    if (error instanceof z.ZodError) {
      return "ValidationError"
    }

    const errorMessage =
      error instanceof Error ? error.message : String(error)
    const errorName = error instanceof Error ? error.name : ""

    // 权限错误
    if (
      errorMessage.includes("permission") ||
      errorMessage.includes("EACCES") ||
      errorMessage.includes("EPERM") ||
      errorName === "PermissionError"
    ) {
      return "PermissionError"
    }

    // 连接错误
    if (
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("ECONNRESET") ||
      errorMessage.includes("ENOTFOUND") ||
      errorMessage.includes("ETIMEDOUT") ||
      errorMessage.includes("connection") ||
      errorName === "ConnectionError"
    ) {
      return "ConnectionError"
    }

    // 超时错误
    if (
      errorMessage.includes("timeout") ||
      errorMessage.includes("TIMEOUT") ||
      errorMessage.includes("timed out") ||
      errorMessage.includes("ETIMEDOUT") ||
      errorName === "TimeoutError"
    ) {
      return "TimeoutError"
    }

    return "ToolExecutionError"
  }

  /**
   * 获取错误类型对应的错误码
   *
   * @param errorType - 错误类型
   * @returns 错误码
   */
  export function getErrorCodeForType(errorType: ToolErrorType): ErrorCode {
    switch (errorType) {
      case "ValidationError":
        return ErrorCode.INVALID_REQUEST
      case "ConnectionError":
        return ErrorCode.NETWORK_ERROR
      case "PermissionError":
        return ErrorCode.PERMISSION_DENIED
      case "TimeoutError":
        return ErrorCode.TIMEOUT
      case "ToolExecutionError":
      default:
        return ErrorCode.TOOL_EXECUTION_ERROR
    }
  }

  /**
   * 判断错误是否可恢复
   *
   * @param errorType - 错误类型
   * @returns 是否可恢复
   */
  export function isRecoverableError(errorType: ToolErrorType): boolean {
    switch (errorType) {
      case "ValidationError":
        return false // 参数错误需要修正，不可自动恢复
      case "PermissionError":
        return false // 权限错误需要用户干预
      case "ConnectionError":
        return true // 连接错误可以重试
      case "TimeoutError":
        return true // 超时可以重试
      case "ToolExecutionError":
        return true // 执行错误可能是临时的
      default:
        return true
    }
  }

  /**
   * 统一的工具执行错误处理
   *
   * 将各种错误转换为 AgentError，并进行分类：
   * - ValidationError: 参数验证失败 (INVALID_REQUEST)
   * - ConnectionError: 连接失败 (NETWORK_ERROR)
   * - ToolExecutionError: 执行失败 (TOOL_EXECUTION_ERROR)
   * - PermissionError: 权限不足 (PERMISSION_DENIED)
   * - TimeoutError: 超时 (TIMEOUT)
   *
   * @param error - 原始错误
   * @param toolId - 工具 ID
   * @returns AgentError 实例
   */
  export function executeToolWithErrorHandling(
    error: unknown,
    toolId: string
  ): AgentError {
    // 如果已经是 AgentError，直接返回
    if (error instanceof AgentError) {
      return error
    }

    // Zod 验证错误 - 使用专门的处理函数
    if (error instanceof z.ZodError) {
      return createValidationError(toolId, error)
    }

    // 检测错误类型
    const errorType = detectErrorType(error)
    const errorCode = getErrorCodeForType(errorType)
    const recoverable = isRecoverableError(errorType)

    // 获取错误消息
    const errorMessage =
      error instanceof Error ? error.message : String(error)

    // 构建上下文
    const context: Record<string, unknown> = {
      tool: toolId,
      errorType,
    }

    // 保留原始错误信息（用于调试）
    if (error instanceof Error) {
      context.originalError = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    } else {
      context.originalError = error
    }

    return new AgentError(errorMessage, errorCode, recoverable, context)
  }

  /**
   * 工具定义
   */
  export interface Definition<TParams = unknown> {
    /** 工具 ID */
    id: string
    /** 工具描述（给 LLM 看） */
    description: string
    /** 参数 Schema（Zod） */
    parameters: z.ZodType<TParams>
    /** 执行函数 */
    execute(params: TParams, ctx: Context): Promise<Result>

    // ===== MCP 对齐字段（可选） =====

    /** 输入 JSON Schema（从 Zod 自动生成） */
    inputSchema?: JsonSchema
    /** 输出 JSON Schema（可选） */
    outputSchema?: JsonSchema
    /** 显示标题（可选，默认使用 id） */
    title?: string
    /** 图标（可选） */
    icons?: {
      light?: string
      dark?: string
    }
    /** 工具来源（内置 | MCP | 自定义） */
    source?: "builtin" | "mcp" | "custom"
    /** MCP 服务器名称（仅 MCP 工具） */
    mcpServer?: string

    // ===== 内部字段 =====

    /**
     * 内部标记：是否经过 Tool.define() 处理
     * @internal
     */
    _defined?: boolean
  }

  /**
   * 工具定义选项
   */
  export interface DefineOptions {
    /** 自定义超时时间（毫秒），覆盖默认配置 */
    timeout?: number
    /** 是否启用日志记录，默认 true */
    enableLogging?: boolean
    /** 是否启用超时控制，默认 true */
    enableTimeout?: boolean
  }

  /**
   * 定义一个工具
   *
   * 自动生成 inputSchema（从 Zod schema）
   * 设置默认值：source: "builtin"、title: id
   * 添加超时控制和结构化日志
   */
  export function define<TParams>(
    definition: Definition<TParams>,
    options: DefineOptions = {}
  ): Definition<TParams> {
    const {
      timeout = getToolTimeout(definition.id),
      enableLogging = true,
      enableTimeout = true,
    } = options

    // 从 Zod schema 生成 JSON Schema（使用缓存）
    const generatedInputSchema = getOrGenerateSchema(definition.parameters)

    return {
      // 设置默认值
      source: "builtin",
      title: definition.id,
      // 自动生成的 inputSchema（作为默认值）
      inputSchema: generatedInputSchema,
      // 用户提供的定义（可以覆盖默认值，包括 inputSchema）
      ...definition,
      // 标记为已经过 Tool.define() 处理
      _defined: true,
      // 包装执行函数以添加超时控制、日志和错误处理
      execute: async (params, ctx) => {
        const startTime = Date.now()
        const toolId = definition.id

        // 清理参数中的敏感信息用于日志
        const sanitizedParams = sanitizeParams(params)

        // 记录执行开始
        if (enableLogging) {
          toolLogger.debug(`Tool '${toolId}' execution started`, {
            toolId,
            params: sanitizedParams,
            timeout: enableTimeout ? timeout : "disabled",
          })
        }

        try {
          // 参数验证
          const parsed = definition.parameters.parse(params)

          // 执行工具（带超时控制）
          let result: Result
          if (enableTimeout) {
            result = await withTimeout(
              definition.execute(parsed, ctx),
              timeout,
              toolId
            )
          } else {
            result = await definition.execute(parsed, ctx)
          }

          // 记录执行成功
          if (enableLogging) {
            const duration = Date.now() - startTime
            toolLogger.debug(`Tool '${toolId}' execution completed`, {
              toolId,
              duration,
              success: true,
            })
          }

          return result
        } catch (error) {
          const duration = Date.now() - startTime
          const isTimeout = error instanceof TimeoutError

          // 记录执行失败
          if (enableLogging) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            const errorCode = error instanceof AgentError ? error.code : ErrorCode.TOOL_EXECUTION_ERROR
            
            // 对于验证错误，使用 debug 级别而非 error 级别
            const isValidationError = error instanceof z.ZodError || 
              (error instanceof AgentError && error.code === ErrorCode.INVALID_REQUEST)
            
            const logLevel = isValidationError ? 'debug' : 'error'
            const logMessage = `Tool '${toolId}' execution failed`
            
            if (logLevel === 'debug') {
              toolLogger.debug(logMessage, {
                toolId,
                duration,
                timedOut: isTimeout,
                error: errorMessage,
                errorCode,
              })
            } else {
              toolLogger.error(logMessage, {
                toolId,
                duration,
                timedOut: isTimeout,
                error: errorMessage,
                errorCode,
              })
            }
          }

          // 使用统一的错误处理函数
          throw executeToolWithErrorHandling(error, definition.id)
        }
      },
    }
  }

  /**
   * 超时错误
   *
   * 当工具执行超过配置的超时时间时抛出
   */
  export class TimeoutError extends AgentError {
    constructor(toolId: string, timeout: number) {
      super(
        `Tool '${toolId}' execution timed out after ${timeout}ms`,
        ErrorCode.TIMEOUT,
        true,
        { toolId, timeout }
      )
      this.name = "TimeoutError"
    }
  }

  /**
   * 带超时的 Promise 执行
   *
   * @param promise - 要执行的 Promise
   * @param timeout - 超时时间（毫秒）
   * @param toolId - 工具 ID（用于错误信息）
   * @returns Promise 结果
   * @throws TimeoutError 如果超时
   */
  async function withTimeout<T>(
    promise: Promise<T>,
    timeout: number,
    toolId: string
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new TimeoutError(toolId, timeout))
      }, timeout)
    })

    try {
      const result = await Promise.race([promise, timeoutPromise])
      return result
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
    }
  }

  /**
   * 清理参数中的敏感信息
   *
   * 用于日志记录时隐藏敏感数据
   */
  function sanitizeParams(params: unknown): unknown {
    if (params === null || params === undefined) {
      return params
    }

    if (typeof params !== "object") {
      return params
    }

    const sanitized: Record<string, unknown> = {}
    const sensitiveKeys = ["password", "token", "secret", "key", "credential", "auth"]

    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase()
      if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
        sanitized[key] = "[REDACTED]"
      } else if (typeof value === "string" && value.length > 1000) {
        // 截断过长的字符串
        sanitized[key] = value.substring(0, 100) + "... (truncated)"
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  /**
   * 获取或生成 JSON Schema（带缓存）
   * 
   * 第一次访问时从 Zod schema 生成并缓存
   * 后续访问返回缓存的实例（引用相等）
   */
  export function getOrGenerateSchema(zodSchema: z.ZodType): JsonSchema {
    // 检查缓存
    const cached = schemaCache.get(zodSchema)
    if (cached) {
      return cached
    }

    // 生成新的 JSON Schema
    const jsonSchema = zodToJsonSchema(zodSchema, {
      $refStrategy: "none",
    }) as JsonSchema

    // 缓存并返回
    schemaCache.set(zodSchema, jsonSchema)
    return jsonSchema
  }

  /**
   * 清空 schema 缓存（测试用）
   * 
   * 注意：由于使用 WeakMap，无法直接清空
   * 此函数仅用于文档目的，实际清空需要让 Zod schema 被垃圾回收
   */
  export function clearSchemaCache(): void {
    // WeakMap 不支持 clear() 方法
    // 缓存会在 Zod schema 被垃圾回收时自动清理
  }

  /**
   * 创建默认上下文
   */
  export function createContext(options: Partial<Context> = {}): Context {
    return {
      sessionID: options.sessionID ?? "default",
      cwd: options.cwd ?? process.cwd(),
      abort: options.abort ?? new AbortController().signal,
    }
  }
}
