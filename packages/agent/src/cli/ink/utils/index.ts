/**
 * Ink 工具函数
 *
 * 包含所有工具函数：
 * - colors: ANSI 颜色常量和工具颜色映射
 * - format: 格式化工具（工具输入摘要、字符串截断、时间格式化等）
 */

// 颜色工具
export {
  ANSI,
  Colors,
  toolColors,
  getToolColor,
  defaultTheme,
  statusColors,
  getStatusColor,
  toolIcons,
  getToolIcon,
  statusIcons,
  getStatusIcon,
} from './colors'

// 格式化工具
export {
  truncateString,
  getFileName,
  formatFilePath,
  formatToolInput,
  formatToolCallSummary,
  formatDuration,
  getToolDuration,
  formatToolOutput,
  countOutputLines,
} from './format'
