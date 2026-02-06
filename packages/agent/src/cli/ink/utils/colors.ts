/**
 * ANSI 颜色常量和工具颜色映射
 *
 * 定义终端 UI 使用的颜色常量，包括：
 * - ANSI 颜色代码
 * - 工具类型颜色映射
 * - 颜色主题
 */

import type { ColorTheme, ToolName } from '../types'

// ============================================================================
// ANSI 颜色代码
// ============================================================================

/**
 * ANSI 颜色代码常量
 * 用于终端文本着色
 */
export const ANSI = {
  // 重置
  reset: '\x1b[0m',

  // 基础颜色
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // 亮色
  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // 背景色
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',

  // 样式
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  inverse: '\x1b[7m',
  strikethrough: '\x1b[9m',
} as const

// ============================================================================
// 颜色名称（用于 Ink 组件的 color prop）
// ============================================================================

/**
 * Ink 支持的颜色名称
 * 这些颜色可以直接用于 Ink 组件的 color 属性
 */
export const Colors = {
  // 基础颜色
  black: 'black',
  red: 'red',
  green: 'green',
  yellow: 'yellow',
  blue: 'blue',
  magenta: 'magenta',
  cyan: 'cyan',
  white: 'white',

  // 亮色（使用 bright 前缀）
  gray: 'gray',
  grey: 'grey',

  // 特殊颜色
  redBright: 'redBright',
  greenBright: 'greenBright',
  yellowBright: 'yellowBright',
  blueBright: 'blueBright',
  magentaBright: 'magentaBright',
  cyanBright: 'cyanBright',
  whiteBright: 'whiteBright',
} as const

// ============================================================================
// 工具颜色映射
// ============================================================================

/**
 * 工具类型对应的颜色
 * 用于在 UI 中区分不同类型的工具调用
 */
export const toolColors: Record<ToolName, string> = {
  read: 'cyan',
  write: 'green',
  edit: 'yellow',
  bash: 'magenta',
  glob: 'blue',
  grep: 'blueBright',
  // 子 Agent 工具
  run_agent: 'cyanBright',
  ask_llm: 'blueBright',
  fork_agent: 'magentaBright',
  parallel_agents: 'yellowBright',
  multi_agent: 'greenBright',
  run_workflow: 'cyan',
}

/**
 * 获取工具对应的颜色
 * @param toolName 工具名称
 * @returns 颜色名称
 */
export function getToolColor(toolName: ToolName | string): string {
  return toolColors[toolName as ToolName] ?? 'white'
}

// ============================================================================
// 颜色主题
// ============================================================================

/**
 * 默认颜色主题
 * 定义 UI 各种语义颜色
 */
export const defaultTheme: ColorTheme = {
  primary: 'cyan',
  secondary: 'blue',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  info: 'blueBright',
  muted: 'gray',
}

/**
 * 工具状态颜色
 */
export const statusColors = {
  pending: 'gray',
  running: 'cyan',
  completed: 'green',
  error: 'red',
} as const

/**
 * 获取状态对应的颜色
 * @param status 工具状态
 * @returns 颜色名称
 */
export function getStatusColor(status: keyof typeof statusColors): string {
  return statusColors[status]
}

// ============================================================================
// 工具图标
// ============================================================================

/**
 * 工具类型对应的图标
 */
export const toolIcons: Record<ToolName, string> = {
  read: '📖',
  write: '✏️',
  edit: '🔧',
  bash: '💻',
  glob: '🔍',
  grep: '🔎',
  // 子 Agent 工具
  run_agent: '🤖',
  ask_llm: '💬',
  fork_agent: '🔀',
  parallel_agents: '⚡',
  multi_agent: '👥',
  run_workflow: '📋',
}

/**
 * 获取工具对应的图标
 * @param toolName 工具名称
 * @returns 图标字符
 */
export function getToolIcon(toolName: ToolName | string): string {
  return toolIcons[toolName as ToolName] ?? '🔧'
}

/**
 * 状态图标
 */
export const statusIcons = {
  pending: '○',
  running: '◐',
  completed: '✓',
  error: '✗',
} as const

/**
 * 获取状态对应的图标
 * @param status 工具状态
 * @returns 图标字符
 */
export function getStatusIcon(status: keyof typeof statusIcons): string {
  return statusIcons[status]
}
