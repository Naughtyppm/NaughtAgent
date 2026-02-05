/**
 * 内置命令类型定义
 *
 * 定义 Builtin Layer 的处理器类型和上下文接口
 */

import type { ExecutionResult, UnifiedCommand } from '../types.js'

// ============================================================================
// 内置命令上下文
// ============================================================================

/**
 * 应用状态（供内置命令读取和修改）
 */
export interface AppState {
  /** 当前模型 */
  currentModel: string
  /** 权限模式 */
  permissionMode: 'ask' | 'allow' | 'sandbox'
  /** 命令历史 */
  commandHistory: string[]
  /** 对话历史 */
  conversationHistory: unknown[]
  /** 工作目录 */
  cwd: string
}

/**
 * 内置命令执行上下文
 *
 * 提供内置命令执行所需的环境和回调
 */
export interface BuiltinContext {
  /** 获取应用状态 */
  getState: () => AppState
  /** 更新应用状态 */
  setState: (updates: Partial<AppState>) => void
  /** 添加消息 */
  addMessage: (type: 'info' | 'error' | 'warning', message: string) => void
  /** 获取统一注册表（用于 /help 等命令） */
  getRegistry?: () => { getAll: () => UnifiedCommand[] }
  /** 重新加载命令源（用于 /refresh） */
  reloadRegistry?: () => Promise<void>
  /** 失效索引缓存（用于 /refresh --index） */
  invalidateIndexCache?: () => Promise<void>
}

// ============================================================================
// 内置命令处理器
// ============================================================================

/**
 * 内置命令处理器函数类型
 *
 * @param args - 位置参数数组
 * @param namedArgs - 命名参数对象
 * @param context - 执行上下文
 * @returns 执行结果（同步或异步）
 *
 * @example
 * ```typescript
 * const helpHandler: BuiltinHandler = (args, namedArgs, context) => {
 *   const commands = context.getRegistry?.()?.getAll() ?? []
 *   return {
 *     success: true,
 *     output: formatCommands(commands),
 *     duration: 0,
 *     layer: 'builtin',
 *   }
 * }
 * ```
 */
export type BuiltinHandler = (
  args: string[],
  namedArgs: Record<string, string>,
  context: BuiltinContext
) => ExecutionResult | Promise<ExecutionResult>

// ============================================================================
// 内置命令定义
// ============================================================================

/**
 * 内置命令定义
 *
 * 包含命令元数据和处理器
 */
export interface BuiltinCommandDefinition {
  /** 命令名称（不含 /） */
  name: string
  /** 描述 */
  description: string
  /** 别名 */
  aliases?: string[]
  /** 参数定义 */
  parameters?: Array<{
    name: string
    description?: string
    required: boolean
    defaultValue?: string
  }>
  /** 处理器函数 */
  handler: BuiltinHandler
}
