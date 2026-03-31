/**
 * /history 命令 - 显示命令历史
 *
 * 显示最近执行的命令历史记录
 *
 * @example
 * /history       - 显示最近 10 条命令历史
 * /history 20    - 显示最近 20 条命令历史
 * /history --all - 显示所有命令历史
 */

import type { BuiltinCommandDefinition } from './types.js'
import type { ExecutionResult } from '../types.js'

/**
 * 默认显示的历史条数
 */
const DEFAULT_HISTORY_COUNT = 10

/**
 * 格式化命令历史
 */
function formatHistory(history: string[], limit: number): string {
  if (history.length === 0) {
    return '命令历史为空'
  }

  const lines: string[] = []
  lines.push('命令历史:')
  lines.push('─'.repeat(40))

  // 获取要显示的历史记录（最近的在前）
  const displayHistory = history.slice(-limit).reverse()

  displayHistory.forEach((cmd, index) => {
    const historyIndex = history.length - index
    const paddedIndex = String(historyIndex).padStart(3, ' ')
    lines.push(`${paddedIndex}  ${cmd}`)
  })

  lines.push('')
  lines.push(`共 ${history.length} 条记录，显示最近 ${displayHistory.length} 条`)

  return lines.join('\n')
}

/**
 * /history 命令定义
 */
export const historyCommand: BuiltinCommandDefinition = {
  name: 'history',
  description: '显示命令历史',
  aliases: ['hist'],
  parameters: [
    {
      name: 'count',
      description: '要显示的历史条数',
      required: false,
      defaultValue: String(DEFAULT_HISTORY_COUNT),
    },
    {
      name: 'all',
      description: '显示所有历史记录',
      required: false,
      defaultValue: 'false',
    },
  ],
  handler: (args, namedArgs, context): ExecutionResult => {
    const startTime = Date.now()
    const state = context.getState()
    const history = state.commandHistory

    // 确定要显示的条数
    let limit = DEFAULT_HISTORY_COUNT

    // 检查 --all 参数
    if (namedArgs['all'] === 'true' || namedArgs['all'] === '') {
      limit = history.length || 1 // 至少显示 1 条（避免除零）
    } else if (args.length > 0) {
      // 解析数字参数
      const parsed = parseInt(args[0], 10)
      if (!isNaN(parsed) && parsed > 0) {
        limit = parsed
      } else {
        return {
          success: false,
          output: '',
          error: `无效的数量参数: ${args[0]}。请提供正整数。`,
          duration: Date.now() - startTime,
          layer: 'builtin',
        }
      }
    }

    return {
      success: true,
      output: formatHistory(history, limit),
      duration: Date.now() - startTime,
      layer: 'builtin',
      data: {
        totalCount: history.length,
        displayedCount: Math.min(limit, history.length),
      },
    }
  },
}
