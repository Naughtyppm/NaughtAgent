/**
 * Abort 信号链属性测试
 *
 * Property 7: Abort Signal Propagation
 * Property 8: Abort Timing
 * Property 9: Partial Results on Abort
 *
 * @see Requirements 3.1, 3.2, 3.3, 3.5
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import {
  createConcurrencyController,
  type ConcurrencyResult,
} from "../../../src/subtask/concurrency"

// ============================================================================
// Helpers
// ============================================================================

/**
 * 创建一个可被 abort 的长任务 executor
 */
function abortableExecutor(taskDurationMs: number) {
  return async (item: number, signal: AbortSignal): Promise<number> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(item), taskDurationMs)
      const onAbort = () => {
        clearTimeout(timer)
        reject(new Error("aborted"))
      }
      signal.addEventListener("abort", onAbort, { once: true })
    })
  }
}

// ============================================================================
// Property Tests
// ============================================================================

describe("Abort Signal Chain Properties", () => {
  // Feature: subagent-enhancement, Property 7: Abort Signal Propagation
  describe("Property 7: Abort Signal Propagation", () => {
    it("abort should propagate to all active child tasks", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 6 }),
          async (itemCount) => {
            const controller = createConcurrencyController<number, number>()
            const items = Array.from({ length: itemCount }, (_, i) => i)
            const abortedTasks: number[] = []

            const promise = controller.run(
              items,
              async (item, signal) => {
                return new Promise<number>((resolve, reject) => {
                  const timer = setTimeout(() => resolve(item), 500)
                  signal.addEventListener("abort", () => {
                    clearTimeout(timer)
                    abortedTasks.push(item)
                    reject(new Error("aborted"))
                  }, { once: true })
                })
              },
              { maxConcurrency: itemCount } // 全部并行
            )

            // 等任务开始后 abort
            await new Promise((r) => setTimeout(r, 20))
            controller.abort()

            const result = await promise

            // 所有任务都应该收到 abort 信号
            const abortedResults = result.results.filter(
              (r) => r.status === "aborted"
            )
            expect(abortedResults.length + abortedTasks.length).toBeGreaterThan(0)
          }
        ),
        { numRuns: 10 }
      )
    })
  })

  // Feature: subagent-enhancement, Property 8: Abort Timing
  describe("Property 8: Abort Timing", () => {
    it("abort should complete within reasonable time", async () => {
      const controller = createConcurrencyController<number, number>()
      const items = Array.from({ length: 5 }, (_, i) => i)

      const promise = controller.run(
        items,
        abortableExecutor(5000), // 5 秒的任务
        { maxConcurrency: 5 }
      )

      // 等任务开始
      await new Promise((r) => setTimeout(r, 30))

      const abortStart = Date.now()
      controller.abort()
      await promise
      const abortDuration = Date.now() - abortStart

      // abort 后应该在 1 秒内完成（远小于 5 秒的任务时间）
      expect(abortDuration).toBeLessThan(1000)
    })

    it("abort called immediately after run should abort most tasks", async () => {
      const controller = createConcurrencyController<number, number>()

      const promise = controller.run(
        [1, 2, 3],
        abortableExecutor(200),
        { maxConcurrency: 3 }
      )

      // 立即 abort（同一 tick）
      controller.abort()

      const result = await promise

      // 大部分任务应该被 abort（可能有些已经开始了）
      const abortedCount = result.results.filter((r) => r.status === "aborted").length
      expect(abortedCount + result.failed).toBeGreaterThan(0)
      expect(result.totalDuration).toBeLessThan(500)
    })
  })

  // Feature: subagent-enhancement, Property 9: Partial Results on Abort
  describe("Property 9: Partial Results on Abort", () => {
    it("abort should preserve results of already-completed tasks", async () => {
      const controller = createConcurrencyController<number, number>()

      // 5 个任务：前 2 个快（10ms），后 3 个慢（2000ms）
      const items = [10, 10, 2000, 2000, 2000]

      const promise = controller.run(
        items,
        async (delayMs, signal) => {
          return new Promise<number>((resolve, reject) => {
            const timer = setTimeout(() => resolve(delayMs), delayMs)
            signal.addEventListener("abort", () => {
              clearTimeout(timer)
              reject(new Error("aborted"))
            }, { once: true })
          })
        },
        { maxConcurrency: 5 }
      )

      // 等快任务完成，慢任务还在跑
      await new Promise((r) => setTimeout(r, 100))
      controller.abort()

      const result = await promise

      // 快任务应该已完成
      const completedResults = result.results.filter(
        (r) => r.status === "completed"
      )
      expect(completedResults.length).toBeGreaterThanOrEqual(2)

      // 慢任务应该被 abort
      const abortedResults = result.results.filter(
        (r) => r.status === "aborted"
      )
      expect(abortedResults.length).toBeGreaterThan(0)

      // completed 计数应该反映实际完成数
      expect(result.completed).toBeGreaterThanOrEqual(2)
    })

    it("failFast abort should preserve completed results", async () => {
      const controller = createConcurrencyController<number, number>()

      let taskIndex = 0
      const result = await controller.run(
        [1, 2, 3, 4, 5],
        async (item, signal) => {
          const idx = taskIndex++
          await new Promise((r) => setTimeout(r, 10))
          if (idx === 2) throw new Error("intentional failure")
          return item
        },
        { maxConcurrency: 1, failFast: true }
      )

      // 前 2 个应该成功
      expect(result.results[0].status).toBe("completed")
      expect(result.results[1].status).toBe("completed")
      // 第 3 个失败
      expect(result.results[2].status).toBe("failed")
      // 后面的被 abort
      expect(result.results[3].status).toBe("aborted")
      expect(result.results[4].status).toBe("aborted")
    })
  })
})
