/**
 * /quit 命令 - 退出应用（唯一退出方式）
 *
 * 优雅地终止应用程序。只有 /quit 才会真正退出，
 * /exit 和 /q 仅提示用户使用 /quit。
 *
 * @example
 * /quit          - 退出应用
 * /exit          - 提示使用 /quit
 */

import type { BuiltinCommandDefinition } from './types.js'
import type { ExecutionResult } from '../types.js'

/**
 * /quit 命令定义 - 唯一的退出方式
 */
export const quitCommand: BuiltinCommandDefinition = {
  name: 'quit',
  description: '退出应用（唯一退出方式）',
  aliases: [],
  parameters: [],
  handler: (_args, _namedArgs, context): ExecutionResult => {
    const startTime = Date.now()

    context.addMessage('info', '正在退出...')

    return {
      success: true,
      output: '再见！',
      duration: Date.now() - startTime,
      layer: 'builtin',
      exit: true,
    }
  },
}

/**
 * /exit 命令定义 - 提示使用 /quit
 */
export const exitCommand: BuiltinCommandDefinition = {
  name: 'exit',
  description: '退出（提示使用 /quit）',
  aliases: ['q'],
  parameters: [],
  handler: (_args, _namedArgs, _context): ExecutionResult => {
    const startTime = Date.now()

    return {
      success: true,
      output: '⚠️  使用 /quit 退出会话',
      duration: Date.now() - startTime,
      layer: 'builtin',
    }
  },
}
