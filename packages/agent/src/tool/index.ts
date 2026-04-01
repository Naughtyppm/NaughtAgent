/**
 * Tool 工具系统
 *
 * 提供 Agent 与文件系统、命令行交互的能力
 */

// 核心定义
export { Tool, TOOL_TIMEOUTS, DEFAULT_TIMEOUT, getToolTimeout } from "./tool"
export { ToolRegistry, ToolRegistryCompat, type TruncationOptions } from "./registry"

// Schema 转换
export {
  jsonSchemaToZod,
  safeJsonSchemaToZod,
  validateJsonSchemaSupport,
} from "./schema-converter"
export { parseJsonSchema, validateSchemaSupport } from "./json-schema-parser"

// 工具发现服务
export {
  ToolDiscoveryService,
  createToolDiscoveryService,
  type DiscoveryStats,
  type DiscoveryOptions,
  type PaginationOptions,
  type HotReloadCleanup,
} from "./discovery"

// 输出截断器
export {
  createOutputTruncator,
  DEFAULT_TRUNCATOR_CONFIG,
  type OutputTruncator,
  type OutputTruncatorConfig,
  type TruncationResult,
} from "./output-truncator"

// 内置工具
export { ReadTool, clearReadCache } from "./read"
export { WriteTool } from "./write"
export { AppendTool } from "./append"
export { EditTool } from "./edit"
export { BashTool } from "./bash"
export { GlobTool } from "./glob"
export { GrepTool } from "./grep"
export { LoadSkillTool } from "./load-skill"
export { MemoryTool } from "./memory"
export { NotebookEditTool } from "./notebook-edit"
export { WebFetchTool } from "./web-fetch"
export { EnterPlanModeTool, ExitPlanModeTool, isPlanMode } from "./plan-mode"

// 后台任务工具
export {
  TaskOutputTool,
  TaskStopTool,
  registerBackgroundTask,
  updateBackgroundTask,
  appendTaskOutput,
  getBackgroundTask,
  getAllBackgroundTasks,
  type BackgroundTask,
} from "./background-task"

// Cron 定时任务工具
export {
  CronCreateTool,
  CronDeleteTool,
  CronListTool,
  setCronFireCallback,
  getAllCronJobs,
  startCronScheduler,
  stopCronScheduler,
  clearAllCronJobs,
  type CronJob,
  type CronFireEvent,
} from "./cron"

// MCP 资源工具
export {
  ListMcpResourcesTool,
  ReadMcpResourceTool,
} from "./mcp-resource"

// 子代理工具
export {
  AskLlmTool,
  RunAgentTool,
  ForkAgentTool,
  TaskTool,
  registerSubagentTools,
  updateParentContext,
  SUBAGENT_TOOL_IDS,
  type SubagentToolId,
} from "./subagent"
