/**
 * 分析阶段 - 汇总探测结果，分析根因
 */

import type { ProbeResult, AnalysisResult, Problem } from "../types.js"
import { getClaudeClient } from "../llm/claude.js"

/**
 * 分析阶段配置
 */
export interface AnalyzePhaseConfig {
  /** 探测结果 */
  probeResults: ProbeResult[]
  /** 总体目标 */
  goal: string
  /** 工作目录 */
  cwd: string
}

/**
 * 生成分析 prompt
 */
function buildAnalyzePrompt(config: AnalyzePhaseConfig): string {
  const problemsSummary = config.probeResults
    .flatMap((r) => r.problems)
    .map((p) => `- [${p.id}] ${p.description} @ ${p.location} (${p.type}, ${p.severity})`)
    .join("\n")

  const checksSummary = config.probeResults
    .flatMap((r) => r.checks.filter((c) => !c.passed))
    .map((c) => `- ❌ ${c.item}: ${c.detail}`)
    .join("\n")

  return `## 分析任务

你是一个代码分析专家。请综合分析以下探测结果，找出根因并给出修复建议。

### 总体目标
${config.goal}

### 探测结果汇总

#### 失败的检查项
${checksSummary || "无"}

#### 发现的问题
${problemsSummary || "无"}

### 详细探测结果

${config.probeResults
  .map(
    (r) => `#### ${r.target}
检查项: ${r.checks.length} 个 (通过: ${r.checks.filter((c) => c.passed).length})
问题: ${r.problems.length} 个
${r.codeSnippets?.length ? `代码片段: ${r.codeSnippets.length} 个` : ""}
`
  )
  .join("\n")}

### 分析要求

1. 分析问题之间的依赖关系
2. 找出根本原因
3. 给出修复建议和顺序

### 输出格式

返回 JSON，格式如下：

{
  "problems": [
    {
      "id": "P001",
      "description": "问题描述",
      "location": "文件路径:行号",
      "type": "config|code|data|logic|unknown",
      "severity": "P0|P1|P2",
      "dependsOn": ["其他问题ID"]
    }
  ],
  "rootCause": "根因分析文本",
  "suggestions": [
    "修复建议1",
    "修复建议2"
  ],
  "fixOrder": ["P001", "P002", "P003"]
}

注意：
- fixOrder 要考虑依赖关系，被依赖的问题先修复
- 如果没有问题，problems 返回空数组
`
}

/**
 * 解析分析结果
 */
function parseAnalysisResult(raw: unknown): AnalysisResult {
  const data = raw as {
    problems?: Array<{
      id: string
      description: string
      location: string
      type: string
      severity: string
      dependsOn?: string[]
    }>
    rootCause?: string
    suggestions?: string[]
    fixOrder?: string[]
  }

  return {
    problems: (data.problems || []).map((p) => ({
      id: p.id,
      description: p.description,
      location: p.location,
      type: (p.type as Problem["type"]) || "unknown",
      severity: (p.severity as Problem["severity"]) || "P1",
      dependsOn: p.dependsOn,
      fixed: false,
    })),
    rootCause: data.rootCause || "未能确定根因",
    suggestions: data.suggestions || [],
    fixOrder: data.fixOrder || [],
  }
}

/**
 * 执行分析阶段
 */
export async function runAnalyzePhase(config: AnalyzePhaseConfig): Promise<AnalysisResult> {
  // 如果没有问题，直接返回空结果
  const totalProblems = config.probeResults.reduce(
    (sum, r) => sum + r.problems.length,
    0
  )

  if (totalProblems === 0) {
    return {
      problems: [],
      rootCause: "未发现问题",
      suggestions: [],
      fixOrder: [],
    }
  }

  const client = getClaudeClient()
  const prompt = buildAnalyzePrompt(config)

  const systemPrompt = `你是一个专业的代码分析专家，擅长分析问题根因、理清依赖关系。
输出必须是有效的 JSON 格式。`

  try {
    const { data } = await client.callJSON<unknown>({
      systemPrompt,
      prompt,
    })

    return parseAnalysisResult(data)
  } catch (error) {
    // 返回原始问题列表
    return {
      problems: config.probeResults.flatMap((r) => r.problems),
      rootCause: `分析失败: ${error instanceof Error ? error.message : String(error)}`,
      suggestions: ["请手动分析问题"],
      fixOrder: config.probeResults.flatMap((r) => r.problems.map((p) => p.id)),
    }
  }
}
