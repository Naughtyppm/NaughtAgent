/**
 * Plain-text CLI 格式化引擎
 *
 * 将 RunnerEventHandlers 事件转换为带颜色、前缀、缩进的终端文本
 */

import { ANSI, SYMBOLS, TOOL_COLORS, FOLD_LINE_THRESHOLD, separator } from "./constants"
import { VERSION } from "../../config/constants"

// ============================================================================
// 颜色辅助
// ============================================================================

/** 给文本添加颜色 */
export function colorize(text: string, color: string): string {
  return `${color}${text}${ANSI.reset}`
}

/** 加粗 */
export function bold(text: string): string {
  return `${ANSI.bold}${text}${ANSI.reset}`
}

/** 暗淡 */
export function dim(text: string): string {
  return `${ANSI.dim}${text}${ANSI.reset}`
}

// ============================================================================
// 工具输出摘要生成
// ============================================================================

/** 生成工具结果的一行摘要 */
export function toolResultSummary(toolName: string, output: string, isError?: boolean): string {
  const icon = isError ? SYMBOLS.ERROR : SYMBOLS.SUCCESS
  const color = isError ? ANSI.red : ANSI.green
  const lines = output.split("\n")
  const lineCount = lines.length

  // 根据工具类型生成摘要
  let summary: string
  switch (toolName) {
    case "read":
      summary = `Read: ${lineCount} lines loaded`
      break
    case "glob":
      summary = `Glob: Listed ${lineCount} files`
      break
    case "grep":
      summary = `Grep: Found ${lineCount} matches`
      break
    case "bash":
      summary = lineCount > 1 ? `Bash: ${lineCount} lines output` : `Bash: ${lines[0]?.slice(0, 60) || "done"}`
      break
    case "edit":
      summary = "Edit: Modified successfully"
      break
    case "write":
      summary = "Write: File created"
      break
    case "web_fetch":
      summary = `WebFetch: ${lineCount} lines fetched`
      break
    default:
      summary = `${toolName}: ${lineCount > 1 ? `${lineCount} lines` : lines[0]?.slice(0, 60) || "done"}`
  }

  return `${color}${icon}${ANSI.reset} ${dim(summary)}`
}

// ============================================================================
// 消息格式化
// ============================================================================

/** 格式化用户输入标识 */
export function formatUserInput(content: string): string {
  return `\n${colorize("═══ Me ═══", ANSI.green)}\n${content}`
}

/** 格式化 AI 响应头 */
export function formatAiHeader(model?: string): string {
  const name = model ? model.split("-").slice(0, 2).join("-") : "Claude"
  return `${colorize(`═══ ${name} ═══`, ANSI.cyan)}`
}

/** 格式化思考开始 */
export function formatThinkingStart(): string {
  return `${colorize(`╭─ ${SYMBOLS.THINKING} thinking ─────────────────────────╮`, ANSI.magenta)}`
}

/** 格式化思考结束 */
export function formatThinkingEnd(): string {
  return `${colorize("╰──────────────────────────────────────────╯", ANSI.magenta)}`
}

/** 格式化工具调用开始 */
export function formatToolStart(toolName: string, input: unknown): string {
  const toolColor = TOOL_COLORS[toolName] || ANSI.yellow
  const header = `\n${colorize(SYMBOLS.ARROW, toolColor)} ${colorize(`调用: ${toolName}`, toolColor)}`

  // 提取关键参数显示
  const params = formatToolParams(toolName, input)
  if (params) {
    return `${header}\n${params}`
  }
  return header
}

/** 格式化工具参数（每个工具的关键参数） */
function formatToolParams(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return ""
  const obj = input as Record<string, unknown>
  const parts: string[] = []

  switch (toolName) {
    case "read":
      if (obj.file_path) parts.push(`  ${dim("文件:")} ${obj.file_path}`)
      if (obj.offset) parts.push(`  ${dim("偏移:")} ${obj.offset}`)
      break
    case "write":
      if (obj.file_path) parts.push(`  ${dim("文件:")} ${obj.file_path}`)
      break
    case "edit":
      if (obj.file_path) parts.push(`  ${dim("文件:")} ${obj.file_path}`)
      break
    case "bash":
      if (obj.command) parts.push(`  ${dim("$")} ${String(obj.command).slice(0, 120)}`)
      break
    case "glob":
      if (obj.pattern) parts.push(`  ${dim("模式:")} ${obj.pattern}`)
      if (obj.path) parts.push(`  ${dim("目录:")} ${obj.path}`)
      break
    case "grep":
      if (obj.pattern) parts.push(`  ${dim("模式:")} ${obj.pattern}`)
      if (obj.path) parts.push(`  ${dim("目录:")} ${obj.path}`)
      break
    default: {
      // 通用：显示前 3 个字段
      const entries = Object.entries(obj).slice(0, 3)
      for (const [k, v] of entries) {
        const val = typeof v === "string" ? v.slice(0, 80) : JSON.stringify(v)?.slice(0, 80)
        parts.push(`  ${dim(`${k}:`)} ${val}`)
      }
    }
  }

  return parts.join("\n")
}

/** 格式化工具完成（摘要行） */
export function formatToolEnd(toolName: string, output: string, isError?: boolean): string {
  return `  ${toolResultSummary(toolName, output, isError)}`
}

/** 格式化错误 */
export function formatError(error: Error | string): string {
  const msg = typeof error === "string" ? error : error.message
  return `\n${colorize(SYMBOLS.ERROR, ANSI.red)} ${colorize(`错误: ${msg}`, ANSI.red)}`
}

/** 格式化权限请求 */
export function formatPermissionRequest(type: string, resource: string, description?: string): string {
  const desc = description || `${type}: ${resource}`
  return `\n${colorize(SYMBOLS.LOCK, ANSI.blue)} ${colorize(`权限请求: ${desc}`, ANSI.blue)}`
}

/** 格式化 Token 使用统计 */
export function formatTokenUsage(usage: {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens?: number
  cacheReadTokens?: number
}): string {
  let line = `\n${dim(`📊 Token: ${usage.inputTokens} 输入 / ${usage.outputTokens} 输出`)}`
  if (usage.cacheReadTokens || usage.cacheCreationTokens) {
    line += dim(` | Cache: ${usage.cacheReadTokens || 0} 命中 / ${usage.cacheCreationTokens || 0} 写入`)
  }
  return line
}

/** 格式化欢迎头（对标 CC + NA Ink 版风格） */
export function formatWelcome(model: string, cwd: string, agent: string): string {
  const cat = [
    `${ANSI.cyan}  /\\_/\\${ANSI.reset}`,
    `${ANSI.cyan} ( o.o )${ANSI.reset}  ${bold("NaughtyAgent")} ${dim(`v${VERSION}`)}`,
    `${ANSI.cyan}  > ^ <${ANSI.reset}   ${dim(`${agent}`)} ${dim("·")} ${colorize(model, ANSI.brightCyan)}`,
  ]
  const lines = [
    separator(),
    ...cat,
    `         ${dim(`📁 ${cwd}`)}`,
    separator(),
    dim(`输入问题开始对话。/help 查看命令。Ctrl+C 退出。`),
    "",
  ]
  return lines.join("\n")
}

/** 判断内容是否应该折叠 */
export function shouldFold(content: string): boolean {
  return content.split("\n").length > FOLD_LINE_THRESHOLD
}
