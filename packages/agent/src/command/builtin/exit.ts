/**
 * /exit 命令 - 退出应用
 *
 * 优雅地终止应用程序
 *
 * @example
 * /exit          - 退出应用
 * /quit          - 退出应用（别名）
 */

import type { BuiltinCommandDefinition } from './types.js'
import type { ExecutionResult } from '../types.js'

/**
 * /exit 命令定义
 */
export const exitCommand: BuiltinCommandDefinition = {
  name: 'exit',
  description: '退出应用',
  aliases: ['quit', 'q'],
  parameters: [],
  handler: (_args, _namedArgs, context): ExecutionResult => {
    const startTime = Date.now()

    context.addMessage('info', '正在退出...')

    return {
      success: true,
      output: '再见！',
      duration: Date.now() - startTime,
      layer: 'builtin',
      exit: true, // 标记需要退出应用
    }
  },
}
