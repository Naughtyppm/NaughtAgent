/**
 * 格式化工具函数
 *
 * 提供工具输入摘要格式化、字符串截断、时间格式化等功能
 */

import type {
  ToolCall,
  ToolInput,
  ToolName,
  ReadToolInput,
  WriteToolInput,
  EditToolInput,
  BashToolInput,
  GlobToolInput,
  GrepToolInput,
  FormatToolInputOptions,
} from '../types'

// ============================================================================
// 默认配置
// ============================================================================

/** 默认最大长度 */
const DEFAULT_MAX_LENGTH = 50

/** 默认截断后缀 */
const DEFAULT_ELLIPSIS = '...'

// ============================================================================
// 字符串工具函数
// ============================================================================

/**
 * 截断长字符串
 *
 * @param str 要截断的字符串
 * @param maxLength 最大长度（默认 50）
 * @param ellipsis 截断后缀（默认 '...'）
 * @returns 截断后的字符串
 *
 * @example
 * truncateString('hello world', 8) // 'hello...'
 * truncateString('short', 10) // 'short'
 */
export function truncateString(
  str: string,
  maxLength: number = DEFAULT_MAX_LENGTH,
  ellipsis: string = DEFAULT_ELLIPSIS
): string {
  if (!str) return ''
  if (maxLength <= 0) return ''
  if (str.length <= maxLength) return str

  // 确保截断后的字符串加上省略号不超过 maxLength
  const truncateAt = maxLength - ellipsis.length
  if (truncateAt <= 0) {
    return ellipsis.slice(0, maxLength)
  }

  return str.slice(0, truncateAt) + ellipsis
}

/**
 * 获取文件名（从路径中提取）
 *
 * @param filePath 文件路径
 * @returns 文件名
 *
 * @example
 * getFileName('/path/to/file.ts') // 'file.ts'
 * getFileName('file.ts') // 'file.ts'
 */
export function getFileName(filePath: string): string {
  if (!filePath) return ''
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] || filePath
}

/**
 * 格式化文件路径显示
 *
 * @param filePath 文件路径
 * @param showFullPath 是否显示完整路径
 * @param maxLength 最大长度
 * @returns 格式化后的路径
 */
export function formatFilePath(
  filePath: string,
  showFullPath: boolean = false,
  maxLength: number = DEFAULT_MAX_LENGTH
): string {
  if (!filePath) return ''

  if (showFullPath) {
    return truncateString(filePath, maxLength)
  }

  // 如果路径较短，直接显示
  if (filePath.length <= maxLength) {
    return filePath
  }

  // 尝试显示文件名
  const fileName = getFileName(filePath)
  if (fileName.length <= maxLength) {
    return fileName
  }

  return truncateString(fileName, maxLength)
}

// ============================================================================
// 工具输入格式化
// ============================================================================

/**
 * 格式化 read 工具输入
 */
function formatReadInput(input: ReadToolInput, options: FormatToolInputOptions): string {
  const { maxLength = DEFAULT_MAX_LENGTH, showFullPath = false } = options
  const path = formatFilePath(input.filePath, showFullPath, maxLength)

  if (input.startLine !== undefined && input.endLine !== undefined) {
    return `${path} (L${input.startLine}-${input.endLine})`
  }
  if (input.startLine !== undefined) {
    return `${path} (from L${input.startLine})`
  }

  return path
}

/**
 * 格式化 write 工具输入
 */
function formatWriteInput(input: WriteToolInput, options: FormatToolInputOptions): string {
  const { maxLength = DEFAULT_MAX_LENGTH, showFullPath = false } = options
  return formatFilePath(input.filePath, showFullPath, maxLength)
}

/**
 * 格式化 edit 工具输入
 */
function formatEditInput(input: EditToolInput, options: FormatToolInputOptions): string {
  const { maxLength = DEFAULT_MAX_LENGTH, showFullPath = false } = options
  return formatFilePath(input.filePath, showFullPath, maxLength)
}

/**
 * 格式化 bash 工具输入
 */
function formatBashInput(input: BashToolInput, options: FormatToolInputOptions): string {
  const { maxLength = DEFAULT_MAX_LENGTH } = options
  let command = input.command || ''

  // 移除多余的空白字符
  command = command.trim().replace(/\s+/g, ' ')

  return truncateString(command, maxLength)
}

/**
 * 格式化 glob 工具输入
 */
function formatGlobInput(input: GlobToolInput, options: FormatToolInputOptions): string {
  const { maxLength = DEFAULT_MAX_LENGTH } = options
  const pattern = input.pattern || ''

  if (input.cwd) {
    const combined = `${input.cwd}/${pattern}`
    return truncateString(combined, maxLength)
  }

  return truncateString(pattern, maxLength)
}

/**
 * 格式化 grep 工具输入
 */
function formatGrepInput(input: GrepToolInput, options: FormatToolInputOptions): string {
  const { maxLength = DEFAULT_MAX_LENGTH } = options
  const pattern = input.pattern || ''
  const path = input.path || '.'

  // 格式: "pattern" in path
  const formatted = `"${pattern}" in ${path}`
  return truncateString(formatted, maxLength)
}

/**
 * 格式化通用工具输入（未知类型）
 */
function formatGenericInput(input: Record<string, unknown>, options: FormatToolInputOptions): string {
  const { maxLength = DEFAULT_MAX_LENGTH } = options

  // 尝试提取常见字段
  const filePath = input.filePath || input.path || input.file
  if (typeof filePath === 'string') {
    return formatFilePath(filePath, false, maxLength)
  }

  const command = input.command || input.cmd
  if (typeof command === 'string') {
    return truncateString(command, maxLength)
  }

  const pattern = input.pattern
  if (typeof pattern === 'string') {
    return truncateString(pattern, maxLength)
  }

  // 回退：显示 JSON 摘要
  try {
    const json = JSON.stringify(input)
    return truncateString(json, maxLength)
  } catch {
    return '[complex input]'
  }
}

/**
 * 根据工具类型格式化输入摘要
 *
 * @param toolName 工具名称
 * @param input 工具输入
 * @param options 格式化选项
 * @returns 格式化后的输入摘要
 *
 * @example
 * formatToolInput('read', { filePath: '/path/to/file.ts' })
 * // 'file.ts'
 *
 * formatToolInput('bash', { command: 'npm install' })
 * // 'npm install'
 *
 * formatToolInput('grep', { pattern: 'TODO', path: 'src' })
 * // '"TODO" in src'
 */
export function formatToolInput(
  toolName: ToolName | string,
  input: ToolInput,
  options: FormatToolInputOptions = {}
): string {
  switch (toolName) {
    case 'read':
      return formatReadInput(input as ReadToolInput, options)
    case 'write':
      return formatWriteInput(input as WriteToolInput, options)
    case 'edit':
      return formatEditInput(input as EditToolInput, options)
    case 'bash':
      return formatBashInput(input as BashToolInput, options)
    case 'glob':
      return formatGlobInput(input as GlobToolInput, options)
    case 'grep':
      return formatGrepInput(input as GrepToolInput, options)
    default:
      return formatGenericInput(input as Record<string, unknown>, options)
  }
}

/**
 * 格式化工具调用摘要（包含工具名和输入）
 *
 * @param tool 工具调用对象
 * @param options 格式化选项
 * @returns 格式化后的摘要
 */
export function formatToolCallSummary(
  tool: ToolCall,
  options: FormatToolInputOptions = {}
): string {
  const inputSummary = formatToolInput(tool.name, tool.input, options)
  return `${tool.displayName}: ${inputSummary}`
}

// ============================================================================
// 时间格式化
// ============================================================================

/**
 * 格式化执行时间
 *
 * @param durationMs 持续时间（毫秒）
 * @returns 格式化后的时间字符串
 *
 * @example
 * formatDuration(500) // '500ms'
 * formatDuration(1500) // '1.5s'
 * formatDuration(65000) // '1m 5s'
 * formatDuration(3665000) // '1h 1m 5s'
 */
export function formatDuration(durationMs: number): string {
  if (durationMs < 0) return '0ms'
  if (durationMs === 0) return '0ms'

  const ms = Math.round(durationMs)

  // 小于 1 秒，显示毫秒
  if (ms < 1000) {
    return `${ms}ms`
  }

  // 小于 1 分钟，显示秒（保留一位小数）
  if (ms < 60000) {
    const seconds = ms / 1000
    // 如果是整数秒，不显示小数
    if (Number.isInteger(seconds)) {
      return `${seconds}s`
    }
    return `${seconds.toFixed(1)}s`
  }

  // 小于 1 小时，显示分钟和秒
  if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.round((ms % 60000) / 1000)
    if (seconds === 0) {
      return `${minutes}m`
    }
    return `${minutes}m ${seconds}s`
  }

  // 大于等于 1 小时，显示小时、分钟和秒
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  const seconds = Math.round((ms % 60000) / 1000)

  const parts: string[] = [`${hours}h`]
  if (minutes > 0 || seconds > 0) {
    parts.push(`${minutes}m`)
  }
  if (seconds > 0) {
    parts.push(`${seconds}s`)
  }

  return parts.join(' ')
}

/**
 * 计算工具执行时间
 *
 * @param tool 工具调用对象
 * @returns 格式化后的执行时间，如果未完成返回 null
 */
export function getToolDuration(tool: ToolCall): string | null {
  if (!tool.endTime) return null
  const duration = tool.endTime - tool.startTime
  return formatDuration(duration)
}

// ============================================================================
// 输出格式化
// ============================================================================

/**
 * 格式化工具输出摘要
 *
 * @param output 工具输出
 * @param maxLength 最大长度
 * @returns 格式化后的输出摘要
 */
export function formatToolOutput(output: string | undefined, maxLength: number = 100): string {
  if (!output) return ''

  // 移除 ANSI 转义序列
  const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '')

  // 获取第一行
  const firstLine = cleanOutput.split('\n')[0] || ''

  return truncateString(firstLine.trim(), maxLength)
}

/**
 * 计算输出行数
 *
 * @param output 工具输出
 * @returns 行数
 */
export function countOutputLines(output: string | undefined): number {
  if (!output) return 0
  return output.split('\n').length
}
