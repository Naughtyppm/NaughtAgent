/**
 * 工具输出截断器 (Tool Output Truncator)
 *
 * 负责：
 * - 截断过长的工具输出以控制 Token 消耗
 * - 支持多种截断策略（head/tail/middle）
 * - 针对不同内容类型的智能截断
 *
 * 需求: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import { estimateTokens } from "./token"

// ============================================================================
// Types
// ============================================================================

/**
 * 截断策略
 */
export type TruncationStrategy = "head" | "tail" | "middle"

/**
 * 截断配置
 */
export interface TruncationConfig {
  /** 单次输出最大 Token 数（默认 4000） */
  maxOutputTokens: number
  /** 截断策略（默认 middle） */
  strategy: TruncationStrategy
  /** 是否保留结构（JSON/代码）（默认 true） */
  preserveStructure: boolean
  /** 截断指示器模板 */
  truncationIndicator: string
}

/**
 * 截断结果
 */
export interface TruncationResult {
  /** 截断后的内容 */
  content: string
  /** 是否发生截断 */
  truncated: boolean
  /** 原始 Token 数 */
  originalTokens: number
  /** 截断后 Token 数 */
  finalTokens: number
}

/**
 * Grep 匹配结果
 */
export interface GrepMatch {
  /** 文件路径 */
  file: string
  /** 行号 */
  line: number
  /** 匹配内容 */
  content: string
  /** 上下文行（可选） */
  context?: string[]
}

/**
 * 工具输出截断器接口
 */
export interface ToolOutputTruncator {
  /** 截断文本内容 */
  truncate(content: string, config?: Partial<TruncationConfig>): TruncationResult

  /** 截断文件读取结果 */
  truncateFileContent(content: string, filePath: string): TruncationResult

  /** 截断 bash 输出 */
  truncateBashOutput(stdout: string, stderr: string): TruncationResult

  /** 截断 grep 结果 */
  truncateGrepResults(results: GrepMatch[], totalMatches: number): TruncationResult

  /** 截断 JSON 内容（保持有效结构） */
  truncateJson(json: string): TruncationResult
}

// ============================================================================
// Constants
// ============================================================================

/** 默认截断配置 */
export const DEFAULT_TRUNCATION_CONFIG: TruncationConfig = {
  maxOutputTokens: 4000,
  strategy: "middle",
  preserveStructure: true,
  truncationIndicator: "\n... [已截断: 移除了 {removed} 个 token] ...\n",
}

/** 安全缓冲比例 */
const SAFETY_BUFFER = 0.95

// ============================================================================
// Implementation
// ============================================================================

/**
 * 创建截断指示器
 */
function createIndicator(template: string, removedTokens: number): string {
  return template.replace("{removed}", String(removedTokens))
}

/**
 * 按行分割内容
 */
function splitLines(content: string): string[] {
  return content.split("\n")
}

/**
 * 合并行
 */
function joinLines(lines: string[]): string {
  return lines.join("\n")
}

/**
 * 核心截断逻辑 - head 策略
 * 保留开头部分
 */
function truncateHead(
  content: string,
  targetTokens: number,
  indicator: string
): string {
  const lines = splitLines(content)
  const result: string[] = []
  let currentTokens = 0
  const indicatorTokens = estimateTokens(indicator)
  const effectiveTarget = targetTokens - indicatorTokens

  for (const line of lines) {
    const lineTokens = estimateTokens(line + "\n")
    if (currentTokens + lineTokens > effectiveTarget) {
      break
    }
    result.push(line)
    currentTokens += lineTokens
  }

  if (result.length < lines.length) {
    result.push(indicator)
  }

  return joinLines(result)
}

/**
 * 核心截断逻辑 - tail 策略
 * 保留结尾部分
 */
function truncateTail(
  content: string,
  targetTokens: number,
  indicator: string
): string {
  const lines = splitLines(content)
  const result: string[] = []
  let currentTokens = 0
  const indicatorTokens = estimateTokens(indicator)
  const effectiveTarget = targetTokens - indicatorTokens

  // 从后往前遍历
  for (let i = lines.length - 1; i >= 0; i--) {
    const lineTokens = estimateTokens(lines[i] + "\n")
    if (currentTokens + lineTokens > effectiveTarget) {
      break
    }
    result.unshift(lines[i])
    currentTokens += lineTokens
  }

  if (result.length < lines.length) {
    result.unshift(indicator)
  }

  return joinLines(result)
}

/**
 * 核心截断逻辑 - middle 策略
 * 保留开头和结尾，截断中间
 */
function truncateMiddle(
  content: string,
  targetTokens: number,
  indicator: string
): string {
  const lines = splitLines(content)
  const indicatorTokens = estimateTokens(indicator)
  const effectiveTarget = targetTokens - indicatorTokens

  // 分配：开头 60%，结尾 40%
  const headTarget = Math.floor(effectiveTarget * 0.6)
  const tailTarget = effectiveTarget - headTarget

  const headLines: string[] = []
  const tailLines: string[] = []
  let headTokens = 0
  let tailTokens = 0

  // 收集开头
  for (const line of lines) {
    const lineTokens = estimateTokens(line + "\n")
    if (headTokens + lineTokens > headTarget) {
      break
    }
    headLines.push(line)
    headTokens += lineTokens
  }

  // 收集结尾
  for (let i = lines.length - 1; i >= headLines.length; i--) {
    const lineTokens = estimateTokens(lines[i] + "\n")
    if (tailTokens + lineTokens > tailTarget) {
      break
    }
    tailLines.unshift(lines[i])
    tailTokens += lineTokens
  }

  // 检查是否有中间被截断
  const totalKept = headLines.length + tailLines.length
  if (totalKept < lines.length) {
    return joinLines([...headLines, indicator, ...tailLines])
  }

  return joinLines([...headLines, ...tailLines])
}

/**
 * 创建工具输出截断器
 */
export function createTruncator(
  config?: Partial<TruncationConfig>
): ToolOutputTruncator {
  const finalConfig: TruncationConfig = {
    ...DEFAULT_TRUNCATION_CONFIG,
    ...config,
  }

  return {
    truncate(
      content: string,
      overrideConfig?: Partial<TruncationConfig>
    ): TruncationResult {
      const cfg = { ...finalConfig, ...overrideConfig }
      const originalTokens = estimateTokens(content)

      // 不需要截断
      if (originalTokens <= cfg.maxOutputTokens) {
        return {
          content,
          truncated: false,
          originalTokens,
          finalTokens: originalTokens,
        }
      }

      const targetTokens = Math.floor(cfg.maxOutputTokens * SAFETY_BUFFER)
      const removedTokens = originalTokens - targetTokens
      const indicator = createIndicator(cfg.truncationIndicator, removedTokens)

      let truncatedContent: string
      switch (cfg.strategy) {
        case "head":
          truncatedContent = truncateHead(content, targetTokens, indicator)
          break
        case "tail":
          truncatedContent = truncateTail(content, targetTokens, indicator)
          break
        case "middle":
        default:
          truncatedContent = truncateMiddle(content, targetTokens, indicator)
          break
      }

      const finalTokens = estimateTokens(truncatedContent)

      return {
        content: truncatedContent,
        truncated: true,
        originalTokens,
        finalTokens,
      }
    },

    truncateFileContent(content: string, filePath: string): TruncationResult {
      const originalTokens = estimateTokens(content)

      if (originalTokens <= finalConfig.maxOutputTokens) {
        return {
          content,
          truncated: false,
          originalTokens,
          finalTokens: originalTokens,
        }
      }

      // 文件内容使用 middle 策略，保留文件头部（可能有重要声明）和尾部
      const targetTokens = Math.floor(finalConfig.maxOutputTokens * SAFETY_BUFFER)
      const removedTokens = originalTokens - targetTokens
      const indicator = `\n... [文件 ${filePath} 已截断: 移除了 ${removedTokens} 个 token] ...\n`

      const truncatedContent = truncateMiddle(content, targetTokens, indicator)
      const finalTokens = estimateTokens(truncatedContent)

      return {
        content: truncatedContent,
        truncated: true,
        originalTokens,
        finalTokens,
      }
    },

    truncateBashOutput(stdout: string, stderr: string): TruncationResult {
      const combined = stderr ? `${stdout}\n[stderr]\n${stderr}` : stdout
      const originalTokens = estimateTokens(combined)

      if (originalTokens <= finalConfig.maxOutputTokens) {
        return {
          content: combined,
          truncated: false,
          originalTokens,
          finalTokens: originalTokens,
        }
      }

      // bash 输出使用 middle 策略，保留开头（命令开始）和结尾（最终结果）
      const targetTokens = Math.floor(finalConfig.maxOutputTokens * SAFETY_BUFFER)
      const removedTokens = originalTokens - targetTokens
      const indicator = `\n... [命令输出已截断: 移除了 ${removedTokens} 个 token] ...\n`

      const truncatedContent = truncateMiddle(combined, targetTokens, indicator)
      const finalTokens = estimateTokens(truncatedContent)

      return {
        content: truncatedContent,
        truncated: true,
        originalTokens,
        finalTokens,
      }
    },

    truncateGrepResults(
      results: GrepMatch[],
      totalMatches: number
    ): TruncationResult {
      // 格式化 grep 结果
      const formatted = results
        .map((r) => `${r.file}:${r.line}: ${r.content}`)
        .join("\n")

      const originalTokens = estimateTokens(formatted)

      if (originalTokens <= finalConfig.maxOutputTokens) {
        const suffix =
          results.length < totalMatches
            ? `\n[显示 ${results.length}/${totalMatches} 个匹配]`
            : ""
        return {
          content: formatted + suffix,
          truncated: false,
          originalTokens,
          finalTokens: originalTokens + estimateTokens(suffix),
        }
      }

      // grep 结果使用 head 策略，保留前面的匹配
      const targetTokens = Math.floor(finalConfig.maxOutputTokens * SAFETY_BUFFER)
      const indicator = `\n... [grep 结果已截断: 共 ${totalMatches} 个匹配，仅显示部分] ...`

      const truncatedContent = truncateHead(formatted, targetTokens, indicator)
      const finalTokens = estimateTokens(truncatedContent)

      return {
        content: truncatedContent,
        truncated: true,
        originalTokens,
        finalTokens,
      }
    },

    truncateJson(json: string): TruncationResult {
      const originalTokens = estimateTokens(json)

      if (originalTokens <= finalConfig.maxOutputTokens) {
        return {
          content: json,
          truncated: false,
          originalTokens,
          finalTokens: originalTokens,
        }
      }

      // 尝试解析 JSON
      let parsed: unknown
      try {
        parsed = JSON.parse(json)
      } catch {
        // 解析失败，回退到普通文本截断
        return this.truncate(json)
      }

      // JSON 截断策略：保留结构，截断值
      const truncatedJson = truncateJsonValue(
        parsed,
        finalConfig.maxOutputTokens
      )
      const truncatedContent = JSON.stringify(truncatedJson, null, 2)
      const finalTokens = estimateTokens(truncatedContent)

      return {
        content: truncatedContent,
        truncated: true,
        originalTokens,
        finalTokens,
      }
    },
  }
}

/**
 * 递归截断 JSON 值
 */
function truncateJsonValue(value: unknown, maxTokens: number): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === "string") {
    const tokens = estimateTokens(value)
    if (tokens > maxTokens / 4) {
      // 单个字符串不应占用超过 1/4 的配额
      const targetLength = Math.floor((maxTokens / 4) * 3) // 粗略估算
      return value.slice(0, targetLength) + "...[truncated]"
    }
    return value
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value
  }

  if (Array.isArray(value)) {
    // 数组：保留前几个元素
    const result: unknown[] = []
    let currentTokens = 10 // 数组结构开销

    for (const item of value) {
      const itemStr = JSON.stringify(item)
      const itemTokens = estimateTokens(itemStr)

      if (currentTokens + itemTokens > maxTokens * 0.8) {
        result.push({ _truncated: `${value.length - result.length} more items` })
        break
      }

      result.push(truncateJsonValue(item, maxTokens / value.length))
      currentTokens += itemTokens
    }

    return result
  }

  if (typeof value === "object") {
    // 对象：保留所有键，截断值
    const obj = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    let currentTokens = 10 // 对象结构开销
    const keys = Object.keys(obj)

    for (const key of keys) {
      const valStr = JSON.stringify(obj[key])
      const valTokens = estimateTokens(valStr)

      if (currentTokens + valTokens > maxTokens * 0.8) {
        result._truncated = `${keys.length - Object.keys(result).length} more keys`
        break
      }

      result[key] = truncateJsonValue(obj[key], maxTokens / keys.length)
      currentTokens += valTokens
    }

    return result
  }

  return value
}

// ============================================================================
// Exports
// ============================================================================

export {
  createIndicator as _createIndicator,
  truncateHead as _truncateHead,
  truncateTail as _truncateTail,
  truncateMiddle as _truncateMiddle,
  truncateJsonValue as _truncateJsonValue,
}
