/**
 * /model 命令 - 切换模型
 *
 * 切换当前使用的 AI 模型
 *
 * @example
 * /model                    - 显示当前模型
 * /model claude-sonnet      - 切换到 claude-sonnet
 * /model claude-opus        - 切换到 claude-opus
 */

import type { BuiltinCommandDefinition } from './types.js'
import type { ExecutionResult } from '../types.js'

/**
 * 支持的模型列表
 */
const SUPPORTED_MODELS = [
  'claude-sonnet',
  'claude-opus',
  'claude-haiku',
  'gpt-4',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
]

/**
 * 格式化模型列表
 */
function formatModelList(currentModel: string): string {
  const lines: string[] = []
  lines.push('可用模型:')
  lines.push('─'.repeat(30))

  for (const model of SUPPORTED_MODELS) {
    const marker = model === currentModel ? '→ ' : '  '
    lines.push(`${marker}${model}`)
  }

  lines.push('')
  lines.push(`当前模型: ${currentModel}`)

  return lines.join('\n')
}

/**
 * /model 命令定义
 */
export const modelCommand: BuiltinCommandDefinition = {
  name: 'model',
  description: '切换或显示当前 AI 模型',
  aliases: ['m'],
  parameters: [
    {
      name: 'name',
      description: '要切换到的模型名称',
      required: false,
    },
  ],
  handler: (args, _namedArgs, context): ExecutionResult => {
    const startTime = Date.now()
    const state = context.getState()

    // 如果没有参数，显示当前模型和可用模型列表
    if (args.length === 0) {
      return {
        success: true,
        output: formatModelList(state.currentModel),
        duration: Date.now() - startTime,
        layer: 'builtin',
      }
    }

    // 切换模型
    const newModel = args[0]

    // 验证模型名称（可选：严格模式下检查是否在支持列表中）
    // 这里采用宽松模式，允许任意模型名称
    const oldModel = state.currentModel

    try {
      context.setState({ currentModel: newModel })

      const message = `模型已从 ${oldModel} 切换到 ${newModel}`
      context.addMessage('info', message)

      return {
        success: true,
        output: message,
        duration: Date.now() - startTime,
        layer: 'builtin',
        data: {
          previousModel: oldModel,
          currentModel: newModel,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        output: '',
        error: `切换模型失败: ${errorMessage}`,
        duration: Date.now() - startTime,
        layer: 'builtin',
      }
    }
  },
}
