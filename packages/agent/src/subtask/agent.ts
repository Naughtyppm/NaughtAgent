/**
 * Agent 模式 - 子 Agent Loop
 *
 * @deprecated 此文件已重命名为 run-agent.ts，请使用新的导入路径
 *
 * 最灵活的子任务模式：
 * - 完整的 Agent Loop
 * - LLM 自主选择工具
 * - 支持最大步数限制
 * - 可中止
 */

// 重新导出新模块的内容，保持向后兼容
export { runRunAgent as runAgentTask, type RunAgentRuntime as AgentModeRuntime } from "./run-agent"
export type { RunAgentConfig as AgentTaskConfig } from "./types"
