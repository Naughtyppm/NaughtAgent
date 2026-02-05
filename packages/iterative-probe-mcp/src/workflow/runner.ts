/**
 * 主工作流 - 程序控制的迭代循环
 */

import type {
  ProbeConfig,
  ProbeState,
  ProbeResult,
  AnalysisResult,
  FixPlan,
  FixResult,
  VerificationResult,
} from "../types.js"
import { StateManager } from "../state/manager.js"
import { runProbePhase } from "./probe.js"
import { runAnalyzePhase } from "./analyze.js"
import { runPlanPhase, runFixPhase } from "./fix.js"
import { runVerifyPhase } from "./verify.js"

/**
 * 工作流事件
 */
export type WorkflowEvent =
  | { type: "start"; config: ProbeConfig }
  | { type: "iteration_start"; iteration: number }
  | { type: "phase_start"; phase: string }
  | { type: "phase_end"; phase: string; result: unknown }
  | { type: "iteration_end"; iteration: number; passed: boolean }
  | { type: "complete"; state: ProbeState }
  | { type: "error"; error: string }

/**
 * 工作流事件监听器
 */
export type WorkflowEventListener = (event: WorkflowEvent) => void

/**
 * 工作流运行器
 */
export class WorkflowRunner {
  private stateManager: StateManager
  private listeners: WorkflowEventListener[] = []
  private aborted: boolean = false

  constructor() {
    this.stateManager = new StateManager()
  }

  /**
   * 添加事件监听器
   */
  on(listener: WorkflowEventListener): void {
    this.listeners.push(listener)
  }

  /**
   * 触发事件
   */
  private emit(event: WorkflowEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (e) {
        console.error("Event listener error:", e)
      }
    }
  }

  /**
   * 获取当前状态
   */
  getState(): ProbeState | null {
    return this.stateManager.getState()
  }

  /**
   * 停止工作流
   */
  stop(): void {
    this.aborted = true
  }

  /**
   * 运行工作流
   */
  async run(config: ProbeConfig): Promise<ProbeState> {
    this.aborted = false
    this.emit({ type: "start", config })

    // 初始化状态
    const state = await this.stateManager.init(config)
    console.log(`\n🎯 开始迭代探测`)
    console.log(`   目标: ${config.goal}`)
    console.log(`   会话: ${state.sessionId}`)
    console.log(`   输出: ${state.outputDir}\n`)

    try {
      // 主循环
      for (let i = 0; i < config.maxIterations; i++) {
        if (this.aborted) {
          console.log("\n⏹️ 用户停止")
          await this.stateManager.updateStatus("stopped")
          break
        }

        console.log(`\n${"=".repeat(60)}`)
        console.log(`   迭代 #${i + 1}`)
        console.log(`${"=".repeat(60)}\n`)

        this.emit({ type: "iteration_start", iteration: i + 1 })
        await this.stateManager.startIteration()

        // Phase 1: 探测
        console.log("📡 Phase 1: 探测...")
        this.emit({ type: "phase_start", phase: "probe" })
        await this.stateManager.updatePhase("probe")

        const probeResults = await runProbePhase(
          config.targets,
          config.cwd,
          config.goal,
          config.projectContext
        )

        for (const result of probeResults) {
          await this.stateManager.saveProbeResult(result)
        }

        this.emit({ type: "phase_end", phase: "probe", result: probeResults })
        console.log(`   发现 ${probeResults.reduce((s, r) => s + r.problems.length, 0)} 个问题`)

        // Phase 2: 分析
        console.log("\n🔍 Phase 2: 分析...")
        this.emit({ type: "phase_start", phase: "analyze" })
        await this.stateManager.updatePhase("analyze")

        const analysis = await runAnalyzePhase({
          probeResults,
          goal: config.goal,
          cwd: config.cwd,
        })

        await this.stateManager.saveAnalysis(analysis)
        this.emit({ type: "phase_end", phase: "analyze", result: analysis })

        // 检查是否有问题
        if (analysis.problems.length === 0) {
          console.log("\n✅ 无问题，探测完成")
          await this.stateManager.updateStatus("completed")
          break
        }

        console.log(`   根因: ${analysis.rootCause.slice(0, 100)}...`)
        console.log(`   修复顺序: ${analysis.fixOrder.join(" → ")}`)

        // Phase 3: 生成修复计划
        console.log("\n📋 Phase 3: 生成修复计划...")
        this.emit({ type: "phase_start", phase: "plan" })
        await this.stateManager.updatePhase("plan")

        const fixPlans = await runPlanPhase({
          analysis,
          cwd: config.cwd,
          projectContext: config.projectContext,
        })

        await this.stateManager.saveFixPlans(fixPlans)
        this.emit({ type: "phase_end", phase: "plan", result: fixPlans })
        console.log(`   生成 ${fixPlans.length} 个修复计划`)

        // Phase 4: 执行修复
        console.log("\n🔧 Phase 4: 执行修复...")
        this.emit({ type: "phase_start", phase: "fix" })
        await this.stateManager.updatePhase("fix")

        const fixResults = await runFixPhase(
          fixPlans,
          analysis.problems,
          config.cwd,
          config.projectContext
        )

        for (const result of fixResults) {
          await this.stateManager.saveFixResult(result)
        }

        this.emit({ type: "phase_end", phase: "fix", result: fixResults })
        const successCount = fixResults.filter((r) => r.success).length
        console.log(`   成功: ${successCount}/${fixResults.length}`)

        // Phase 5: 验证
        console.log("\n✔️ Phase 5: 验证...")
        this.emit({ type: "phase_start", phase: "verify" })
        await this.stateManager.updatePhase("verify")

        const verification = await runVerifyPhase({
          fixResults,
          problems: analysis.problems,
          goal: config.goal,
          cwd: config.cwd,
          projectContext: config.projectContext,
        })

        await this.stateManager.saveVerification(verification)
        this.emit({ type: "phase_end", phase: "verify", result: verification })

        const passed = verification.allPassed
        this.emit({ type: "iteration_end", iteration: i + 1, passed })

        if (passed) {
          console.log("\n✅ 验证通过，探测完成")
          await this.stateManager.updateStatus("completed")
          break
        }

        console.log(`\n⚠️ 仍有 ${verification.remainingProblems.length} 个问题`)

        // 检查是否是最后一轮
        if (i === config.maxIterations - 1) {
          console.log("\n⚠️ 达到最大迭代次数")
          await this.stateManager.updateStatus("completed")
        }
      }

      // 生成最终报告
      console.log("\n📄 生成报告...")
      await this.stateManager.updatePhase("done")
      const summary = await this.stateManager.generateSummary()

      const finalState = this.stateManager.getState()!
      this.emit({ type: "complete", state: finalState })

      console.log(`\n${"=".repeat(60)}`)
      console.log("   探测完成")
      console.log(`${"=".repeat(60)}`)
      console.log(`   状态: ${finalState.status}`)
      console.log(`   迭代: ${finalState.currentIteration}`)
      console.log(`   问题: ${finalState.allProblems.length}`)
      console.log(`   已修复: ${finalState.allProblems.filter((p) => p.fixed).length}`)
      console.log(`   报告: ${finalState.outputDir}/summary.md\n`)

      return finalState
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`\n❌ 错误: ${errorMsg}`)
      this.emit({ type: "error", error: errorMsg })
      await this.stateManager.setError(errorMsg)
      return this.stateManager.getState()!
    }
  }
}

/**
 * 创建工作流运行器
 */
export function createWorkflowRunner(): WorkflowRunner {
  return new WorkflowRunner()
}

/**
 * 运行迭代探测（简化 API）
 */
export async function runIterativeProbe(config: ProbeConfig): Promise<ProbeState> {
  const runner = createWorkflowRunner()
  return runner.run(config)
}
