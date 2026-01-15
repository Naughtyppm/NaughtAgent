/**
 * SubTask 统一入口
 *
 * 根据模式分发到对应的执行器
 */

import type {
  SubTaskConfig,
  SubTaskResult,
  SubTaskProvider,
  SubTaskToolExecutor,
  APITaskConfig,
  WorkflowTaskConfig,
  AgentTaskConfig,
} from "./types"
import { runAPITask } from "./api"
import { runWorkflowTask, type WorkflowModeRuntime } from "./workflow"
import { runAgentTask, type AgentModeRuntime } from "./agent"

/**
 * SubTask 运行时配置
 */
export interface SubTaskRuntime {
  /** LLM Provider（API 和 Workflow 模式需要） */
  provider?: SubTaskProvider
  /** 工具执行器（Workflow 模式需要） */
  toolExecutor?: SubTaskToolExecutor
  /** API Key（Agent 模式需要） */
  apiKey?: string
  /** API Base URL */
  baseURL?: string
}

/**
 * 执行子任务（统一入口）
 */
export async function runSubTask(
  config: SubTaskConfig,
  runtime: SubTaskRuntime
): Promise<SubTaskResult> {
  switch (config.mode) {
    case "api":
      if (!runtime.provider) {
        return {
          success: false,
          output: "",
          error: "Provider is required for API mode",
          usage: { inputTokens: 0, outputTokens: 0 },
          duration: 0,
        }
      }
      return runAPITask(config as APITaskConfig, runtime.provider)

    case "workflow":
      if (!runtime.provider || !runtime.toolExecutor) {
        return {
          success: false,
          output: "",
          error: "Provider and toolExecutor are required for Workflow mode",
          usage: { inputTokens: 0, outputTokens: 0 },
          duration: 0,
        }
      }
      const workflowRuntime: WorkflowModeRuntime = {
        provider: runtime.provider,
        toolExecutor: runtime.toolExecutor,
      }
      return runWorkflowTask(config as WorkflowTaskConfig, workflowRuntime)

    case "agent":
      if (!runtime.apiKey) {
        return {
          success: false,
          output: "",
          error: "API key is required for Agent mode",
          usage: { inputTokens: 0, outputTokens: 0 },
          duration: 0,
        }
      }
      const agentRuntime: AgentModeRuntime = {
        apiKey: runtime.apiKey,
        baseURL: runtime.baseURL,
      }
      return runAgentTask(config as AgentTaskConfig, agentRuntime)

    default:
      return {
        success: false,
        output: "",
        error: `Unknown mode: ${(config as SubTaskConfig).mode}`,
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: 0,
      }
  }
}
