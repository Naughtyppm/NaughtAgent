/**
 * 状态管理器 - 文件持久化
 */

import { mkdir, writeFile, readFile, readdir } from "fs/promises"
import { join } from "path"
import type {
  ProbeConfig,
  ProbeState,
  ProbeStatus,
  ProbePhase,
  Problem,
  IterationRecord,
  ProbeResult,
  AnalysisResult,
  FixPlan,
  FixResult,
  VerificationResult,
} from "../types.js"

/**
 * 生成会话 ID
 */
function generateSessionId(): string {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const time = now.toTimeString().slice(0, 8).replace(/:/g, "-")
  const rand = Math.random().toString(36).slice(2, 6)
  return `${date}_${time}_${rand}`
}

/**
 * 状态管理器
 */
export class StateManager {
  private state: ProbeState | null = null
  private outputDir: string = ""

  /**
   * 初始化新会话
   */
  async init(config: ProbeConfig): Promise<ProbeState> {
    const sessionId = generateSessionId()
    this.outputDir = join(config.cwd, ".claude", "iterative_probe", sessionId)

    // 创建目录结构
    await mkdir(this.outputDir, { recursive: true })
    await mkdir(join(this.outputDir, "probes"), { recursive: true })
    await mkdir(join(this.outputDir, "fixes"), { recursive: true })

    this.state = {
      sessionId,
      config,
      status: "running",
      phase: "init",
      currentIteration: 0,
      iterations: [],
      allProblems: [],
      startTime: Date.now(),
      outputDir: this.outputDir,
    }

    // 写入 goal.md
    await this.writeGoal()

    // 持久化状态
    await this.save()

    return this.state
  }

  /**
   * 获取当前状态
   */
  getState(): ProbeState | null {
    return this.state
  }

  /**
   * 更新状态
   */
  async updateStatus(status: ProbeStatus): Promise<void> {
    if (!this.state) throw new Error("State not initialized")
    this.state.status = status
    if (status === "completed" || status === "failed" || status === "stopped") {
      this.state.endTime = Date.now()
    }
    await this.save()
  }

  /**
   * 更新阶段
   */
  async updatePhase(phase: ProbePhase): Promise<void> {
    if (!this.state) throw new Error("State not initialized")
    this.state.phase = phase
    await this.save()
  }

  /**
   * 开始新迭代
   */
  async startIteration(): Promise<IterationRecord> {
    if (!this.state) throw new Error("State not initialized")

    this.state.currentIteration++
    const iteration: IterationRecord = {
      iteration: this.state.currentIteration,
      startTime: Date.now(),
      probeResults: [],
    }
    this.state.iterations.push(iteration)
    await this.save()
    return iteration
  }

  /**
   * 获取当前迭代
   */
  getCurrentIteration(): IterationRecord | null {
    if (!this.state || this.state.iterations.length === 0) return null
    return this.state.iterations[this.state.iterations.length - 1]
  }

  /**
   * 保存探测结果
   */
  async saveProbeResult(result: ProbeResult): Promise<void> {
    if (!this.state) throw new Error("State not initialized")

    const iteration = this.getCurrentIteration()
    if (!iteration) throw new Error("No active iteration")

    iteration.probeResults.push(result)

    // 写入文件
    const filename = `probe_${result.target.replace(/\s+/g, "_")}.md`
    await this.writeProbeResult(filename, result)

    // 收集问题
    for (const problem of result.problems) {
      if (!this.state.allProblems.find((p) => p.id === problem.id)) {
        this.state.allProblems.push(problem)
      }
    }

    await this.save()
  }

  /**
   * 保存分析结果
   */
  async saveAnalysis(analysis: AnalysisResult): Promise<void> {
    if (!this.state) throw new Error("State not initialized")

    const iteration = this.getCurrentIteration()
    if (!iteration) throw new Error("No active iteration")

    iteration.analysis = analysis

    // 更新问题列表
    for (const problem of analysis.problems) {
      const existing = this.state.allProblems.find((p) => p.id === problem.id)
      if (existing) {
        Object.assign(existing, problem)
      } else {
        this.state.allProblems.push(problem)
      }
    }

    // 写入文件
    await this.writeAnalysis(analysis)

    await this.save()
  }

  /**
   * 保存修复计划
   */
  async saveFixPlans(plans: FixPlan[]): Promise<void> {
    if (!this.state) throw new Error("State not initialized")

    const iteration = this.getCurrentIteration()
    if (!iteration) throw new Error("No active iteration")

    iteration.fixPlans = plans

    // 写入文件
    await this.writeFixPlans(plans)

    await this.save()
  }

  /**
   * 保存修复结果
   */
  async saveFixResult(result: FixResult): Promise<void> {
    if (!this.state) throw new Error("State not initialized")

    const iteration = this.getCurrentIteration()
    if (!iteration) throw new Error("No active iteration")

    if (!iteration.fixResults) iteration.fixResults = []
    iteration.fixResults.push(result)

    // 更新问题状态
    const problem = this.state.allProblems.find((p) => p.id === result.problemId)
    if (problem) {
      problem.fixed = result.success
      problem.fixResult = result.success
        ? "已修复"
        : result.error || "修复失败"
    }

    // 写入文件
    await this.writeFixResult(result)

    await this.save()
  }

  /**
   * 保存验证结果
   */
  async saveVerification(verification: VerificationResult): Promise<void> {
    if (!this.state) throw new Error("State not initialized")

    const iteration = this.getCurrentIteration()
    if (!iteration) throw new Error("No active iteration")

    iteration.verification = verification
    iteration.endTime = Date.now()

    // 写入文件
    await this.writeVerification(verification)

    await this.save()
  }

  /**
   * 生成最终摘要
   */
  async generateSummary(): Promise<string> {
    if (!this.state) throw new Error("State not initialized")

    const totalProblems = this.state.allProblems.length
    const fixedProblems = this.state.allProblems.filter((p) => p.fixed).length
    const duration = (this.state.endTime || Date.now()) - this.state.startTime

    const summary = `# 迭代探测报告

## 概览

| 指标 | 值 |
|------|-----|
| 会话 ID | ${this.state.sessionId} |
| 状态 | ${this.state.status} |
| 总迭代数 | ${this.state.currentIteration} |
| 发现问题 | ${totalProblems} |
| 已修复 | ${fixedProblems} |
| 耗时 | ${Math.round(duration / 1000)}s |

## 探测目标

${this.state.config.goal}

## 问题列表

| # | 问题 | 位置 | 类型 | 状态 |
|---|------|------|------|------|
${this.state.allProblems
  .map(
    (p, i) =>
      `| ${i + 1} | ${p.description} | ${p.location} | ${p.type} | ${p.fixed ? "✅" : "❌"} |`
  )
  .join("\n")}

## 迭代历史

${this.state.iterations
  .map(
    (iter) => `### 迭代 #${iter.iteration}

- 探测: ${iter.probeResults.length} 个目标
- 发现问题: ${iter.probeResults.reduce((sum, r) => sum + r.problems.length, 0)} 个
- 修复: ${iter.fixResults?.filter((r) => r.success).length || 0} 个
- 验证: ${iter.verification?.allPassed ? "✅ 通过" : "❌ 未通过"}
`
  )
  .join("\n")}

## 结论

${
  this.state.status === "completed" && fixedProblems === totalProblems
    ? "✅ 所有问题已修复，探测完成。"
    : `⚠️ 仍有 ${totalProblems - fixedProblems} 个问题未修复。`
}
`

    // 写入文件
    await writeFile(join(this.outputDir, "summary.md"), summary, "utf-8")

    return summary
  }

  /**
   * 设置错误
   */
  async setError(error: string): Promise<void> {
    if (!this.state) throw new Error("State not initialized")
    this.state.error = error
    this.state.status = "failed"
    this.state.endTime = Date.now()
    await this.save()
  }

  // ============================================================================
  // 私有方法 - 文件写入
  // ============================================================================

  private async save(): Promise<void> {
    if (!this.state) return
    await writeFile(
      join(this.outputDir, "state.json"),
      JSON.stringify(this.state, null, 2),
      "utf-8"
    )
  }

  private async writeGoal(): Promise<void> {
    if (!this.state) return

    const content = `# 探测目标

## 目标描述

${this.state.config.goal}

## 探测范围

${this.state.config.targets
  .map(
    (t) => `### ${t.name}

${t.description}

- 起点: ${t.start || "N/A"}
- 终点: ${t.end || "N/A"}
- 检查点: ${t.checkpoints?.join(", ") || "N/A"}
`
  )
  .join("\n")}

## 配置

- 最大迭代: ${this.state.config.maxIterations}
- 工作目录: ${this.state.config.cwd}
- 开始时间: ${new Date(this.state.startTime).toISOString()}
`

    await writeFile(join(this.outputDir, "goal.md"), content, "utf-8")
  }

  private async writeProbeResult(filename: string, result: ProbeResult): Promise<void> {
    const content = `# 探测结果 - ${result.target}

## 检查项

| 项目 | 状态 | 说明 |
|------|------|------|
${result.checks.map((c) => `| ${c.item} | ${c.passed ? "✅" : "❌"} | ${c.detail} |`).join("\n")}

## 发现问题

${
  result.problems.length === 0
    ? "无问题"
    : result.problems
        .map(
          (p) => `### ${p.id}: ${p.description}

- 位置: ${p.location}
- 类型: ${p.type}
- 严重程度: ${p.severity}
`
        )
        .join("\n")
}

${
  result.codeSnippets && result.codeSnippets.length > 0
    ? `## 关键代码片段

${result.codeSnippets
  .map(
    (s) => `### ${s.file}:${s.line}

\`\`\`
${s.code}
\`\`\`

${s.note}
`
  )
  .join("\n")}`
    : ""
}
`

    await writeFile(join(this.outputDir, "probes", filename), content, "utf-8")
  }

  private async writeAnalysis(analysis: AnalysisResult): Promise<void> {
    const content = `# 综合分析

## 问题汇总

| # | 问题 | 位置 | 类型 | 依赖 | 优先级 |
|---|------|------|------|------|--------|
${analysis.problems
  .map(
    (p, i) =>
      `| ${i + 1} | ${p.description} | ${p.location} | ${p.type} | ${p.dependsOn?.join(", ") || "独立"} | ${p.severity} |`
  )
  .join("\n")}

## 根因分析

${analysis.rootCause}

## 修复建议

${analysis.suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## 修复顺序

${analysis.fixOrder.map((id, i) => `${i + 1}. ${id}`).join("\n")}
`

    await writeFile(join(this.outputDir, "analysis.md"), content, "utf-8")
  }

  private async writeFixPlans(plans: FixPlan[]): Promise<void> {
    const content = `# 修复计划

${plans
  .map(
    (plan) => `## ${plan.problemId}

### 修复步骤

${plan.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

### 验证方法

${plan.verification}

### 并行执行

${plan.canParallel ? "✅ 可并行" : "❌ 需串行"}
`
  )
  .join("\n---\n\n")}
`

    await writeFile(join(this.outputDir, "fixes_plan.md"), content, "utf-8")
  }

  private async writeFixResult(result: FixResult): Promise<void> {
    const filename = `fix_${result.problemId}.md`
    const content = `# 修复结果 - ${result.problemId}

## 执行状态

${result.success ? "✅ 成功" : "❌ 失败"}

## 修改文件

${
  result.modifiedFiles.length === 0
    ? "无"
    : result.modifiedFiles.map((f) => `- \`${f.path}\`: ${f.changes}`).join("\n")
}

${result.error ? `## 错误信息\n\n${result.error}` : ""}
`

    await writeFile(join(this.outputDir, "fixes", filename), content, "utf-8")
  }

  private async writeVerification(verification: VerificationResult): Promise<void> {
    const content = `# 验证结果

## 总体状态

${verification.allPassed ? "✅ 全部通过" : "❌ 存在问题"}

## 验证项

| # | 验证项 | 状态 | 说明 |
|---|--------|------|------|
${verification.items
  .map((item, i) => `| ${i + 1} | ${item.description} | ${item.passed ? "✅" : "❌"} | ${item.detail} |`)
  .join("\n")}

${
  verification.remainingProblems.length > 0
    ? `## 遗留问题

${verification.remainingProblems.map((p) => `- ${p}`).join("\n")}`
    : ""
}
`

    await writeFile(join(this.outputDir, "verification.md"), content, "utf-8")
  }
}

/**
 * 创建状态管理器
 */
export function createStateManager(): StateManager {
  return new StateManager()
}
