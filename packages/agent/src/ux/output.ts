/**
 * 流式输出格式化
 *
 * 负责：
 * - 格式化终端输出
 * - 工具调用显示
 * - 进度指示
 */

import { formatDiffForTerminal } from "./diff"

// ============================================================================
// Types
// ============================================================================

/**
 * 输出样式
 */
export interface OutputStyle {
  /** 文本颜色 */
  color?: "red" | "green" | "yellow" | "blue" | "cyan" | "magenta" | "white" | "gray"
  /** 是否加粗 */
  bold?: boolean
  /** 是否暗淡 */
  dim?: boolean
}

/**
 * 输出配置
 */
export interface OutputConfig {
  /** 是否使用颜色 */
  useColors?: boolean
  /** 输出流 */
  stream?: NodeJS.WritableStream
  /** 是否显示时间戳 */
  showTimestamp?: boolean
}

/**
 * 流式输出器接口
 */
export interface StreamOutput {
  /** 写入文本 */
  write(content: string, style?: OutputStyle): void

  /** 写入一行 */
  writeLine(content: string, style?: OutputStyle): void

  /** 写入 diff（带颜色） */
  writeDiff(diff: string): void

  /** 清除当前行 */
  clearLine(): void

  /** 写入工具调用开始 */
  writeToolStart(name: string, input: unknown): void

  /** 写入工具调用结束 */
  writeToolEnd(name: string, output: string, isError?: boolean): void

  /** 写入权限请求 */
  writePermissionRequest(type: string, resource: string, preview?: string): void

  /** 写入分隔线 */
  writeSeparator(): void

  /** 写入空行 */
  writeNewLine(): void
}

// ============================================================================
// ANSI Colors
// ============================================================================

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",

  // 前景色
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  // 控制
  clearLine: "\x1b[2K",
  cursorUp: "\x1b[1A",
  cursorStart: "\r",
}

// ============================================================================
// Box Drawing Characters
// ============================================================================

const BOX = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
  verticalRight: "├",
  verticalLeft: "┤",
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * 创建流式输出器
 */
export function createStreamOutput(config: OutputConfig = {}): StreamOutput {
  const { useColors = true, stream = process.stdout } = config

  /**
   * 应用样式
   */
  function applyStyle(content: string, style?: OutputStyle): string {
    if (!useColors || !style) {
      return content
    }

    let result = ""

    if (style.bold) result += ANSI.bold
    if (style.dim) result += ANSI.dim
    if (style.color) result += ANSI[style.color]

    result += content

    if (style.bold || style.dim || style.color) {
      result += ANSI.reset
    }

    return result
  }

  /**
   * 写入文本
   */
  function write(content: string, style?: OutputStyle): void {
    stream.write(applyStyle(content, style))
  }

  /**
   * 写入一行
   */
  function writeLine(content: string, style?: OutputStyle): void {
    stream.write(applyStyle(content, style) + "\n")
  }

  /**
   * 写入 diff
   */
  function writeDiff(diff: string): void {
    const formatted = formatDiffForTerminal(diff, useColors)
    // 添加缩进
    const indented = formatted
      .split("\n")
      .map((line) => `${BOX.vertical}  ${line}`)
      .join("\n")
    stream.write(indented + "\n")
  }

  /**
   * 清除当前行
   */
  function clearLine(): void {
    stream.write(ANSI.cursorStart + ANSI.clearLine)
  }

  /**
   * 写入工具调用开始
   */
  function writeToolStart(name: string, input: unknown): void {
    const toolColor = useColors ? ANSI.cyan + ANSI.bold : ""
    const reset = useColors ? ANSI.reset : ""
    const dim = useColors ? ANSI.dim : ""

    // 工具名称
    stream.write(`${BOX.topLeft}${BOX.horizontal} ${toolColor}${name}${reset}`)

    // 简化的输入显示
    const inputStr = formatToolInput(name, input)
    if (inputStr) {
      stream.write(` ${dim}${inputStr}${reset}`)
    }

    stream.write("\n")
  }

  /**
   * 写入工具调用结束
   */
  function writeToolEnd(_name: string, output: string, isError?: boolean): void {
    const icon = isError ? "✗" : "✓"
    const iconColor = isError ? ANSI.red : ANSI.green
    const reset = useColors ? ANSI.reset : ""
    const dim = useColors ? ANSI.dim : ""

    // 输出内容（截断长输出）
    const lines = output.split("\n")
    const maxLines = 10
    const truncated = lines.length > maxLines

    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
      const line = lines[i]
      const truncatedLine = line.length > 100 ? line.substring(0, 100) + "..." : line
      stream.write(`${BOX.vertical}  ${dim}${truncatedLine}${reset}\n`)
    }

    if (truncated) {
      stream.write(`${BOX.vertical}  ${dim}... (${lines.length - maxLines} more lines)${reset}\n`)
    }

    // 结束行
    const iconStr = useColors ? `${iconColor}${icon}${reset}` : icon
    stream.write(`${BOX.bottomLeft}${BOX.horizontal} ${iconStr}\n`)
  }

  /**
   * 写入权限请求
   */
  function writePermissionRequest(type: string, resource: string, preview?: string): void {
    const yellow = useColors ? ANSI.yellow : ""
    const blue = useColors ? ANSI.blue : ""
    const reset = useColors ? ANSI.reset : ""
    const bold = useColors ? ANSI.bold : ""

    stream.write(`\n${yellow}${bold}Permission Required${reset}\n`)
    stream.write(`${BOX.vertical} Type: ${type}\n`)
    stream.write(`${BOX.vertical} Resource: ${blue}${resource}${reset}\n`)

    if (preview) {
      stream.write(`${BOX.vertical}\n`)
      writeDiff(preview)
    }

    stream.write(`${BOX.vertical}\n`)
    stream.write(`${BOX.bottomLeft}${BOX.horizontal} Allow? [y/N] `)
  }

  /**
   * 写入分隔线
   */
  function writeSeparator(): void {
    const dim = useColors ? ANSI.dim : ""
    const reset = useColors ? ANSI.reset : ""
    stream.write(`${dim}${"─".repeat(60)}${reset}\n`)
  }

  /**
   * 写入空行
   */
  function writeNewLine(): void {
    stream.write("\n")
  }

  return {
    write,
    writeLine,
    writeDiff,
    clearLine,
    writeToolStart,
    writeToolEnd,
    writePermissionRequest,
    writeSeparator,
    writeNewLine,
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * 格式化工具输入用于显示
 */
function formatToolInput(toolName: string, input: unknown): string {
  const obj = input as Record<string, unknown>

  switch (toolName) {
    case "read":
      return String(obj.filePath || obj.file_path || "")
    case "write":
      return String(obj.filePath || obj.file_path || "")
    case "edit":
      return String(obj.filePath || obj.file_path || "")
    case "bash":
      const cmd = String(obj.command || "")
      return cmd.length > 50 ? cmd.substring(0, 50) + "..." : cmd
    case "glob":
      return String(obj.pattern || "")
    case "grep":
      return `"${obj.pattern}" in ${obj.path || "."}`
    default:
      return ""
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 去除 ANSI 颜色代码
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "")
}

/**
 * 计算字符串显示宽度（考虑中文等宽字符）
 */
export function getDisplayWidth(str: string): number {
  const stripped = stripAnsi(str)
  let width = 0

  for (const char of stripped) {
    const code = char.charCodeAt(0)
    // 简单判断：CJK 字符占 2 个宽度
    if (code >= 0x4e00 && code <= 0x9fff) {
      width += 2
    } else {
      width += 1
    }
  }

  return width
}

/**
 * 截断字符串到指定显示宽度
 */
export function truncateToWidth(str: string, maxWidth: number): string {
  const stripped = stripAnsi(str)
  let width = 0
  let result = ""

  for (const char of stripped) {
    const code = char.charCodeAt(0)
    const charWidth = code >= 0x4e00 && code <= 0x9fff ? 2 : 1

    if (width + charWidth > maxWidth - 3) {
      return result + "..."
    }

    result += char
    width += charWidth
  }

  return result
}
