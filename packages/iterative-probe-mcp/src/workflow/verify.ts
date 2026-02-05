/**
 * 验证阶段 - 验证修复效果
 */

import type { FixResult, Problem, VerificationResult } from "../types.js"
import { getClaudeClient } from "../llm/claude.js"

/**
 * 验证阶段配置
 */
export interface VerifyPhaseConfig {
  /** 修复结果 */
  fixResults: FixResult[]
  /** 问题列表 */
  problems: Problem[]
  /** 总体目标 */
  goal: string
  /** 工作目录 */
  cwd: string
  /** 项目上下文 */
  projectContext?: string
}

/**
 * 生成验证 prompt
 */
function buildVerifyPrompt(config: VerifyPhaseConfig): string {
  const fixedProblems = config.fixResults.filter((r) => r.success)
  const failedProblems = config.fixResults.filter((r) => !r.success)

  return `## 验证任务

你是一个代码验证专家。请验证以下修复是否生效。

### 总体目标
${config.goal}

### 修复结果汇总

#### 成功修复 (${fixedProblems.length})
${
  fixedProblems.length === 0
    ? "无"
    : fixedProblems
        .map(
          (r) => `- ${r.problemId}: ${r.modifiedFiles.map((f) => f.path).join(", ")}`
        )
        .join("\n")
}

#### 修复失败 (${failedProblems.length})
${
  failedProblems.length === 0
    ? "无"
    : failedProblems.map((r) => `- ${r.problemId}: ${r.error}`).join("\n")
}

### 原始问题列表

${config.problems
  .map(
    (p) => `- [${p.id}] ${p.description} @ ${p.location}
  状态: ${p.fixed ? "已修复" : "未修复"}
`
  )
  .join("\n")}

### 工作目录
${config.cwd}

${config.projectContext ? `### 项目上下文\n${config.projectContext}` : ""}

### 验证要求

1. 检查每个修复是否真正解决了问题
2. 检查是否引入了新问题
3. 验证总体目标是否达成

### 输出格式

返回 JSON，格式如下：

{
  "allPassed": true/false,
  "items": [
    {
      "description": "验证项描述",
      "passed": true/false,
      "detail": "验证结果说明"
    }
  ],
  "remainingProblems": ["仍存在的问题描述"]
}

注意：
- allPassed 为 true 表示所有问题都已解决
- remainingProblems 列出仍未解决的问题
`
}

/**
 * 解析验证结果
 */
function parseVerificationResult(raw: unknown): VerificationResult {
  const data = raw as {
    allPassed?: boolean
    items?: Array<{
      description: string
      passed: boolean
      detail: string
    }>
    remainingProblems?: string[]
  }

  return {
    allPassed: data.allPassed ?? false,
    items: data.items || [],
    remainingProblems: data.remainingProblems || [],
  }
}

/**
 * 执行验证阶段
 */
export async function runVerifyPhase(config: VerifyPhaseConfig): Promise<VerificationResult> {
  // 如果没有修复结果，直接返回
  if (config.fixResults.length === 0) {
    return {
      allPassed: config.problems.length === 0,
      items: [
        {
          description: "修复执行",
          passed: false,
          detail: "没有执行任何修复",
        },
      ],
      remainingProblems: config.problems.map((p) => p.description),
    }
  }

  const client = getClaudeClient()
  const prompt = buildVerifyPrompt(config)

  const systemPrompt = `你是一个专业的代码验证专家，擅长验证修复效果。
输出必须是有效的 JSON 格式。`

  try {
    const { data } = await client.callJSON<unknown>({
      systemPrompt,
      prompt,
    })

    return parseVerificationResult(data)
  } catch (error) {
    // 基于修复结果简单判断
    const successCount = config.fixResults.filter((r) => r.success).length
    const allPassed = successCount === config.problems.length

    return {
      allPassed,
      items: [
        {
          description: "修复验证",
          passed: allPassed,
          detail: `${successCount}/${config.problems.length} 个问题已修复`,
        },
      ],
      remainingProblems: config.problems
        .filter((p) => !p.fixed)
        .map((p) => p.description),
    }
  }
}
