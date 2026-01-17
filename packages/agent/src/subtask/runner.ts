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
  AskLlmConfig,
  RunAgentConfig,
  ForkAgentConfig,
  RunWorkflowConfig,
  ParentContext,
} from "./types"
import { runAskLlm } from "./ask-llm"
import { runRunWorkflow, type RunWorkflowRuntime } from "./run-workflow"
import { runRunAgent, type RunAgentRuntime } from "./run-agent"
import { runForkAgent, type ForkAgentRuntime } from "./fork-agent"

/**
 * SubTask 运行时配置
 */
export interface SubTaskRuntime {
  /** LLM Provider（ask_llm 和 run_workflow 模式需要） */
  provider?: SubTaskProvider
  /** 工具执行器（run_workflow 模式需要） */
  toolExecutor?: SubTaskToolExecutor
  /** API Key（run_agent 和 fork_agent 模式需要） */
  apiKey?: string
  /** API Base URL */
  baseURL?: string
  /** 父会话上下文（fork_agent 模式需要） */
  parentContext?: ParentContext
}

/**
 * 规范化模式名称
 */
function normalizeMode(mode: string): string {
  // 兼容旧模式名称
  switch (mode) {
    case "api":
      return "ask_llm"
    case "agent":
      return "run_agent"
    case "workflow":
      return "run_workflow"
    default:
      return mode
  }
}

/**
 * 执行子任务（统一入口）
 */
export async function runSubTask(
  config: SubTaskConfig,
  runtime: SubTaskRuntime
): Promise<SubTaskResult> {
  const mode = normalizeMode(config.mode)

  switch (mode) {
    case "ask_llm":
      if (!runtime.provider) {
        return {
          success: false,
          output: "",
          error: "Provider is required for ask_llm mode",
          usage: { inputTokens: 0, outputTokens: 0 },
          duration: 0,
        }
      }
      return runAskLlm(config as AskLlmConfig, runtime.provider)

    case "run_workflow":
      if (!runtime.provider || !runtime.toolExecutor) {
        return {
          success: false,
          output: "",
          error: "Provider and toolExecutor are required for run_workflow mode",
          usage: { inputTokens: 0, outputTokens: 0 },
          duration: 0,
        }
      }
      const workflowRuntime: RunWorkflowRuntime = {
        provider: runtime.provider,
        toolExecutor: runtime.toolExecutor,
      }
      return runRunWorkflow(config as RunWorkflowConfig, workflowRuntime)

    case "run_agent":
      if (!runtime.apiKey) {
        return {
          success: false,
          output: "",
          error: "API key is required for run_agent mode",
          usage: { inputTokens: 0, outputTokens: 0 },
          duration: 0,
        }
      }
      const agentRuntime: RunAgentRuntime = {
        apiKey: runtime.apiKey,
        baseURL: runtime.baseURL,
      }
      return runRunAgent(config as RunAgentConfig, agentRuntime)

    case "fork_agent":
      if (!runtime.parentContext) {
        return {
          success: false,
          output: "",
          error: "Parent context is required for fork_agent mode",
          usage: { inputTokens: 0, outputTokens: 0 },
          duration: 0,
        }
      }
      const forkRuntime: ForkAgentRuntime = {
        parentContext: runtime.parentContext,
        apiKey: runtime.apiKey,
        baseURL: runtime.baseURL,
      }
      return runForkAgent(config as ForkAgentConfig, forkRuntime)

    default:
      return {
        success: false,
        output: "",
        error: `Unknown mode: ${config.mode}`,
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: 0,
      }
  }
}

// ============================================================================
// 简化 API
// ============================================================================

/**
 * SubTask 简化 API
 */
export class SubTask {
  private runtime: SubTaskRuntime

  constructor(runtime: SubTaskRuntime) {
    this.runtime = runtime
  }

  /**
   * ask_llm 模式 - 单次 LLM 调用
   */
  async askLlm(
    prompt: string,
    options?: Omit<AskLlmConfig, "mode" | "prompt">
  ): Promise<SubTaskResult> {
    return runSubTask(
      { mode: "ask_llm", prompt, ...options },
      this.runtime
    )
  }

  /**
   * run_agent 模式 - 独立子 Agent
   */
  async runAgent(
    prompt: string,
    options?: Omit<RunAgentConfig, "mode" | "prompt">
  ): Promise<SubTaskResult> {
    return runSubTask(
      { mode: "run_agent", prompt, ...options },
      this.runtime
    )
  }

  /**
   * fork_agent 模式 - 继承上下文的子 Agent
   */
  async forkAgent(
    prompt: string,
    options?: Omit<ForkAgentConfig, "mode" | "prompt">
  ): Promise<SubTaskResult> {
    return runSubTask(
      { mode: "fork_agent", prompt, ...options },
      this.runtime
    )
  }

  /**
   * run_workflow 模式 - 预定义工作流
   */
  async runWorkflow(
    workflow: string,
    params?: Record<string, unknown>,
    options?: Omit<RunWorkflowConfig, "mode" | "prompt" | "workflow" | "params">
  ): Promise<SubTaskResult> {
    return runSubTask(
      { mode: "run_workflow", prompt: "", workflow, params, ...options },
      this.runtime
    )
  }

  /**
   * 更新运行时配置
   */
  setRuntime(runtime: Partial<SubTaskRuntime>): void {
    this.runtime = { ...this.runtime, ...runtime }
  }

  /**
   * 设置父会话上下文（用于 fork_agent）
   */
  setParentContext(context: ParentContext): void {
    this.runtime.parentContext = context
  }
}

/**
 * 创建 SubTask 实例
 */
export function createSubTask(runtime: SubTaskRuntime): SubTask {
  return new SubTask(runtime)
}
