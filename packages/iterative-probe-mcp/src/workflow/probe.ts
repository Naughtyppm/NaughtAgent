/**
 * 探测阶段 - 调用 Claude 执行探测
 */

import type { ProbeTarget, ProbeResult, Problem } from "../types.js"
import { getClaudeClient } from "../llm/claude.js"

/**
 * 探测阶段配置
 */
export interface ProbePhaseConfig {
  /** 探测目标 */
  target: ProbeTarget
  /** 工作目录 */
  cwd: string
  /** 项目上下文 */
  projectContext?: string
  /** 总体目标 */
  goal: string
}

/**
 * 生成探测 prompt
 */
function buildProbePrompt(config: ProbePhaseConfig): string {
  return `## 探测任务

你是一个代码探测专家。请探测以下目标，找出问题。

### 总体目标
${config.goal}

### 当前探测目标
- 名称: ${config.target.name}
- 描述: ${config.target.description}
${config.target.start ? `- 起点: ${config.target.start}` : ""}
${config.target.end ? `- 终点: ${config.target.end}` : ""}
${config.target.checkpoints?.length ? `- 检查点: ${config.target.checkpoints.join(", ")}` : ""}

### 工作目录
${config.cwd}

${config.projectContext ? `### 项目上下文\n${config.projectContext}` : ""}

### 探测要求

1. 检查目标链路的每个环节
2. 找出断点、缺失、错误配置
3. 记录关键代码片段（仅异常部分）

### 输出格式

返回 JSON，格式如下：

{
  "target": "${config.target.name}",
  "checks": [
    {
      "item": "检查项名称",
      "passed": true/false,
      "detail": "检查结果说明"
    }
  ],
  "problems": [
    {
      "id": "P001",
      "description": "问题描述",
      "location": "文件路径:行号",
      "type": "config|code|data|logic|unknown",
      "severity": "P0|P1|P2",
      "dependsOn": ["其他问题ID"] // 可选
    }
  ],
  "codeSnippets": [
    {
      "file": "文件路径",
      "line": 行号,
      "code": "代码片段（最多20行）",
      "note": "说明"
    }
  ]
}

注意：
- 问题 ID 格式: P001, P002, ...
- 只报告发现的问题，不要修复
- 代码片段只保留关键部分
`
}

/**
 * 解析探测结果
 */
function parseProbeResult(raw: unknown, targetName: string): ProbeResult {
  const data = raw as {
    target?: string
    checks?: Array<{ item: string; passed: boolean; detail: string }>
    problems?: Array<{
      id: string
      description: string
      location: string
      type: string
      severity: string
      dependsOn?: string[]
    }>
    codeSnippets?: Array<{
      file: string
      line: number
      code: string
      note: string
    }>
  }

  return {
    target: data.target || targetName,
    checks: data.checks || [],
    problems: (data.problems || []).map((p) => ({
      id: p.id,
      description: p.description,
      location: p.location,
      type: (p.type as Problem["type"]) || "unknown",
      severity: (p.severity as Problem["severity"]) || "P1",
      dependsOn: p.dependsOn,
      fixed: false,
    })),
    codeSnippets: data.codeSnippets,
  }
}

/**
 * 执行单个探测
 */
export async function runProbe(config: ProbePhaseConfig): Promise<ProbeResult> {
  const client = getClaudeClient()
  const prompt = buildProbePrompt(config)

  const systemPrompt = `你是一个专业的代码探测专家，擅长分析代码链路、找出问题根因。
你的任务是探测和报告问题，不要修复。
输出必须是有效的 JSON 格式。`

  try {
    const { data } = await client.callJSON<unknown>({
      systemPrompt,
      prompt,
    })

    return parseProbeResult(data, config.target.name)
  } catch (error) {
    // 返回空结果
    return {
      target: config.target.name,
      checks: [
        {
          item: "探测执行",
          passed: false,
          detail: `探测失败: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      problems: [],
    }
  }
}

/**
 * 并行执行多个探测
 */
export async function runProbePhase(
  targets: ProbeTarget[],
  cwd: string,
  goal: string,
  projectContext?: string
): Promise<ProbeResult[]> {
  const probePromises = targets.map((target) =>
    runProbe({
      target,
      cwd,
      goal,
      projectContext,
    })
  )

  return Promise.all(probePromises)
}
