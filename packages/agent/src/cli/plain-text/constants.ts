/**
 * Plain-text CLI 常量定义
 *
 * 格式常量：符号集、ANSI 色码、折叠阈值
 */

// ============================================================================
// ANSI 颜色（复用 ink/utils/colors.ts 的定义）
// ============================================================================

export const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",

  // 前景色
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  // 亮色
  brightBlack: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",
} as const

// ============================================================================
// 核心符号集（11 个，对标 CC）
// ============================================================================

export const SYMBOLS = {
  SUCCESS: "✓",
  ERROR: "✗",
  WARN: "⚠",
  ARROW: "→",
  NOTIFY: "◉",
  EXPAND: "▼",
  COLLAPSE: "▲",
  TIP: "💡",
  LOCK: "🔒",
  THINKING: "💭",
  PROMPT: ">",
} as const

// ============================================================================
// 语义颜色（消息类型 → ANSI 颜色）
// ============================================================================

export const MSG_COLORS = {
  user_input: ANSI.blue,
  ai_response: ANSI.white,
  ai_thinking: ANSI.brightBlack,
  tool_call: ANSI.yellow,
  tool_result: ANSI.brightBlack,
  tool_error: ANSI.red,
  permission_request: ANSI.blue,
  status: ANSI.brightBlack,
  error: ANSI.red,
  separator: ANSI.brightBlack,
} as const

// ============================================================================
// 工具颜色映射
// ============================================================================

export const TOOL_COLORS: Record<string, string> = {
  read: ANSI.cyan,
  write: ANSI.green,
  edit: ANSI.yellow,
  bash: ANSI.magenta,
  glob: ANSI.blue,
  grep: ANSI.brightBlue,
  run_agent: ANSI.brightCyan,
  ask_llm: ANSI.brightBlue,
  fork_agent: ANSI.brightMagenta,
  web_fetch: ANSI.cyan,
  notebook_edit: ANSI.green,
}

// ============================================================================
// 折叠阈值
// ============================================================================

/** 超过此行数的工具输出自动折叠 */
export const FOLD_LINE_THRESHOLD = 5

/** 长输出默认展示前 N 行摘要 */
export const FOLD_PREVIEW_LINES = 4

/** 折叠内存上限（保留最近 N 条可折叠内容） */
export const FOLD_HISTORY_LIMIT = 100

// ============================================================================
// 滚动缓冲区
// ============================================================================

/** 虚拟滚动每页行数 */
export const SCROLL_PAGE_SIZE = 50

/** 滚动缓冲区最大行数 */
export const SCROLL_BUFFER_MAX = 200

// ============================================================================
// 分隔符
// ============================================================================

/** 分隔线宽度 */
export const SEPARATOR_WIDTH = 50

/** 生成分隔线 */
export function separator(width = SEPARATOR_WIDTH): string {
  return `${ANSI.brightBlack}${"─".repeat(width)}${ANSI.reset}`
}
