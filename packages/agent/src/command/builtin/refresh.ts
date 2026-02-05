/**
 * /refresh 命令 - 重新加载命令源和索引缓存
 *
 * 重新加载所有命令源（justfile、skills 等）和项目索引缓存
 *
 * @example
 * /refresh       - 重新加载所有命令源和索引
 * /refresh --index - 仅重新加载索引缓存
 * /refresh --commands - 仅重新加载命令源
 * /reload        - 重新加载所有命令源（别名）
 */

import type { BuiltinCommandDefinition } from './types.js'
import type { ExecutionResult } from '../types.js'

/**
 * /refresh 命令定义
 */
export const refreshCommand: BuiltinCommandDefinition = {
  name: 'refresh',
  description: '重新加载命令源和索引缓存',
  aliases: ['reload'],
  parameters: [
    {
      name: 'index',
      description: '仅重新加载索引缓存',
      required: false,
      defaultValue: 'false',
    },
    {
      name: 'commands',
      description: '仅重新加载命令源',
      required: false,
      defaultValue: 'false',
    },
  ],
  handler: async (_args, namedArgs, context): Promise<ExecutionResult> => {
    const startTime = Date.now()

    const indexOnly = namedArgs['index'] === 'true'
    const commandsOnly = namedArgs['commands'] === 'true'
    const refreshAll = !indexOnly && !commandsOnly

    const results: string[] = []

    // 重新加载命令源
    if (refreshAll || commandsOnly) {
      if (!context.reloadRegistry) {
        return {
          success: false,
          output: '',
          error: '重载功能不可用',
          duration: Date.now() - startTime,
          layer: 'builtin',
        }
      }

      try {
        context.addMessage('info', '正在重新加载命令源...')
        await context.reloadRegistry()
        results.push('命令源已重新加载')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          success: false,
          output: results.join('\n'),
          error: `重新加载命令源失败: ${errorMessage}`,
          duration: Date.now() - startTime,
          layer: 'builtin',
        }
      }
    }

    // 重新加载索引缓存
    if (refreshAll || indexOnly) {
      if (context.invalidateIndexCache) {
        try {
          context.addMessage('info', '正在重新加载索引缓存...')
          await context.invalidateIndexCache()
          results.push('索引缓存已失效')
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          results.push(`索引缓存失效失败: ${errorMessage}`)
        }
      } else {
        results.push('索引缓存功能不可用')
      }
    }

    const duration = Date.now() - startTime
    const message = results.join('\n') + ` (${duration}ms)`
    context.addMessage('info', message)

    return {
      success: true,
      output: message,
      duration,
      layer: 'builtin',
    }
  },
}
