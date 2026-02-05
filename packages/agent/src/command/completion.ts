/**
 * 命令补全提供器 (Completion Provider)
 *
 * 为 UI 提供命令补全建议，支持：
 * - 前缀过滤
 * - 层级图标显示
 * - 参数提示
 * - 按相关性和优先级排序
 *
 * @module command/completion
 */

import type {
  UnifiedCommand,
  CommandLayer,
  CommandSource,
} from './types.js'
import { LAYER_ICONS, LAYER_PRIORITY } from './types.js'
import type { UnifiedRegistry } from './registry.js'

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 补全建议
 */
export interface CompletionSuggestion {
  /** 命令名称 */
  name: string
  /** 命令描述 */
  description: string
  /** 命令层级 */
  layer: CommandLayer
  /** 层级图标 */
  layerIcon: string
  /** 参数提示（可选） */
  parameterHint?: string
  /** 命令来源 */
  source: CommandSource
}

/**
 * 补全提供器接口
 */
export interface CompletionProvider {
  /** 获取补全建议 */
  getSuggestions(input: string, registry: UnifiedRegistry): CompletionSuggestion[]

  /** 获取参数补全 */
  getParameterSuggestions(command: UnifiedCommand, currentArg: string): string[]
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 生成参数提示字符串
 *
 * @param command - 命令定义
 * @returns 参数提示字符串，如 "<file> [--force]"
 */
function generateParameterHint(command: UnifiedCommand): string | undefined {
  if (command.parameters.length === 0) {
    return undefined
  }

  const hints = command.parameters.map((param) => {
    if (param.required) {
      return `<${param.name}>`
    } else if (param.defaultValue !== undefined) {
      return `[${param.name}=${param.defaultValue}]`
    } else {
      return `[${param.name}]`
    }
  })

  return hints.join(' ')
}

/**
 * 将 UnifiedCommand 转换为 CompletionSuggestion
 *
 * @param command - 命令定义
 * @returns 补全建议
 */
function commandToSuggestion(command: UnifiedCommand): CompletionSuggestion {
  return {
    name: command.name,
    description: command.description,
    layer: command.layer,
    layerIcon: LAYER_ICONS[command.layer],
    parameterHint: generateParameterHint(command),
    source: command.source,
  }
}

/**
 * 计算命令与输入的相关性分数
 *
 * 分数越低越相关：
 * - 完全匹配名称开头：0
 * - 匹配别名开头：1
 * - 名称包含输入：2
 * - 描述包含输入：3
 *
 * @param command - 命令定义
 * @param input - 用户输入（已去除 / 前缀，小写）
 * @returns 相关性分数
 */
function calculateRelevance(command: UnifiedCommand, input: string): number {
  const lowerName = command.name.toLowerCase()
  const lowerInput = input.toLowerCase()

  // 完全匹配名称开头
  if (lowerName.startsWith(lowerInput)) {
    return 0
  }

  // 匹配别名开头
  if (command.aliases?.some((alias) => alias.toLowerCase().startsWith(lowerInput))) {
    return 1
  }

  // 名称包含输入
  if (lowerName.includes(lowerInput)) {
    return 2
  }

  // 描述包含输入
  if (command.description.toLowerCase().includes(lowerInput)) {
    return 3
  }

  // 不匹配
  return Infinity
}

/**
 * 比较两个建议的排序顺序
 *
 * 排序规则：
 * 1. 相关性分数（越低越前）
 * 2. 层级优先级（builtin > skill > external）
 * 3. 名称字母顺序
 *
 * @param a - 建议 A
 * @param b - 建议 B
 * @param relevanceA - A 的相关性分数
 * @param relevanceB - B 的相关性分数
 * @returns 比较结果
 */
function compareSuggestions(
  a: CompletionSuggestion,
  b: CompletionSuggestion,
  relevanceA: number,
  relevanceB: number
): number {
  // 1. 相关性分数
  if (relevanceA !== relevanceB) {
    return relevanceA - relevanceB
  }

  // 2. 层级优先级
  const priorityA = LAYER_PRIORITY[a.layer]
  const priorityB = LAYER_PRIORITY[b.layer]
  if (priorityA !== priorityB) {
    return priorityA - priorityB
  }

  // 3. 名称字母顺序
  return a.name.localeCompare(b.name)
}

// ============================================================================
// CompletionProvider 实现
// ============================================================================

/**
 * 创建补全提供器
 *
 * @returns 补全提供器实例
 *
 * @example
 * ```typescript
 * const provider = createCompletionProvider()
 * const suggestions = provider.getSuggestions('/he', registry)
 * // 返回 [{ name: 'help', layerIcon: '⚡', ... }]
 * ```
 */
export function createCompletionProvider(): CompletionProvider {
  return {
    /**
     * 获取补全建议
     *
     * @param input - 用户输入（可能包含 / 前缀）
     * @param registry - 统一注册表
     * @returns 补全建议列表
     */
    getSuggestions(input: string, registry: UnifiedRegistry): CompletionSuggestion[] {
      // 去除 / 前缀
      const prefix = input.startsWith('/') ? input.slice(1) : input
      const lowerPrefix = prefix.toLowerCase()

      // 获取所有命令
      const allCommands = registry.getAll()

      // 如果输入为空（只有 /），返回所有命令
      if (prefix === '') {
        return allCommands
          .map(commandToSuggestion)
          .sort((a, b) => {
            // 按层级优先级排序，然后按名称
            const priorityA = LAYER_PRIORITY[a.layer]
            const priorityB = LAYER_PRIORITY[b.layer]
            if (priorityA !== priorityB) {
              return priorityA - priorityB
            }
            return a.name.localeCompare(b.name)
          })
      }

      // 过滤匹配的命令
      const matchedCommands: Array<{ command: UnifiedCommand; relevance: number }> = []

      for (const command of allCommands) {
        const relevance = calculateRelevance(command, lowerPrefix)
        if (relevance !== Infinity) {
          matchedCommands.push({ command, relevance })
        }
      }

      // 转换为建议并排序
      const suggestions = matchedCommands.map(({ command, relevance }) => ({
        suggestion: commandToSuggestion(command),
        relevance,
      }))

      suggestions.sort((a, b) =>
        compareSuggestions(a.suggestion, b.suggestion, a.relevance, b.relevance)
      )

      return suggestions.map(({ suggestion }) => suggestion)
    },

    /**
     * 获取参数补全建议
     *
     * @param command - 命令定义
     * @param currentArg - 当前正在输入的参数
     * @returns 参数建议列表
     */
    getParameterSuggestions(command: UnifiedCommand, currentArg: string): string[] {
      const suggestions: string[] = []
      const lowerArg = currentArg.toLowerCase()

      // 如果当前参数以 -- 开头，提供命名参数建议
      if (currentArg.startsWith('--')) {
        const argName = currentArg.slice(2).toLowerCase()
        for (const param of command.parameters) {
          const paramName = `--${param.name}`
          if (paramName.toLowerCase().startsWith(`--${argName}`)) {
            if (param.defaultValue !== undefined) {
              suggestions.push(`${paramName}=${param.defaultValue}`)
            } else {
              suggestions.push(`${paramName}=`)
            }
          }
        }
      } else if (currentArg.startsWith('-')) {
        // 短参数形式，提供 -- 形式的建议
        for (const param of command.parameters) {
          suggestions.push(`--${param.name}`)
        }
      } else {
        // 位置参数，提供参数名称作为提示
        for (const param of command.parameters) {
          if (param.name.toLowerCase().startsWith(lowerArg)) {
            if (param.description) {
              suggestions.push(`${param.name} (${param.description})`)
            } else {
              suggestions.push(param.name)
            }
          }
        }
      }

      return suggestions
    },
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 快速获取补全建议（无需创建 provider 实例）
 *
 * @param input - 用户输入
 * @param registry - 统一注册表
 * @returns 补全建议列表
 */
export function getSuggestions(
  input: string,
  registry: UnifiedRegistry
): CompletionSuggestion[] {
  const provider = createCompletionProvider()
  return provider.getSuggestions(input, registry)
}

/**
 * 格式化建议为显示字符串
 *
 * @param suggestion - 补全建议
 * @returns 格式化的显示字符串，如 "⚡ /help - 显示帮助信息"
 */
export function formatSuggestion(suggestion: CompletionSuggestion): string {
  let result = `${suggestion.layerIcon} /${suggestion.name}`

  if (suggestion.parameterHint) {
    result += ` ${suggestion.parameterHint}`
  }

  result += ` - ${suggestion.description}`

  return result
}
