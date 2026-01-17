/**
 * 链式调用支持
 *
 * 提供流畅的链式 API 来组合多个子任务
 */

import type {
  SubTaskResult,
  AskLlmConfig,
  RunAgentConfig,
  ForkAgentConfig,
  RunWorkflowConfig,
} from "./types"
import type { SubTaskRuntime } from "./runner"
import { runSubTask } from "./runner"

/**
 * 链式任务步骤
 */
interface ChainStep {
  /** 步骤类型 */
  type: "ask_llm" | "run_agent" | "fork_agent" | "run_workflow"
  /** 配置生成器（接收上一步结果） */
  configFn: (prevResult?: SubTaskResult) => Partial<AskLlmConfig | RunAgentConfig | ForkAgentConfig | RunWorkflowConfig>
}

/**
 * 链式调用构建器
 */
export class SubTaskChain {
  private steps: ChainStep[] = []
  private runtime: SubTaskRuntime

  constructor(runtime: SubTaskRuntime) {
    this.runtime = runtime
  }

  /**
   * 添加 ask_llm 步骤
   */
  askLlm(
    promptOrFn: string | ((prevResult?: SubTaskResult) => string),
    options?: Omit<AskLlmConfig, "mode" | "prompt">
  ): SubTaskChain {
    this.steps.push({
      type: "ask_llm",
      configFn: (prevResult) => ({
        ...options,
        prompt: typeof promptOrFn === "function" ? promptOrFn(prevResult) : promptOrFn,
      }),
    })
    return this
  }

  /**
   * 添加 run_agent 步骤
   */
  runAgent(
    promptOrFn: string | ((prevResult?: SubTaskResult) => string),
    options?: Omit<RunAgentConfig, "mode" | "prompt">
  ): SubTaskChain {
    this.steps.push({
      type: "run_agent",
      configFn: (prevResult) => ({
        ...options,
        prompt: typeof promptOrFn === "function" ? promptOrFn(prevResult) : promptOrFn,
      }),
    })
    return this
  }

  /**
   * 添加 fork_agent 步骤
   */
  forkAgent(
    promptOrFn: string | ((prevResult?: SubTaskResult) => string),
    options?: Omit<ForkAgentConfig, "mode" | "prompt">
  ): SubTaskChain {
    this.steps.push({
      type: "fork_agent",
      configFn: (prevResult) => ({
        ...options,
        prompt: typeof promptOrFn === "function" ? promptOrFn(prevResult) : promptOrFn,
      }),
    })
    return this
  }

  /**
   * 添加 run_workflow 步骤
   */
  runWorkflow(
    workflow: string,
    paramsOrFn?: Record<string, unknown> | ((prevResult?: SubTaskResult) => Record<string, unknown>),
    options?: Omit<RunWorkflowConfig, "mode" | "prompt" | "workflow" | "params">
  ): SubTaskChain {
    this.steps.push({
      type: "run_workflow",
      configFn: (prevResult) => ({
        ...options,
        workflow,
        params: typeof paramsOrFn === "function" ? paramsOrFn(prevResult) : paramsOrFn,
        prompt: "", // workflow 不需要 prompt
      }),
    })
    return this
  }

  /**
   * 添加条件步骤
   */
  when(
    condition: (prevResult?: SubTaskResult) => boolean,
    thenChain: (chain: SubTaskChain) => SubTaskChain
  ): SubTaskChain {
    // 创建一个条件包装步骤
    const innerChain = new SubTaskChain(this.runtime)
    thenChain(innerChain)

    // 将条件链的步骤包装成条件执行
    for (const step of innerChain.steps) {
      const originalConfigFn = step.configFn
      this.steps.push({
        type: step.type,
        configFn: (prevResult) => {
          if (!condition(prevResult)) {
            // 返回一个标记，表示跳过
            return { __skip: true } as any
          }
          return originalConfigFn(prevResult)
        },
      })
    }

    return this
  }

  /**
   * 添加映射步骤（转换结果）
   */
  map(transform: (result: SubTaskResult) => SubTaskResult): SubTaskChain {
    // 使用 ask_llm 作为占位，但实际上只是转换
    this.steps.push({
      type: "ask_llm",
      configFn: (prevResult) => ({
        __transform: transform,
        __prevResult: prevResult,
      } as any),
    })
    return this
  }

  /**
   * 执行链
   */
  async execute(): Promise<SubTaskResult> {
    let prevResult: SubTaskResult | undefined

    for (const step of this.steps) {
      const config = step.configFn(prevResult)

      // 检查是否跳过
      if ((config as any).__skip) {
        continue
      }

      // 检查是否是转换步骤
      if ((config as any).__transform) {
        const transform = (config as any).__transform as (result: SubTaskResult) => SubTaskResult
        const prev = (config as any).__prevResult as SubTaskResult | undefined
        if (prev) {
          prevResult = transform(prev)
        }
        continue
      }

      // 执行步骤
      const fullConfig = {
        mode: step.type,
        ...config,
      } as any

      prevResult = await runSubTask(fullConfig, this.runtime)

      // 如果失败，停止链
      if (!prevResult.success) {
        return prevResult
      }
    }

    // 返回最后一个结果，或空结果
    return prevResult || {
      success: true,
      output: "",
      usage: { inputTokens: 0, outputTokens: 0 },
      duration: 0,
    }
  }

  /**
   * 执行链并收集所有结果
   */
  async executeAll(): Promise<{
    success: boolean
    results: SubTaskResult[]
    totalUsage: { inputTokens: number; outputTokens: number }
    totalDuration: number
  }> {
    const results: SubTaskResult[] = []
    let prevResult: SubTaskResult | undefined
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalDuration = 0

    for (const step of this.steps) {
      const config = step.configFn(prevResult)

      // 检查是否跳过
      if ((config as any).__skip) {
        continue
      }

      // 检查是否是转换步骤
      if ((config as any).__transform) {
        const transform = (config as any).__transform as (result: SubTaskResult) => SubTaskResult
        const prev = (config as any).__prevResult as SubTaskResult | undefined
        if (prev) {
          prevResult = transform(prev)
          results.push(prevResult)
        }
        continue
      }

      // 执行步骤
      const fullConfig = {
        mode: step.type,
        ...config,
      } as any

      prevResult = await runSubTask(fullConfig, this.runtime)
      results.push(prevResult)

      totalInputTokens += prevResult.usage.inputTokens
      totalOutputTokens += prevResult.usage.outputTokens
      totalDuration += prevResult.duration

      // 如果失败，停止链
      if (!prevResult.success) {
        return {
          success: false,
          results,
          totalUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
          totalDuration,
        }
      }
    }

    return {
      success: true,
      results,
      totalUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      totalDuration,
    }
  }
}

/**
 * 创建链式调用构建器
 */
export function createChain(runtime: SubTaskRuntime): SubTaskChain {
  return new SubTaskChain(runtime)
}

/**
 * 便捷函数：创建并立即开始链
 */
export function chain(runtime: SubTaskRuntime): SubTaskChain {
  return new SubTaskChain(runtime)
}
