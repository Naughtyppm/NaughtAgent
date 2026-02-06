/**
 * 命令系统集成模块 (Command System Integration)
 *
 * 负责：
 * - 集成别名解析到路由器
 * - 集成管道/链式解析到调度器
 * - 集成历史记录到命令执行
 *
 * 需求: 5.2, 6.2, 7.1, 8.1
 */

import type { ExecutionResult } from "./types.js"
import type { UnifiedRegistry } from "./registry.js"
import type { CommandRouter } from "./router.js"
import type { CommandDispatcher, DispatchContext } from "./dispatcher.js"
import type { AliasManager } from "./alias.js"
import type { HistoryManager } from "./history-manager.js"
import { hasPipe, executePipeline } from "./pipeline.js"
import { hasChain, executeChain } from "./chain.js"

// ============================================================================
// Types
// ============================================================================

/**
 * 增强路由器配置
 */
export interface EnhancedRouterConfig {
  /** 基础路由器 */
  baseRouter: CommandRouter
  /** 别名管理器 */
  aliasManager: AliasManager
  /** 注册表 */
  registry: UnifiedRegistry
}

/**
 * 增强调度器配置
 */
export interface EnhancedDispatcherConfig {
  /** 基础调度器 */
  baseDispatcher: CommandDispatcher
  /** 路由器 */
  router: CommandRouter
  /** 注册表 */
  registry: UnifiedRegistry
  /** 历史管理器 */
  historyManager?: HistoryManager
}

/**
 * 增强路由器接口
 */
export interface EnhancedRouter extends CommandRouter {
  /** 解析别名后的命令名 */
  resolveAlias(name: string): Promise<string>
}

/**
 * 增强调度器接口
 */
export interface EnhancedDispatcher extends CommandDispatcher {
  /** 执行输入（支持管道和链式） */
  execute(
    input: string,
    context: DispatchContext
  ): Promise<ExecutionResult>
}

// ============================================================================
// Enhanced Router Implementation
// ============================================================================

/**
 * 创建增强路由器
 *
 * 在命令查找前解析别名
 */
export function createEnhancedRouter(config: EnhancedRouterConfig): EnhancedRouter {
  const { baseRouter, aliasManager, registry } = config

  return {
    ...baseRouter,

    async resolveAlias(name: string): Promise<string> {
      const resolved = await aliasManager.resolve(name)
      return resolved ?? name
    },

    route(input: string) {
      // 先用基础路由器解析
      const result = baseRouter.route(input)

      // 如果是命令但未找到，尝试同步解析别名
      // 注意：这里使用同步方法，因为 route 是同步的
      if (result.type === "command" && !result.found && result.commandName) {
        // 同步加载别名缓存
        const aliases = aliasManager.loadSync()
        const alias = aliases.get(result.commandName)

        if (alias) {
          // 解析别名目标命令
          const targetParsed = baseRouter.parseArgs(alias.command)
          const targetCommand = registry.get(targetParsed.name)

          if (targetCommand) {
            return {
              ...result,
              command: targetCommand,
              commandName: targetParsed.name,
              // 合并参数：别名定义的参数 + 用户输入的参数
              args: [...targetParsed.args, ...result.args],
              namedArgs: { ...targetParsed.namedArgs, ...result.namedArgs },
              found: true,
              resolvedFrom: result.commandName, // 记录原始别名
            }
          }
        }
      }

      return result
    },

    isCommand: baseRouter.isCommand.bind(baseRouter),
    parseArgs: baseRouter.parseArgs.bind(baseRouter),
  }
}

// ============================================================================
// Enhanced Dispatcher Implementation
// ============================================================================

/**
 * 创建增强调度器
 *
 * 支持管道和链式执行
 */
export function createEnhancedDispatcher(
  config: EnhancedDispatcherConfig
): EnhancedDispatcher {
  const { baseDispatcher, router, registry, historyManager } = config

  /**
   * 执行单个命令
   */
  async function executeSingle(
    commandStr: string,
    args: string[],
    context: DispatchContext
  ): Promise<{ success: boolean; output: string; error?: string }> {
    // 解析命令
    const parsed = router.parseArgs(commandStr.startsWith("/") ? commandStr : `/${commandStr}`)
    const command = registry.get(parsed.name)

    if (!command) {
      return {
        success: false,
        output: "",
        error: `未知命令: ${parsed.name}`,
      }
    }

    // 合并参数
    const mergedArgs = [...parsed.args, ...args]

    // 执行命令
    const result = await baseDispatcher.dispatch(
      command,
      mergedArgs,
      parsed.namedArgs,
      context
    )

    return {
      success: result.success,
      output: result.output,
      error: result.error,
    }
  }

  return {
    ...baseDispatcher,

    async execute(input: string, context: DispatchContext): Promise<ExecutionResult> {
      const startTime = Date.now()

      // 检查是否包含链式操作符
      if (hasChain(input)) {
        const result = await executeChain(input, (cmd, args) =>
          executeSingle(cmd, args, context)
        )

        // 记录历史
        if (historyManager) {
          await historyManager.add(input, result.success)
        }

        return {
          success: result.success,
          output: result.outputs.join("\n"),
          error: result.error,
          duration: Date.now() - startTime,
          layer: "builtin",
          data: {
            segmentsExecuted: result.segmentsExecuted,
            totalSegments: result.totalSegments,
          },
        }
      }

      // 检查是否包含管道
      if (hasPipe(input)) {
        const result = await executePipeline(input, (cmd, args) =>
          executeSingle(cmd, args, context)
        )

        // 记录历史
        if (historyManager) {
          await historyManager.add(input, result.success)
        }

        return {
          success: result.success,
          output: result.output,
          error: result.error,
          duration: Date.now() - startTime,
          layer: "builtin",
          data: {
            stagesExecuted: result.stagesExecuted,
            totalStages: result.totalStages,
          },
        }
      }

      // 普通命令执行
      const routeResult = router.route(input)

      if (routeResult.type !== "command" || !routeResult.found || !routeResult.command) {
        return {
          success: false,
          output: "",
          error: routeResult.type === "command"
            ? `未知命令: ${routeResult.commandName}`
            : "不是命令",
          duration: Date.now() - startTime,
          layer: "builtin",
        }
      }

      const result = await baseDispatcher.dispatch(
        routeResult.command,
        routeResult.args,
        routeResult.namedArgs,
        context
      )

      // 记录历史
      if (historyManager) {
        await historyManager.add(input, result.success)
      }

      return result
    },

    dispatch: baseDispatcher.dispatch.bind(baseDispatcher),
  }
}

// ============================================================================
// Exports (interfaces already exported at declaration)
// ============================================================================
