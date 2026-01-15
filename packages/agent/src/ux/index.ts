/**
 * UX 模块 - 用户体验增强
 *
 * 包含：
 * - Diff 生成和预览
 * - 操作历史和撤销
 * - 流式输出格式化
 */

// Diff
export {
  generateUnifiedDiff,
  generateFileChange,
  formatDiffForTerminal,
  formatChangeSummary,
  createDiffGenerator,
  type ChangeType,
  type FileChange,
  type DiffOptions,
  type DiffGenerator,
} from "./diff"

// History
export {
  createOperationHistory,
  getGlobalHistory,
  resetGlobalHistory,
  type FileOperation,
  type UndoResult,
  type HistoryConfig,
  type OperationHistory,
} from "./history"

// Output
export {
  createStreamOutput,
  stripAnsi,
  getDisplayWidth,
  truncateToWidth,
  type OutputStyle,
  type OutputConfig,
  type StreamOutput,
} from "./output"
