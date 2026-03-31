/**
 * /model 命令 - 切换模型
 *
 * 自动感知 proxy 环境（copilot-api vs 原生 Anthropic API），
 * 显示正确的模型列表和名称格式。
 *
 * @example
 * /model                    - 显示可用模型列表
 * /model opus               - 切换到 opus（自动解析为正确格式）
 * /model claude-sonnet-4.5  - 切换到 sonnet 4.5
 */

import type { BuiltinCommandDefinition } from './types.js'
import type { ExecutionResult } from '../types.js'
import { resolveModelName, isProxyBaseURL } from '../../provider/types.js'

/**
 * Copilot-api 模型列表（反代模式）
 */
const COPILOT_MODELS = [
  { name: 'claude-sonnet-4', description: 'Claude Sonnet 4（默认）' },
  { name: 'claude-sonnet-4.5', description: 'Claude Sonnet 4.5（更强）' },
  { name: 'claude-sonnet-4.6', description: 'Claude Sonnet 4.6（最新）' },
  { name: 'claude-opus-4.5', description: 'Claude Opus 4.5' },
  { name: 'claude-opus-4.6', description: 'Claude Opus 4.6（最强）' },
  { name: 'claude-haiku-4.5', description: 'Claude Haiku 4.5（最快）' },
]

/**
 * Anthropic 原生 API 模型列表
 */
const ANTHROPIC_MODELS = [
  { name: 'claude-sonnet-4-20250514', description: 'Claude Sonnet 4（默认）' },
  { name: 'claude-sonnet-4-5-20250514', description: 'Claude Sonnet 4.5（更强）' },
  { name: 'claude-opus-4-20250514', description: 'Claude Opus 4' },
  { name: 'claude-opus-4-5-20251101', description: 'Claude Opus 4.5' },
  { name: 'claude-opus-4-6-20260206', description: 'Claude Opus 4.6（最强）' },
  { name: 'claude-haiku-4-20250514', description: 'Claude Haiku 4' },
  { name: 'claude-haiku-4-5-20250514', description: 'Claude Haiku 4.5（最快）' },
]

/**
 * 常用简写提示
 */
const SHORTCUTS = '简写: opus, sonnet, haiku, opus-4.5, sonnet-4.5 等'

/**
 * 格式化模型列表
 */
function formatModelList(currentModel: string, isProxy: boolean): string {
  const models = isProxy ? COPILOT_MODELS : ANTHROPIC_MODELS
  const mode = isProxy ? 'Copilot Proxy' : 'Anthropic API'

  const lines: string[] = []
  lines.push(`可用模型 (${mode}):`)
  lines.push('─'.repeat(50))

  for (const m of models) {
    const isCurrent = m.name === currentModel
    const marker = isCurrent ? '→ ' : '  '
    const suffix = isCurrent ? ' ✓' : ''
    lines.push(`${marker}${m.name.padEnd(30)} ${m.description}${suffix}`)
  }

  lines.push('')
  lines.push(`当前模型: ${currentModel}`)
  lines.push(SHORTCUTS)

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
      description: '模型名称或简写（opus, sonnet, haiku 等）',
      required: false,
    },
  ],
  handler: (args, _namedArgs, context): ExecutionResult => {
    const startTime = Date.now()
    const state = context.getState()
    const baseURL = process.env.ANTHROPIC_BASE_URL
    const isProxy = isProxyBaseURL(baseURL)

    // 无参数：显示模型列表
    if (args.length === 0) {
      return {
        success: true,
        output: formatModelList(state.currentModel, isProxy),
        duration: Date.now() - startTime,
        layer: 'builtin',
      }
    }

    // 切换模型：解析简写为正确的 API 格式
    const userInput = args[0]
    const resolved = resolveModelName(userInput, baseURL)
    const oldModel = state.currentModel

    // 如果解析结果和当前一样
    if (resolved === oldModel) {
      return {
        success: true,
        output: `当前已是 ${resolved}`,
        duration: Date.now() - startTime,
        layer: 'builtin',
      }
    }

    try {
      context.setState({ currentModel: resolved })

      // 显示映射关系（如果简写和解析结果不同）
      const mapping = userInput !== resolved ? ` (${userInput} → ${resolved})` : ''
      const message = `模型已切换: ${oldModel} → ${resolved}${mapping}`

      return {
        success: true,
        output: message,
        duration: Date.now() - startTime,
        layer: 'builtin',
        data: {
          previousModel: oldModel,
          currentModel: resolved,
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
