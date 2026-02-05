/**
 * 命令路由器 (Command Router)
 *
 * 解析用户输入，判断是命令还是自然语言，并解析命令参数。
 *
 * 功能：
 * - 检测 / 前缀判断是否为命令
 * - 解析命令名称和参数
 * - 支持引号参数和命名参数
 * - 返回结构化的路由结果
 *
 * @module command/router
 */

import type { RoutingResult } from './types.js'
import type { UnifiedRegistry } from './registry.js'

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 命令路由器接口
 */
export interface CommandRouter {
  /** 路由输入 */
  route(input: string): RoutingResult

  /** 检查是否是命令 */
  isCommand(input: string): boolean

  /** 解析命令参数 */
  parseArgs(input: string): ParsedCommand
}

/**
 * 解析后的命令
 */
export interface ParsedCommand {
  /** 命令名称（不含 /） */
  name: string
  /** 位置参数 */
  args: string[]
  /** 命名参数 */
  namedArgs: Record<string, string>
}

// ============================================================================
// 参数解析器
// ============================================================================

/**
 * 解析命令行参数
 *
 * 支持：
 * - 位置参数: /cmd arg1 arg2
 * - 引号参数: /cmd "arg with spaces" 'single quotes'
 * - 命名参数: /cmd --key=value --flag
 * - 混合使用: /cmd arg1 --key=value "quoted arg"
 *
 * @param argsString - 参数字符串（不含命令名）
 * @returns 解析后的参数
 */
function parseArguments(argsString: string): {
  args: string[]
  namedArgs: Record<string, string>
} {
  const args: string[] = []
  const namedArgs: Record<string, string> = {}

  if (!argsString.trim()) {
    return { args, namedArgs }
  }

  // 状态机解析
  let current = ''
  let inQuote: '"' | "'" | null = null
  let i = 0

  while (i < argsString.length) {
    const char = argsString[i]

    // 处理引号
    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = char
      i++
      continue
    }

    if (char === inQuote) {
      inQuote = null
      // 引号结束，保存当前 token
      if (current) {
        processToken(current, args, namedArgs)
        current = ''
      }
      i++
      continue
    }

    // 处理空格（非引号内）
    if (char === ' ' && !inQuote) {
      if (current) {
        processToken(current, args, namedArgs)
        current = ''
      }
      i++
      continue
    }

    // 处理转义字符
    if (char === '\\' && i + 1 < argsString.length) {
      const nextChar = argsString[i + 1]
      // 转义引号或反斜杠
      if (nextChar === '"' || nextChar === "'" || nextChar === '\\') {
        current += nextChar
        i += 2
        continue
      }
    }

    current += char
    i++
  }

  // 处理最后一个 token
  if (current) {
    processToken(current, args, namedArgs)
  }

  return { args, namedArgs }
}

/**
 * 处理单个 token，判断是位置参数还是命名参数
 */
function processToken(
  token: string,
  args: string[],
  namedArgs: Record<string, string>
): void {
  // 检查是否是命名参数 --key=value 或 --flag
  if (token.startsWith('--')) {
    const withoutPrefix = token.slice(2)
    const eqIndex = withoutPrefix.indexOf('=')

    if (eqIndex !== -1) {
      // --key=value 形式
      const key = withoutPrefix.slice(0, eqIndex)
      const value = withoutPrefix.slice(eqIndex + 1)
      if (key) {
        namedArgs[key] = value
      }
    } else {
      // --flag 形式（布尔标志）
      if (withoutPrefix) {
        namedArgs[withoutPrefix] = 'true'
      }
    }
  } else if (token.startsWith('-') && token.length === 2) {
    // 短参数 -f 形式（布尔标志）
    const key = token.slice(1)
    namedArgs[key] = 'true'
  } else {
    // 位置参数
    args.push(token)
  }
}

// ============================================================================
// CommandRouter 实现
// ============================================================================

/**
 * 创建命令路由器
 *
 * @param registry - 统一命令注册表
 * @returns 命令路由器实例
 *
 * @example
 * ```typescript
 * const router = createCommandRouter(registry)
 *
 * // 检查是否是命令
 * router.isCommand('/help')  // true
 * router.isCommand('hello')  // false
 *
 * // 路由输入
 * const result = router.route('/model claude-sonnet')
 * // { type: 'command', command: {...}, args: ['claude-sonnet'], ... }
 *
 * // 解析参数
 * const parsed = router.parseArgs('/commit -m "fix bug" --amend')
 * // { name: 'commit', args: ['fix bug'], namedArgs: { m: 'true', amend: 'true' } }
 * ```
 */
export function createCommandRouter(registry: UnifiedRegistry): CommandRouter {
  return {
    /**
     * 检查输入是否是命令
     *
     * 命令以 '/' 开头
     */
    isCommand(input: string): boolean {
      const trimmed = input.trim()
      return trimmed.startsWith('/')
    },

    /**
     * 解析命令参数
     *
     * 从输入中提取命令名和参数
     */
    parseArgs(input: string): ParsedCommand {
      const trimmed = input.trim()

      // 如果不是命令，返回空结果
      if (!trimmed.startsWith('/')) {
        return { name: '', args: [], namedArgs: {} }
      }

      // 移除 / 前缀
      const withoutSlash = trimmed.slice(1)

      // 分离命令名和参数
      const firstSpaceIndex = withoutSlash.indexOf(' ')

      let name: string
      let argsString: string

      if (firstSpaceIndex === -1) {
        // 没有参数
        name = withoutSlash
        argsString = ''
      } else {
        name = withoutSlash.slice(0, firstSpaceIndex)
        argsString = withoutSlash.slice(firstSpaceIndex + 1)
      }

      // 解析参数
      const { args, namedArgs } = parseArguments(argsString)

      return { name, args, namedArgs }
    },

    /**
     * 路由输入
     *
     * 判断输入类型并返回路由结果
     */
    route(input: string): RoutingResult {
      const trimmed = input.trim()

      // 检查是否是命令
      if (!this.isCommand(trimmed)) {
        // 自然语言
        return {
          type: 'natural-language',
          args: [],
          namedArgs: {},
          rawInput: input,
          found: false,
        }
      }

      // 解析命令
      const { name, args, namedArgs } = this.parseArgs(trimmed)

      // 查找命令
      const command = registry.get(name)

      return {
        type: 'command',
        command,
        commandName: name,
        args,
        namedArgs,
        rawInput: input,
        found: !!command,
      }
    },
  }
}

// ============================================================================
// 导出辅助函数（用于测试）
// ============================================================================

/**
 * 解析参数字符串（导出用于测试）
 */
export { parseArguments }
