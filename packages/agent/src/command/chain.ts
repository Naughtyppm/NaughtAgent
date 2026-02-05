/**
 * 链式执行器 (Chain Executor)
 *
 * 负责：
 * - 解析链式语法 (&& 和 ;)
 * - 执行链式命令
 * - 条件执行 (&&) 和无条件执行 (;)
 *
 * 需求: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { hasPipe, executePipeline, type CommandExecutor } from "./pipeline.js"

// ============================================================================
// Types
// ============================================================================

/**
 * 链式段类型
 */
export type ChainOperator = "&&" | ";"

/**
 * 链式段
 */
export interface ChainSegment {
  /** 命令（可能包含管道） */
  command: string
  /** 操作符（与下一段的连接） */
  operator: ChainOperator | null
}

/**
 * 链式结果
 */
export interface ChainResult {
  /** 是否成功 */
  success: boolean
  /** 所有输出 */
  outputs: string[]
  /** 错误信息 */
  error?: string
  /** 执行的段数 */
  segmentsExecuted: number
  /** 总段数 */
  totalSegments: number
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * 检查是否包含链式操作符
 */
export function hasChain(input: string): boolean {
  return findChainPositions(input).length > 0
}

/**
 * 查找引号外的链式操作符位置
 */
function findChainPositions(input: string): Array<{ pos: number; op: ChainOperator }> {
  const positions: Array<{ pos: number; op: ChainOperator }> = []
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === "\\") {
      escaped = true
      continue
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (!inSingleQuote && !inDoubleQuote) {
      // 检查 &&
      if (char === "&" && input[i + 1] === "&") {
        positions.push({ pos: i, op: "&&" })
        i++ // 跳过第二个 &
        continue
      }

      // 检查 ;
      if (char === ";") {
        positions.push({ pos: i, op: ";" })
      }
    }
  }

  return positions
}

/**
 * 解析链式语法
 */
export function parseChain(input: string): ChainSegment[] {
  const positions = findChainPositions(input)

  if (positions.length === 0) {
    return [{ command: input.trim(), operator: null }]
  }

  const segments: ChainSegment[] = []
  let start = 0

  for (const { pos, op } of positions) {
    const command = input.substring(start, pos).trim()
    if (command) {
      segments.push({ command, operator: op })
    }
    start = pos + (op === "&&" ? 2 : 1)
  }

  // 最后一段
  const lastCommand = input.substring(start).trim()
  if (lastCommand) {
    segments.push({ command: lastCommand, operator: null })
  }

  return segments
}

/**
 * 执行链式命令
 */
export async function executeChain(
  input: string,
  executor: CommandExecutor
): Promise<ChainResult> {
  const segments = parseChain(input)

  if (segments.length === 0) {
    return {
      success: false,
      outputs: [],
      error: "空链式命令",
      segmentsExecuted: 0,
      totalSegments: 0,
    }
  }

  const outputs: string[] = []
  let segmentsExecuted = 0
  let lastSuccess = true

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const prevSegment = i > 0 ? segments[i - 1] : null

    // 检查是否应该执行
    if (prevSegment?.operator === "&&" && !lastSuccess) {
      // 前一个是 && 且失败，跳过
      continue
    }

    try {
      let result: { success: boolean; output: string; error?: string }

      // 检查是否包含管道
      if (hasPipe(segment.command)) {
        const pipeResult = await executePipeline(segment.command, executor)
        result = {
          success: pipeResult.success,
          output: pipeResult.output,
          error: pipeResult.error,
        }
      } else {
        // 解析命令和参数
        const parts = parseCommandParts(segment.command)
        const command = parts[0] || ""
        const args = parts.slice(1)
        result = await executor(command, args)
      }

      segmentsExecuted++
      outputs.push(result.output)
      lastSuccess = result.success

      // 如果是 && 且失败，记录错误但继续检查后续
      if (!result.success && segment.operator === "&&") {
        // 后续的 && 链会被跳过
      }
    } catch (error) {
      segmentsExecuted++
      lastSuccess = false
      outputs.push("")

      if (segment.operator === "&&") {
        // && 失败，后续 && 链会被跳过
      }
    }
  }

  return {
    success: lastSuccess,
    outputs,
    segmentsExecuted,
    totalSegments: segments.length,
  }
}

/**
 * 解析命令部分（处理引号）
 */
function parseCommandParts(input: string): string[] {
  const parts: string[] = []
  let current = ""
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === "\\") {
      escaped = true
      continue
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (char === " " && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        parts.push(current)
        current = ""
      }
      continue
    }

    current += char
  }

  if (current) {
    parts.push(current)
  }

  return parts
}

// ============================================================================
// Exports
// ============================================================================

export {
  findChainPositions as _findChainPositions,
  parseCommandParts as _parseCommandParts,
}
