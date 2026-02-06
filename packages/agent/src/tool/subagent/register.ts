/**
 * 子代理工具注册
 * 
 * 提供统一的注册入口，配置所有子代理工具的运行时
 */

import { ToolRegistry } from "../registry"
import { AskLlmTool, setAskLlmProvider } from "./ask-llm-tool"
import { RunAgentTool, setRunAgentRuntime } from "./run-agent-tool"
import { ForkAgentTool, setForkAgentRuntime, setForkAgentParentContext } from "./fork-agent-tool"
import { RunWorkflowTool, setRunWorkflowRuntime } from "./run-workflow-tool"
import { ParallelAgentsTool, setParallelAgentsRuntime, setParallelAgentsProvider } from "./parallel-agents-tool"
import { MultiAgentTool, setMultiAgentProvider, setMultiAgentRuntime } from "./multi-agent-tool"
import { TaskTool, setTaskRuntime } from "../../subtask/task-tool"
import type { SubTaskProvider, RunAgentRuntime, RunWorkflowRuntime, ParentContext } from "../../subtask"

/**
 * 子代理工具配置
 */
export interface SubagentToolsConfig {
  /** LLM Provider（用于 ask_llm 和 multi_agent） */
  provider: SubTaskProvider
  /** Agent 运行时（用于 run_agent, fork_agent, parallel_agents） */
  agentRuntime: RunAgentRuntime
  /** Workflow 运行时（用于 run_workflow） */
  workflowRuntime?: RunWorkflowRuntime
  /** 父会话上下文（用于 fork_agent） */
  parentContext?: ParentContext
}

/**
 * 注册所有子代理工具
 */
export function registerSubagentTools(config: SubagentToolsConfig): void {
  // 配置 Provider
  setAskLlmProvider(config.provider)
  setMultiAgentProvider(config.provider)
  setMultiAgentRuntime(config.agentRuntime)  // Phase 2 执行需要 Agent Runtime
  setParallelAgentsProvider(config.provider)  // 用于融合代理

  // 配置 Agent 运行时
  setRunAgentRuntime(config.agentRuntime)
  setParallelAgentsRuntime(config.agentRuntime)
  setForkAgentRuntime(config.agentRuntime)

  // 配置 Workflow 运行时
  if (config.workflowRuntime) {
    setRunWorkflowRuntime(config.workflowRuntime)
  }

  // 配置父上下文
  if (config.parentContext) {
    setForkAgentParentContext(config.parentContext)
  }

  // 配置 Task 工具运行时（统一入口，需要 provider 和 agentRuntime 信息）
  setTaskRuntime({
    provider: config.provider,
    apiKey: config.agentRuntime.apiKey,
    baseURL: config.agentRuntime.baseURL,
  })

  // 注册工具
  ToolRegistry.register(AskLlmTool)
  ToolRegistry.register(RunAgentTool)
  ToolRegistry.register(ForkAgentTool)
  ToolRegistry.register(RunWorkflowTool)
  ToolRegistry.register(ParallelAgentsTool)
  ToolRegistry.register(MultiAgentTool)
  ToolRegistry.register(TaskTool)
}

/**
 * 更新父上下文（在会话进行中调用）
 */
export function updateParentContext(context: ParentContext): void {
  setForkAgentParentContext(context)
}

/**
 * 子代理工具 ID 列表
 */
export const SUBAGENT_TOOL_IDS = [
  "ask_llm",
  "run_agent",
  "fork_agent",
  "run_workflow",
  "parallel_agents",
  "multi_agent",
  "task",
] as const

export type SubagentToolId = typeof SUBAGENT_TOOL_IDS[number]
