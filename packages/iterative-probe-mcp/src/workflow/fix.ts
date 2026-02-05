/**
 * 修复阶段 - 生成修复计划并执行
 */

import type { AnalysisResult, FixPlan, FixResult, Problem } from "../types.js"
import { getClaudeClient } from "../llm/claude.js"

/**
 * 修复计划配置
 */
export interface FixPlanConfig {
  /** 分析结果 */
  analysis: AnalysisResult
  /** 工作目录 */
  cwd: string
  /** 项目上下文 */
  projectContext?: string
}

/**
 * 修复执行配置
 */
export interface FixExecuteConfig {
  /** 修复计划 */
  plan: FixPlan
  /** 问题详情 */
  problem: Problem
  /** 工作目录 */
  cwd: string
  /** 项目上下文 */
  projectContext?: string
}

/**
 * 生成修复计划 prompt
 */
function buildPlanPrompt(config: FixPlanConfig): string {
  return `## 生成修复计划

你是一个代码修复专家。请为以下问题生成修复计划。

### 问题列表

${config.analysis.problems
  .map(
    (p) => `#### ${p.id}: ${p.description}
- 位置: ${p.location}
- 类型: ${p.type}
- 严重程度: ${p.severity}
- 依赖: ${p.dependsOn?.join(", ") || "无"}
`
  )
  .join("\n")}

### 根因分析
${config.analysis.rootCause}

### 修复建议
${config.analysis.suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}

### 建议修复顺序
${config.analysis.fixOrder.join(" → ")}

### 工作目录
${config.cwd}

${config.projectContext ? `### 项目上下文\n${config.projectContext}` : ""}

### 输出格式

返回 JSON，格式如下：

{
  "plans": [
    {
      "problemId": "P001",
      "steps": [
        "步骤1描述",
        "步骤2描述"
      ],
      "verification": "验证方法描述",
      "canParallel": true/false
    }
  ]
}

注意：
- 按照建议的修复顺序生成计划
- canParallel 表示是否可以与其他修复并行执行
- 有依赖关系的问题不能并行
`
}

/**
 * 生成修复执行 prompt
 */
function buildFixPrompt(config: FixExecuteConfig): string {
  return `## 执行修复

你是一个代码修复专家。请执行以下修复任务。

### 问题
- ID: ${config.problem.id}
- 描述: ${config.problem.description}
- 位置: ${config.problem.location}
- 类型: ${config.problem.type}

### 修复计划

${config.plan.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

### 验证方法
${config.plan.verification}

### 工作目录
${config.cwd}

${config.projectContext ? `### 项目上下文\n${config.projectContext}` : ""}

### 执行要求

1. 按照修复计划执行每个步骤
2. 记录修改的文件和内容
3. 如果遇到问题，记录错误信息

### 输出格式

返回 JSON，格式如下：

{
  "success": true/false,
  "modifiedFiles": [
    {
      "path": "文件路径",
      "changes": "修改描述"
    }
  ],
  "error": "错误信息（如果失败）"
}

注意：
- 只返回实际执行的结果
- 如果无法执行某个步骤，设置 success 为 false 并说明原因
`
}

/**
 * 解析修复计划
 */
function parseFixPlans(raw: unknown): FixPlan[] {
  const data = raw as {
    plans?: Array<{
      problemId: string
      steps: string[]
      verification: string
      canParallel: boolean
    }>
  }

  return (data.plans || []).map((p) => ({
    problemId: p.problemId,
    steps: p.steps || [],
    verification: p.verification || "手动验证",
    canParallel: p.canParallel ?? false,
  }))
}

/**
 * 解析修复结果
 */
function parseFixResult(raw: unknown, problemId: string): FixResult {
  const data = raw as {
    success?: boolean
    modifiedFiles?: Array<{
      path: string
      changes: string
    }>
    error?: string
  }

  return {
    problemId,
    success: data.success ?? false,
    modifiedFiles: data.modifiedFiles || [],
    error: data.error,
  }
}

/**
 * 生成修复计划
 */
export async function runPlanPhase(config: FixPlanConfig): Promise<FixPlan[]> {
  if (config.analysis.problems.length === 0) {
    return []
  }

  const client = getClaudeClient()
  const prompt = buildPlanPrompt(config)

  const systemPrompt = `你是一个专业的代码修复专家，擅长制定修复计划。
输出必须是有效的 JSON 格式。`

  try {
    const { data } = await client.callJSON<unknown>({
      systemPrompt,
      prompt,
    })

    return parseFixPlans(data)
  } catch (error) {
    // 返回简单计划
    return config.analysis.problems.map((p) => ({
      problemId: p.id,
      steps: [`修复 ${p.description}`],
      verification: "手动验证",
      canParallel: !p.dependsOn?.length,
    }))
  }
}

/**
 * 执行单个修复
 */
export async function runFix(config: FixExecuteConfig): Promise<FixResult> {
  const client = getClaudeClient()
  const prompt = buildFixPrompt(config)

  const systemPrompt = `你是一个专业的代码修复专家，擅长执行代码修改。
输出必须是有效的 JSON 格式。
注意：这是一个模拟执行，你需要描述会做什么修改，但不会实际修改文件。`

  try {
    const { data } = await client.callJSON<unknown>({
      systemPrompt,
      prompt,
    })

    return parseFixResult(data, config.plan.problemId)
  } catch (error) {
    return {
      problemId: config.plan.problemId,
      success: false,
      modifiedFiles: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * 执行修复阶段（考虑并行）
 */
export async function runFixPhase(
  plans: FixPlan[],
  problems: Problem[],
  cwd: string,
  projectContext?: string
): Promise<FixResult[]> {
  const results: FixResult[] = []
  const problemMap = new Map(problems.map((p) => [p.id, p]))

  // 分组：可并行的和需要串行的
  const parallelPlans = plans.filter((p) => p.canParallel)
  const serialPlans = plans.filter((p) => !p.canParallel)

  // 先执行可并行的
  if (parallelPlans.length > 0) {
    const parallelResults = await Promise.all(
      parallelPlans.map((plan) => {
        const problem = problemMap.get(plan.problemId)
        if (!problem) {
          return Promise.resolve({
            problemId: plan.problemId,
            success: false,
            modifiedFiles: [],
            error: "Problem not found",
          })
        }
        return runFix({ plan, problem, cwd, projectContext })
      })
    )
    results.push(...parallelResults)
  }

  // 再串行执行有依赖的
  for (const plan of serialPlans) {
    const problem = problemMap.get(plan.problemId)
    if (!problem) {
      results.push({
        problemId: plan.problemId,
        success: false,
        modifiedFiles: [],
        error: "Problem not found",
      })
      continue
    }
    const result = await runFix({ plan, problem, cwd, projectContext })
    results.push(result)
  }

  return results
}
