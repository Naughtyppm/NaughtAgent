/**
 * Tool 工具系统
 *
 * 提供 Agent 与文件系统、命令行交互的能力
 */

// 核心定义
export { Tool, TOOL_TIMEOUTS, DEFAULT_TIMEOUT, getToolTimeout } from "./tool"
export { ToolRegistry, ToolRegistryCompat, type TruncationOptions } from "./registry"

// 工具执行包装器
export {
  withToolWrapper,
  defineWithWrapper,
  TimeoutError,
  type ToolExecutionStats,
  type WrapperOptions,
} from "./wrapper"

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

// 子代理工具
export {
  AskLlmTool,
  RunAgentTool,
  ForkAgentTool,
  RunWorkflowTool,
  ParallelAgentsTool,
  MultiAgentTool,
  TaskTool,
  registerSubagentTools,
  updateParentContext,
  SUBAGENT_TOOL_IDS,
  type SubagentToolId,
} from "./subagent"

// 注册所有内置工具
import { ToolRegistryCompat as ToolRegistry } from "./registry"
import { ReadTool } from "./read"
import { WriteTool } from "./write"
import { AppendTool } from "./append"
import { EditTool } from "./edit"
import { BashTool } from "./bash"
import { GlobTool } from "./glob"
import { GrepTool } from "./grep"
import { LoadSkillTool } from "./load-skill"
import { MemoryTool } from "./memory"

export function registerBuiltinTools(): void {
  ToolRegistry.register(ReadTool)
  ToolRegistry.register(WriteTool)
  ToolRegistry.register(AppendTool)
  ToolRegistry.register(EditTool)
  ToolRegistry.register(BashTool)
  ToolRegistry.register(GlobTool)
  ToolRegistry.register(GrepTool)
  ToolRegistry.register(LoadSkillTool)
  ToolRegistry.register(MemoryTool)
}
