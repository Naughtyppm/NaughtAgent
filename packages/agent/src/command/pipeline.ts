/**
 * 管道执行器 (Pipeline Executor)
 *
 * 负责：
 * - 解析管道语法 (|)
 * - 执行管道阶段
 * - 传递输出作为下一命令的第一个参数
 *
 * 需求: 7.1, 7.2, 7.3, 7.4, 7.5
 */

// ============================================================================
// Types
// ============================================================================

/**
 * 管道阶段
 */
export interface PipelineStage {
  /** 命令（不含参数） */
  command: string
  /** 参数列表 */
  args: string[]
  /** 原始字符串 */
  raw: string
}

/**
 * 管道结果
 */
export interface PipelineResult {
  /** 是否成功 */
  success: boolean
  /** 最终输出 */
  output: string
  /** 错误信息 */
  error?: string
  /** 执行的阶段数 */
  stagesExecuted: number
  /** 总阶段数 */
  totalStages: number
}

/**
 * 命令执行器类型
 */
export type CommandExecutor = (
  command: string,
  args: string[]
) => Promise<{ success: boolean; output: string; error?: string }>

// ============================================================================
// Implementation
// ============================================================================

/**
 * 检查是否包含管道
 */
export function hasPipe(input: string): boolean {
  // 检查是否有引号外的 |
  return findPipePositions(input).length > 0
}

/**
 * 查找引号外的管道位置
 */
function findPipePositions(input: string): number[] {
  const positions: number[] = []
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

    if (char === "|" && !inSingleQuote && !inDoubleQuote) {
      positions.push(i)
    }
  }

  return positions
}

/**
 * 解析管道语法
 */
export function parsePipeline(input: string): PipelineStage[] {
  const positions = findPipePositions(input)

  if (positions.length === 0) {
    // 没有管道，返回单个阶段
    return [parseStage(input.trim())]
  }

  const stages: PipelineStage[] = []
  let start = 0

  for (const pos of positions) {
    const segment = input.substring(start, pos).trim()
    if (segment) {
      stages.push(parseStage(segment))
    }
    start = pos + 1
  }

  // 最后一段
  const lastSegment = input.substring(start).trim()
  if (lastSegment) {
    stages.push(parseStage(lastSegment))
  }

  return stages
}

/**
 * 解析单个阶段
 */
function parseStage(raw: string): PipelineStage {
  const parts = parseCommandParts(raw)
  const command = parts[0] || ""
  const args = parts.slice(1)

  return { command, args, raw }
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

/**
 * 执行管道
 */
export async function executePipeline(
  input: string,
  executor: CommandExecutor
): Promise<PipelineResult> {
  const stages = parsePipeline(input)

  if (stages.length === 0) {
    return {
      success: false,
      output: "",
      error: "空管道",
      stagesExecuted: 0,
      totalStages: 0,
    }
  }

  let previousOutput = ""
  let stagesExecuted = 0

  for (const stage of stages) {
    // 将前一阶段的输出作为第一个参数
    const args = stagesExecuted > 0 && previousOutput
      ? [previousOutput, ...stage.args]
      : stage.args

    try {
      const result = await executor(stage.command, args)
      stagesExecuted++

      if (!result.success) {
        return {
          success: false,
          output: previousOutput,
          error: result.error || `阶段 ${stagesExecuted} 执行失败`,
          stagesExecuted,
          totalStages: stages.length,
        }
      }

      previousOutput = result.output
    } catch (error) {
      return {
        success: false,
        output: previousOutput,
        error: `阶段 ${stagesExecuted + 1} 异常: ${error}`,
        stagesExecuted,
        totalStages: stages.length,
      }
    }
  }

  return {
    success: true,
    output: previousOutput,
    stagesExecuted,
    totalStages: stages.length,
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  findPipePositions as _findPipePositions,
  parseStage as _parseStage,
  parseCommandParts as _parseCommandParts,
}
