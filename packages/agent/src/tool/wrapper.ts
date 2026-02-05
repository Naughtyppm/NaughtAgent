/**
 * 工具执行包装器
 *
 * 提供工具执行的超时控制、执行时长记录和结构化日志
 *
 * 注意：核心功能已集成到 Tool.define() 中，此模块提供向后兼容的导出
 *
 * @module tool/wrapper
 */

// 从 tool.ts 导入核心功能
import {
  TOOL_TIMEOUTS,
  DEFAULT_TIMEOUT,
  getToolTimeout,
  Tool,
} from "./tool"
import { AgentError, ErrorCode } from "../error"
import { createLogger, LogLevel } from "../logging/logger.js"

/**
 * 工具执行日志器
 */
const wrapperLogger = createLogger("tool", { minLevel: LogLevel.DEBUG })

// 重新导出
export { TOOL_TIMEOUTS, DEFAULT_TIMEOUT, getToolTimeout, Tool }

// 重新导出 TimeoutError（从 Tool 命名空间）
export const TimeoutError = Tool.TimeoutError

// 类型导出
export type DefineOptions = Tool.DefineOptions

/**
 * 工具执行统计信息
 */
export interface ToolExecutionStats {
  /** 工具 ID */
  toolId: string
  /** 执行开始时间 */
  startTime: Date
  /** 执行结束时间 */
  endTime: Date
  /** 执行时长（毫秒） */
  duration: number
  /** 是否成功 */
  success: boolean
  /** 是否超时 */
  timedOut: boolean
  /** 错误信息（如果失败） */
  error?: string
  /** 错误码（如果失败） */
  errorCode?: string
}

/**
 * 工具执行包装器选项
 *
 * @deprecated 使用 Tool.DefineOptions 代替
 */
export interface WrapperOptions {
  /** 自定义超时时间（毫秒），覆盖默认配置 */
  timeout?: number
  /** 是否启用日志记录，默认 true */
  enableLogging?: boolean
  /** 执行完成回调 */
  onComplete?: (stats: ToolExecutionStats) => void
}

/**
 * 包装工具执行函数
 *
 * @deprecated 使用 Tool.define() 代替，它已内置超时控制和日志功能
 *
 * 添加超时控制、执行时长记录和结构化日志
 *
 * @param toolId - 工具 ID
 * @param execute - 原始执行函数
 * @param options - 包装器选项
 * @returns 包装后的执行函数
 */
export function withToolWrapper<TParams>(
  toolId: string,
  execute: (params: TParams, ctx: Tool.Context) => Promise<Tool.Result>,
  options: WrapperOptions = {}
): (params: TParams, ctx: Tool.Context) => Promise<Tool.Result> {
  const {
    timeout = getToolTimeout(toolId),
    enableLogging = true,
    onComplete,
  } = options

  return async (params: TParams, ctx: Tool.Context): Promise<Tool.Result> => {
    const startTime = new Date()
    let success = false
    let timedOut = false
    let errorMessage: string | undefined
    let errorCode: string | undefined

    // 记录执行开始
    if (enableLogging) {
      wrapperLogger.debug(`Tool '${toolId}' execution started`, {
        toolId,
        params,
        timeout,
      })
    }

    try {
      // 使用超时包装执行
      const result = await withTimeout(
        execute(params, ctx),
        timeout,
        toolId
      )

      success = true

      // 记录执行成功
      if (enableLogging) {
        const duration = Date.now() - startTime.getTime()
        wrapperLogger.debug(`Tool '${toolId}' execution completed`, {
          toolId,
          duration,
          success: true,
        })
      }

      return result
    } catch (error) {
      const duration = Date.now() - startTime.getTime()
      let agentError: AgentError

      // 判断是否为超时错误（通过错误码或类名判断）
      const isTimeoutError = (error instanceof AgentError && error.code === ErrorCode.TIMEOUT) ||
        (error instanceof Error && error.name === 'TimeoutError')
      
      if (isTimeoutError) {
        timedOut = true
        errorMessage = (error as Error).message
        errorCode = ErrorCode.TIMEOUT
        agentError = error instanceof AgentError ? error : new AgentError(
          errorMessage,
          ErrorCode.TIMEOUT,
          true,
          { toolId, timeout }
        )
      } else if (error instanceof AgentError) {
        // 已经是 AgentError，添加 toolId 到 context
        errorMessage = error.message
        errorCode = error.code
        if (!error.context?.toolId) {
          error.context = { ...error.context, toolId }
        }
        agentError = error
      } else if (error instanceof Error) {
        // 普通 Error，转换为 AgentError
        errorMessage = error.message
        errorCode = ErrorCode.TOOL_EXECUTION_ERROR
        agentError = new AgentError(errorMessage, ErrorCode.TOOL_EXECUTION_ERROR, false, { toolId })
      } else {
        // 其他类型错误，转换为 AgentError
        errorMessage = String(error)
        errorCode = ErrorCode.TOOL_EXECUTION_ERROR
        agentError = new AgentError(errorMessage, ErrorCode.TOOL_EXECUTION_ERROR, false, { toolId })
      }

      // 记录执行失败
      if (enableLogging) {
        wrapperLogger.error(`Tool '${toolId}' execution failed`, {
          toolId,
          duration,
          timedOut,
          error: errorMessage,
          errorCode,
        })
      }

      throw agentError
    } finally {
      const endTime = new Date()
      const duration = endTime.getTime() - startTime.getTime()

      // 调用完成回调
      if (onComplete) {
        const stats: ToolExecutionStats = {
          toolId,
          startTime,
          endTime,
          duration,
          success,
          timedOut,
          error: errorMessage,
          errorCode,
        }
        onComplete(stats)
      }
    }
  }
}

/**
 * 带超时的 Promise 执行
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeout: number,
  toolId: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Tool.TimeoutError(toolId, timeout))
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
 * 创建带包装器的工具定义
 *
 * @deprecated 使用 Tool.define() 代替
 *
 * @param definition - 工具定义
 * @param options - 包装器选项
 * @returns 带包装器的工具定义
 */
export function defineWithWrapper<TParams>(
  definition: Tool.Definition<TParams>,
  options: WrapperOptions = {}
): Tool.Definition<TParams> {
  return Tool.define(definition, {
    timeout: options.timeout,
    enableLogging: options.enableLogging,
  })
}
