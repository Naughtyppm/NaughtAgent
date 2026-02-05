/**
 * OutputTruncator 工具输出截断器
 *
 * 负责：
 * - 截断超长的工具输出
 * - 保留头部和尾部内容
 * - 插入截断指示器
 * - 智能截断（在 JSON/代码逻辑边界处截断）
 *
 * 需求: 5.1, 5.2, 5.3, 5.5
 */

// ============================================================================
// Types
// ============================================================================

/**
 * 输出截断器配置
 */
export interface OutputTruncatorConfig {
  /** 最大输出字符数 */
  maxLength: number
  /** 保留头部字符数 */
  headLength: number
  /** 保留尾部字符数 */
  tailLength: number
  /** 是否尝试在逻辑边界截断 */
  smartTruncate: boolean
}

/**
 * 截断结果
 */
export interface TruncationResult {
  /** 截断后的输出 */
  output: string
  /** 是否被截断 */
  truncated: boolean
  /** 原始长度 */
  originalLength: number
  /** 截断后长度 */
  truncatedLength: number
}

/**
 * 输出截断器接口
 */
export interface OutputTruncator {
  /** 截断输出 */
  truncate(output: string, contentType?: string): TruncationResult

  /** 检查是否需要截断 */
  needsTruncation(output: string): boolean
}

// ============================================================================
// Constants
// ============================================================================

/** 默认配置 */
export const DEFAULT_TRUNCATOR_CONFIG: OutputTruncatorConfig = {
  maxLength: 10000,
  headLength: 4000,
  tailLength: 2000,
  smartTruncate: true,
}

/** 截断指示器模板 */
const TRUNCATION_INDICATOR_TEMPLATE =
  "\n\n... [截断: 原始 {originalLength} 字符，已截断 {removed} 字符] ...\n\n"

/** JSON 闭合括号 */
const JSON_CLOSING_BRACKETS = ["]", "}"]

/** 代码语句结尾标记 */
const CODE_STATEMENT_ENDINGS = [";", "}", ")", "]", ",", "\n"]

/** 智能截断搜索范围（字符数） */
const SMART_TRUNCATE_SEARCH_RANGE = 200

// ============================================================================
// Implementation
// ============================================================================

/**
 * 创建输出截断器
 *
 * @param config - 可选的配置覆盖
 * @returns OutputTruncator 实例
 */
export function createOutputTruncator(
  config?: Partial<OutputTruncatorConfig>
): OutputTruncator {
  const finalConfig: OutputTruncatorConfig = {
    ...DEFAULT_TRUNCATOR_CONFIG,
    ...config,
  }

  return {
    truncate: (output: string, contentType?: string) =>
      truncateOutput(output, finalConfig, contentType),
    needsTruncation: (output: string) => checkNeedsTruncation(output, finalConfig),
  }
}

/**
 * 检查是否需要截断
 *
 * 需求 5.1: 当工具结果输出超过可配置限制时截断
 */
function checkNeedsTruncation(output: string, config: OutputTruncatorConfig): boolean {
  return output.length > config.maxLength
}

/**
 * 截断输出
 *
 * 需求 5.1: 截断超过限制的输出
 * 需求 5.2: 保留输出的开头和结尾部分
 * 需求 5.3: 插入摘要指示器，显示总长度和截断点
 * 需求 5.5: 尝试在逻辑边界处截断
 */
function truncateOutput(
  output: string,
  config: OutputTruncatorConfig,
  contentType?: string
): TruncationResult {
  const originalLength = output.length

  // 不需要截断
  if (!checkNeedsTruncation(output, config)) {
    return {
      output,
      truncated: false,
      originalLength,
      truncatedLength: originalLength,
    }
  }

  // 计算截断位置
  let headEnd = config.headLength
  let tailStart = originalLength - config.tailLength

  // 智能截断：尝试在逻辑边界处截断
  if (config.smartTruncate) {
    const detectedType = contentType ?? detectContentType(output)
    headEnd = findSmartHeadEnd(output, headEnd, detectedType)
    tailStart = findSmartTailStart(output, tailStart, detectedType)
  }

  // 确保 headEnd < tailStart，避免重叠
  if (headEnd >= tailStart) {
    // 如果重叠，使用简单截断
    headEnd = config.headLength
    tailStart = originalLength - config.tailLength
  }

  // 构建截断后的输出
  const head = output.slice(0, headEnd)
  const tail = output.slice(tailStart)
  const removed = tailStart - headEnd
  const indicator = buildTruncationIndicator(originalLength, removed)

  const truncatedOutput = head + indicator + tail
  const truncatedLength = truncatedOutput.length

  return {
    output: truncatedOutput,
    truncated: true,
    originalLength,
    truncatedLength,
  }
}

/**
 * 构建截断指示器
 *
 * 需求 5.3: 插入摘要指示器，显示总长度和截断点
 */
function buildTruncationIndicator(originalLength: number, removed: number): string {
  return TRUNCATION_INDICATOR_TEMPLATE.replace("{originalLength}", String(originalLength)).replace(
    "{removed}",
    String(removed)
  )
}

/**
 * 检测内容类型
 *
 * 通过内容特征检测是 JSON、代码还是普通文本
 */
function detectContentType(content: string): string {
  const trimmed = content.trim()

  // 检测 JSON
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return "json"
  }

  // 检测代码（通过常见模式）
  const codePatterns = [
    /^(import|export|const|let|var|function|class|interface|type)\s/m,
    /^(def|class|import|from|async|await)\s/m,
    /^(package|func|type|struct|interface)\s/m,
    /^\s*(public|private|protected|static)\s/m,
  ]

  for (const pattern of codePatterns) {
    if (pattern.test(trimmed)) {
      return "code"
    }
  }

  return "text"
}

/**
 * 查找智能头部截断位置
 *
 * 需求 5.5: 在逻辑边界处截断
 * 在 headEnd 附近向前搜索合适的截断点
 */
function findSmartHeadEnd(output: string, headEnd: number, contentType: string): number {
  // 搜索范围：headEnd 前后 SMART_TRUNCATE_SEARCH_RANGE 字符
  const searchStart = Math.max(0, headEnd - SMART_TRUNCATE_SEARCH_RANGE)
  const searchEnd = Math.min(output.length, headEnd + SMART_TRUNCATE_SEARCH_RANGE)
  const searchRegion = output.slice(searchStart, searchEnd)

  let bestPosition = headEnd

  if (contentType === "json") {
    // JSON: 查找闭合括号后的位置
    bestPosition = findBestBoundary(
      searchRegion,
      searchStart,
      headEnd,
      JSON_CLOSING_BRACKETS,
      true
    )
  } else if (contentType === "code") {
    // 代码: 查找语句结尾
    bestPosition = findBestBoundary(
      searchRegion,
      searchStart,
      headEnd,
      CODE_STATEMENT_ENDINGS,
      true
    )
  } else {
    // 普通文本: 查找换行符
    bestPosition = findBestBoundary(searchRegion, searchStart, headEnd, ["\n"], true)
  }

  return bestPosition
}

/**
 * 查找智能尾部截断位置
 *
 * 需求 5.5: 在逻辑边界处截断
 * 在 tailStart 附近向后搜索合适的截断点
 */
function findSmartTailStart(output: string, tailStart: number, contentType: string): number {
  // 搜索范围：tailStart 前后 SMART_TRUNCATE_SEARCH_RANGE 字符
  const searchStart = Math.max(0, tailStart - SMART_TRUNCATE_SEARCH_RANGE)
  const searchEnd = Math.min(output.length, tailStart + SMART_TRUNCATE_SEARCH_RANGE)
  const searchRegion = output.slice(searchStart, searchEnd)

  let bestPosition = tailStart

  if (contentType === "json") {
    // JSON: 查找开括号前的位置
    bestPosition = findBestBoundary(searchRegion, searchStart, tailStart, ["{", "["], false)
  } else if (contentType === "code") {
    // 代码: 查找语句开头（换行后）
    bestPosition = findBestBoundary(searchRegion, searchStart, tailStart, ["\n"], false)
  } else {
    // 普通文本: 查找换行符
    bestPosition = findBestBoundary(searchRegion, searchStart, tailStart, ["\n"], false)
  }

  return bestPosition
}

/**
 * 在搜索区域内查找最佳边界位置
 *
 * @param searchRegion - 搜索区域字符串
 * @param regionStart - 搜索区域在原始字符串中的起始位置
 * @param targetPosition - 目标位置（在原始字符串中）
 * @param boundaries - 边界字符列表
 * @param searchBackward - 是否向后搜索（用于头部截断）
 * @returns 最佳截断位置（在原始字符串中）
 */
function findBestBoundary(
  searchRegion: string,
  regionStart: number,
  targetPosition: number,
  boundaries: string[],
  searchBackward: boolean
): number {
  const relativeTarget = targetPosition - regionStart
  let bestRelativePosition = relativeTarget
  let bestDistance = Infinity

  for (const boundary of boundaries) {
    if (searchBackward) {
      // 向后搜索：从目标位置向前找
      let pos = searchRegion.lastIndexOf(boundary, relativeTarget)
      while (pos !== -1) {
        const distance = relativeTarget - pos
        // 选择最接近目标位置的边界
        if (distance < bestDistance && distance >= 0) {
          bestDistance = distance
          // 截断位置在边界字符之后
          bestRelativePosition = pos + boundary.length
        }
        // 继续向前搜索
        pos = searchRegion.lastIndexOf(boundary, pos - 1)
      }
    } else {
      // 向前搜索：从目标位置向后找
      let pos = searchRegion.indexOf(boundary, relativeTarget)
      while (pos !== -1 && pos < searchRegion.length) {
        const distance = pos - relativeTarget
        // 选择最接近目标位置的边界
        if (distance < bestDistance && distance >= 0) {
          bestDistance = distance
          // 截断位置在边界字符处（不包含边界）
          bestRelativePosition = pos
        }
        // 继续向后搜索
        pos = searchRegion.indexOf(boundary, pos + 1)
      }
    }
  }

  // 如果没找到合适的边界，返回原始目标位置
  if (bestDistance === Infinity) {
    return targetPosition
  }

  return regionStart + bestRelativePosition
}

