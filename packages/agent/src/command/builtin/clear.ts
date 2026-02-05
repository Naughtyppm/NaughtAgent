/**
 * /clear 命令 - 清空对话历史
 *
 * 清空当前会话的对话历史，保留命令历史
 *
 * @example
 * /clear         - 清空对话历史
 * /clear --all   - 清空对话历史和命令历史
 */

import type { BuiltinCommandDefinition } from './types.js'
import type { ExecutionResult } from '../types.js'

/**
 * /clear 命令定义
 */
export const clearCommand: BuiltinCommandDefinition = {
  name: 'clear',
  description: '清空对话历史',
  aliases: ['cls'],
  parameters: [
    {
      name: 'all',
      description: '同时清空命令历史',
      required: false,
      defaultValue: 'false',
    },
  ],
  handler: (_args, namedArgs, context): ExecutionResult => {
    const startTime = Date.now()
    const clearAll = namedArgs['all'] === 'true' || namedArgs['all'] === ''

    try {
      // 清空对话历史
      context.setState({ conversationHistory: [] })

      // 如果指定 --all，同时清空命令历史
      if (clearAll) {
        context.setState({ commandHistory: [] })
        context.addMessage('info', '已清空对话历史和命令历史')
        return {
          success: true,
          output: '已清空对话历史和命令历史',
          duration: Date.now() - startTime,
          layer: 'builtin',
        }
      }

      context.addMessage('info', '已清空对话历史')
      return {
        success: true,
        output: '已清空对话历史',
        duration: Date.now() - startTime,
        layer: 'builtin',
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        output: '',
        error: `清空历史失败: ${errorMessage}`,
        duration: Date.now() - startTime,
        layer: 'builtin',
      }
    }
  },
}
