/**
 * 命令调度器 (Command Dispatcher)
 *
 * 根据命令层级分发到对应执行器：
 * - builtin → 直接调用 handler（同步）
 * - external → 调用 justfile executor（子进程）
 * - skill → 调用 skill executor（AI 工作流）
 *
 * @module command/dispatcher
 */

import type {
  UnifiedCommand,
  ExecutionResult,
  CommandLayer,
} from './types.js'
import type { BuiltinContext, AppState } from './builtin/types.js'
import type { SkillExecutorRuntime } from '../skill/executor.js'

// ============================================================================
// 调度上下文
// ============================================================================

/**
 * 命令调度上下文
 *
 * 提供命令执行所需的环境和回调
 */
export interface DispatchContext {
  /** 工作目录 */
  cwd: string
  /** 取消信号 */
  abort?: AbortSignal
  /** 添加消息回调 */
  addMessage?: (type: 'info' | 'error' | 'warning', message: string) => void
  /** 获取应用状态 */
  getState?: () => AppState
  /** 更新应用状态 */
  setState?: (updates: Partial<AppState>) => void
  /** 获取统一注册表（用于 /help 等命令） */
  getRegistry?: () => { getAll: () => UnifiedCommand[] }
  /** 重新加载命令源（用于 /refresh） */
  reloadRegistry?: () => Promise<void>
  /** 失效索引缓存（用于 /refresh --index） */
  invalidateIndexCache?: () => Promise<void>
  /** AI 运行时（Skill 执行需要） */
  aiRuntime?: SkillExecutorRuntime
}

// ============================================================================
// 调度器接口
// ============================================================================

/**
 * 命令调度器接口
 */
export interface CommandDispatcher {
  /**
   * 执行命令
   *
   * @param command - 统一命令对象
   * @param args - 位置参数
   * @param namedArgs - 命名参数
   * @param context - 调度上下文
   * @returns 统一执行结果
   */
  dispatch(
    command: UnifiedCommand,
    args: string[],
    namedArgs: Record<string, string>,
    context: DispatchContext
  ): Promise<ExecutionResult>
}


// ============================================================================
// 内置命令执行
// ============================================================================

/**
 * 执行内置命令
 */
async function executeBuiltin(
  command: UnifiedCommand,
  args: string[],
  namedArgs: Record<string, string>,
  context: DispatchContext
): Promise<ExecutionResult> {
  const startTime = Date.now()

  // 动态导入内置命令模块
  const { getBuiltinCommand } = await import('./builtin/index.js')
  const builtinDef = getBuiltinCommand(command.name)

  if (!builtinDef) {
    return {
      success: false,
      output: '',
      error: `内置命令未找到: ${command.name}`,
      duration: Date.now() - startTime,
      layer: 'builtin',
    }
  }

  // 构建内置命令上下文
  const builtinContext: BuiltinContext = {
    getState: context.getState ?? (() => ({
      currentModel: 'claude-sonnet-4-20250514',
      permissionMode: 'ask',
      commandHistory: [],
      conversationHistory: [],
      cwd: context.cwd,
    })),
    setState: context.setState ?? (() => {}),
    addMessage: context.addMessage ?? (() => {}),
    getRegistry: context.getRegistry,
    reloadRegistry: context.reloadRegistry,
    invalidateIndexCache: context.invalidateIndexCache,
  }

  try {
    // 执行处理器（可能是同步或异步）
    const result = await Promise.resolve(
      builtinDef.handler(args, namedArgs, builtinContext)
    )

    return {
      ...result,
      duration: Date.now() - startTime,
      layer: 'builtin',
    }
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
      layer: 'builtin',
    }
  }
}

// ============================================================================
// 外部命令执行
// ============================================================================

/**
 * 执行外部命令（justfile）
 */
async function executeExternal(
  command: UnifiedCommand,
  args: string[],
  _namedArgs: Record<string, string>,
  context: DispatchContext
): Promise<ExecutionResult> {
  const startTime = Date.now()

  // 动态导入 justfile 模块
  const { createCommandExecutor, createCommandRegistry } = await import('../justfile/index.js')

  const executor = createCommandExecutor()

  // 检查 just 是否可用
  const justAvailable = await executor.isJustAvailable()
  if (!justAvailable) {
    return {
      success: false,
      output: '',
      error: 'just 命令不可用，请先安装 just: https://github.com/casey/just',
      duration: Date.now() - startTime,
      layer: 'external',
      exitCode: -1,
    }
  }

  // 获取注册表以查找完整的命令信息
  const registry = createCommandRegistry({
    globalPath: command.sourcePath?.includes('.naughtyagent')
      ? command.sourcePath
      : '',
    projectPath: command.sourcePath?.includes('.naughtyagent')
      ? ''
      : command.sourcePath ?? '',
  })

  await registry.reload()
  const registeredCommand = registry.getCommand(command.name)

  if (!registeredCommand) {
    return {
      success: false,
      output: '',
      error: `外部命令未找到: ${command.name}`,
      duration: Date.now() - startTime,
      layer: 'external',
      exitCode: -1,
    }
  }

  // 执行命令
  const result = await executor.execute(registeredCommand, {
    cwd: context.cwd,
    args,
  })

  return {
    success: result.success,
    output: result.stdout,
    error: result.success ? undefined : result.stderr,
    duration: result.duration,
    layer: 'external',
    exitCode: result.exitCode,
    stderr: result.stderr,
  }
}


// ============================================================================
// 技能命令执行
// ============================================================================

/**
 * 执行技能命令
 */
async function executeSkill(
  command: UnifiedCommand,
  args: string[],
  _namedArgs: Record<string, string>,
  context: DispatchContext
): Promise<ExecutionResult> {
  const startTime = Date.now()

  // 检查 AI 运行时
  if (!context.aiRuntime) {
    return {
      success: false,
      output: '',
      error: 'Skill 执行需要 AI 运行时配置',
      duration: Date.now() - startTime,
      layer: 'skill',
    }
  }

  // 动态导入 skill 模块
  const { executeSkill: runSkill } = await import('../skill/executor.js')

  try {
    const result = await runSkill(
      command.name,
      args,
      {
        cwd: context.cwd,
        abort: context.abort,
      },
      context.aiRuntime
    )

    return {
      success: result.success,
      output: result.output,
      error: result.error,
      duration: result.duration ?? (Date.now() - startTime),
      layer: 'skill',
      steps: result.steps,
      usage: result.usage,
    }
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
      layer: 'skill',
    }
  }
}

// ============================================================================
// 调度器实现
// ============================================================================

/**
 * 层级到执行器的映射
 */
const LAYER_EXECUTORS: Record<
  CommandLayer,
  (
    command: UnifiedCommand,
    args: string[],
    namedArgs: Record<string, string>,
    context: DispatchContext
  ) => Promise<ExecutionResult>
> = {
  builtin: executeBuiltin,
  external: executeExternal,
  skill: executeSkill,
}

/**
 * 创建命令调度器
 *
 * @returns 命令调度器实例
 *
 * @example
 * ```typescript
 * const dispatcher = createCommandDispatcher()
 *
 * const result = await dispatcher.dispatch(
 *   command,
 *   ['arg1', 'arg2'],
 *   { key: 'value' },
 *   { cwd: process.cwd() }
 * )
 * ```
 */
export function createCommandDispatcher(): CommandDispatcher {
  return {
    async dispatch(
      command: UnifiedCommand,
      args: string[],
      namedArgs: Record<string, string>,
      context: DispatchContext
    ): Promise<ExecutionResult> {
      const startTime = Date.now()

      // 检查取消信号
      if (context.abort?.aborted) {
        return {
          success: false,
          output: '',
          error: '命令已取消',
          duration: Date.now() - startTime,
          layer: command.layer,
        }
      }

      // 获取对应层级的执行器
      const executor = LAYER_EXECUTORS[command.layer]

      if (!executor) {
        return {
          success: false,
          output: '',
          error: `未知的命令层级: ${command.layer}`,
          duration: Date.now() - startTime,
          layer: command.layer,
        }
      }

      // 设置取消监听
      let abortHandler: (() => void) | undefined
      let aborted = false

      if (context.abort) {
        abortHandler = () => {
          aborted = true
        }
        context.abort.addEventListener('abort', abortHandler)
      }

      try {
        // 执行命令
        const result = await executor(command, args, namedArgs, context)

        // 如果在执行过程中被取消
        if (aborted) {
          return {
            ...result,
            success: false,
            error: result.error ?? '命令已取消',
          }
        }

        return result
      } finally {
        // 清理取消监听
        if (abortHandler && context.abort) {
          context.abort.removeEventListener('abort', abortHandler)
        }
      }
    },
  }
}

