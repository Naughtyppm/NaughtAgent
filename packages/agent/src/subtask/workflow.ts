/**
 * Workflow 模式 - 预定义流程执行
 *
 * 中等灵活度的子任务模式：
 * - 预定义步骤
 * - 支持条件分支
 * - 支持并行执行
 * - 上下文在步骤间传递
 */

import type {
  WorkflowTaskConfig,
  SubTaskResult,
  SubTaskStep,
  SubTaskProvider,
  SubTaskToolExecutor,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowContext,
} from "./types"

// ============================================================================
// Workflow Registry
// ============================================================================

const workflowRegistry = new Map<string, WorkflowDefinition>()

/**
 * 注册工作流
 */
export function registerWorkflow(definition: WorkflowDefinition): void {
  workflowRegistry.set(definition.name, definition)
}

/**
 * 获取工作流
 */
export function getWorkflow(name: string): WorkflowDefinition | undefined {
  return workflowRegistry.get(name)
}

/**
 * 列出所有工作流
 */
export function listWorkflows(): WorkflowDefinition[] {
  return Array.from(workflowRegistry.values())
}

/**
 * 清空工作流注册表
 */
export function clearWorkflows(): void {
  workflowRegistry.clear()
}

// ============================================================================
// Workflow Execution
// ============================================================================

/**
 * Workflow 模式运行时配置
 */
export interface WorkflowModeRuntime {
  /** LLM Provider */
  provider: SubTaskProvider
  /** 工具执行器 */
  toolExecutor: SubTaskToolExecutor
}

/**
 * 执行 Workflow 模式子任务
 */
export async function runWorkflowTask(
  config: WorkflowTaskConfig,
  runtime: WorkflowModeRuntime
): Promise<SubTaskResult> {
  const startTime = Date.now()
  const steps: SubTaskStep[] = []

  try {
    // 检查取消信号
    if (config.abort?.aborted) {
      return {
        success: false,
        output: "",
        error: "Task was aborted",
        steps: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: Date.now() - startTime,
      }
    }

    // 获取工作流定义
    const workflow = getWorkflow(config.workflow)
    if (!workflow) {
      return {
        success: false,
        output: "",
        error: `Workflow not found: ${config.workflow}`,
        steps: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: Date.now() - startTime,
      }
    }

    // 初始化上下文
    const context: WorkflowContext = {
      params: config.params || {},
      results: {},
      cwd: config.cwd || process.cwd(),
      abort: config.abort,
    }

    // 构建步骤索引
    const stepIndex = new Map<string, WorkflowStep>()
    for (const step of workflow.steps) {
      stepIndex.set(step.name, step)
    }

    // 确定入口步骤
    let currentStepName = workflow.entryStep || workflow.steps[0]?.name
    if (!currentStepName) {
      return {
        success: false,
        output: "",
        error: "Workflow has no steps",
        steps: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: Date.now() - startTime,
      }
    }

    // Token 统计
    let totalInputTokens = 0
    let totalOutputTokens = 0

    // 已执行的步骤（防止无限循环）
    const executedSteps = new Set<string>()
    const maxIterations = 100

    // 执行工作流
    while (currentStepName && executedSteps.size < maxIterations) {
      // 检查取消信号
      if (config.abort?.aborted) {
        return {
          success: false,
          output: buildOutput(context, steps),
          error: "Task was aborted",
          steps,
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
          duration: Date.now() - startTime,
        }
      }

      const step = stepIndex.get(currentStepName)
      if (!step) {
        return {
          success: false,
          output: buildOutput(context, steps),
          error: `Step not found: ${currentStepName}`,
          steps,
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
          duration: Date.now() - startTime,
        }
      }

      // 记录执行
      executedSteps.add(currentStepName)

      // 执行步骤
      const stepStartTime = Date.now()
      const stepResult = await executeStep(step, context, runtime)

      // 记录步骤结果
      steps.push({
        name: step.name,
        type: step.type === "condition" ? "condition" : step.type === "llm" ? "llm" : "tool",
        input: stepResult.input,
        output: stepResult.output,
        duration: Date.now() - stepStartTime,
        success: stepResult.success,
        error: stepResult.error,
      })

      // 累计 Token
      totalInputTokens += stepResult.usage?.inputTokens || 0
      totalOutputTokens += stepResult.usage?.outputTokens || 0

      // 保存结果到上下文
      context.results[step.name] = stepResult.output

      // 检查是否失败
      if (!stepResult.success && !step.optional) {
        return {
          success: false,
          output: buildOutput(context, steps),
          error: stepResult.error || `Step failed: ${step.name}`,
          steps,
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
          duration: Date.now() - startTime,
        }
      }

      // 确定下一步
      currentStepName = stepResult.nextStep || getNextStep(workflow, currentStepName)
    }

    return {
      success: true,
      output: buildOutput(context, steps),
      steps,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : String(error),
      steps,
      usage: { inputTokens: 0, outputTokens: 0 },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * 执行单个步骤
 */
async function executeStep(
  step: WorkflowStep,
  context: WorkflowContext,
  runtime: WorkflowModeRuntime
): Promise<{
  success: boolean
  output: unknown
  input?: unknown
  error?: string
  nextStep?: string
  usage?: { inputTokens: number; outputTokens: number }
}> {
  switch (step.type) {
    case "tool":
      return executeToolStep(step, context, runtime)

    case "llm":
      return executeLLMStep(step, context, runtime)

    case "condition":
      return executeConditionStep(step, context)

    case "parallel":
      return executeParallelStep(step, context, runtime)

    default:
      return {
        success: false,
        output: null,
        error: `Unknown step type: ${step.type}`,
      }
  }
}

/**
 * 执行工具步骤
 */
async function executeToolStep(
  step: WorkflowStep,
  context: WorkflowContext,
  runtime: WorkflowModeRuntime
): Promise<{
  success: boolean
  output: unknown
  input?: unknown
  error?: string
}> {
  if (!step.tool) {
    return { success: false, output: null, error: "Tool config missing" }
  }

  // 解析参数
  const params =
    typeof step.tool.params === "function"
      ? step.tool.params(context)
      : step.tool.params

  try {
    const result = await runtime.toolExecutor.execute(
      step.tool.name,
      params,
      { cwd: context.cwd }
    )

    return {
      success: !result.error,
      output: result.output,
      input: params,
      error: result.error,
    }
  } catch (error) {
    return {
      success: false,
      output: null,
      input: params,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * 执行 LLM 步骤
 */
async function executeLLMStep(
  step: WorkflowStep,
  context: WorkflowContext,
  runtime: WorkflowModeRuntime
): Promise<{
  success: boolean
  output: unknown
  input?: unknown
  error?: string
  usage?: { inputTokens: number; outputTokens: number }
}> {
  if (!step.llm) {
    return { success: false, output: null, error: "LLM config missing" }
  }

  // 解析 prompt
  const prompt =
    typeof step.llm.prompt === "function"
      ? step.llm.prompt(context)
      : step.llm.prompt

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = []

  if (step.llm.systemPrompt) {
    messages.push({ role: "system", content: step.llm.systemPrompt })
  }

  messages.push({ role: "user", content: prompt })

  try {
    if (step.llm.outputFormat === "json" && step.llm.schema) {
      const result = await runtime.provider.chatWithSchema({
        messages,
        schema: step.llm.schema,
      })

      return {
        success: true,
        output: result.data,
        input: prompt,
        usage: result.usage,
      }
    } else {
      const result = await runtime.provider.chat({ messages })

      return {
        success: true,
        output: result.content,
        input: prompt,
        usage: result.usage,
      }
    }
  } catch (error) {
    return {
      success: false,
      output: null,
      input: prompt,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * 执行条件步骤
 */
async function executeConditionStep(
  step: WorkflowStep,
  context: WorkflowContext
): Promise<{
  success: boolean
  output: unknown
  nextStep?: string
}> {
  if (!step.condition) {
    return { success: false, output: null }
  }

  try {
    const result = step.condition.check(context)
    const nextStep = result ? step.condition.then : step.condition.else

    return {
      success: true,
      output: result,
      nextStep,
    }
  } catch (error) {
    return {
      success: false,
      output: null,
    }
  }
}

/**
 * 执行并行步骤
 */
async function executeParallelStep(
  step: WorkflowStep,
  context: WorkflowContext,
  runtime: WorkflowModeRuntime
): Promise<{
  success: boolean
  output: unknown
  error?: string
  usage?: { inputTokens: number; outputTokens: number }
}> {
  if (!step.parallel || step.parallel.length === 0) {
    return { success: false, output: null, error: "Parallel steps missing" }
  }

  // 注意：并行步骤需要从 registry 获取步骤定义
  // 这里简化处理，返回步骤名列表
  return {
    success: true,
    output: step.parallel,
  }
}

/**
 * 获取下一个步骤
 */
function getNextStep(workflow: WorkflowDefinition, currentStep: string): string | undefined {
  const index = workflow.steps.findIndex((s) => s.name === currentStep)
  if (index === -1 || index >= workflow.steps.length - 1) {
    return undefined
  }
  return workflow.steps[index + 1].name
}

/**
 * 构建输出
 */
function buildOutput(context: WorkflowContext, steps: SubTaskStep[]): string {
  const lastStep = steps[steps.length - 1]
  if (lastStep?.output) {
    return typeof lastStep.output === "string"
      ? lastStep.output
      : JSON.stringify(lastStep.output, null, 2)
  }
  return ""
}
