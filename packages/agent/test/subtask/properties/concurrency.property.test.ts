/**
 * 并发控制器属性测试
 *
 * Property 10: Concurrency Limiting
 * Property 11: Parallel Error Handling
 * Property 12: Timeout Enforcement
 *
 * @see Requirements 4.1, 4.2, 4.3, 4.4
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import {
  createConcurrencyController,
  mergeConcurrencyConfig,
  validateConcurrencyConfig,
  DEFAULT_CONCURRENCY_CONFIG,
  type ConcurrencyConfig,
  type TaskResult,
} from "../../../src/subtask/concurrency"

// ============================================================================
// Helpers
// ============================================================================

/** 创建一个延迟指定毫秒的 executor */
function delayExecutor<T>(ms: number) {
  return async (item: T, _signal: AbortSignal): Promise<T> => {
    await new Promise((resolve) => setTimeout(resolve, ms))
    return item
  }
}

/** 创建一个追踪并发数的 executor */
function trackingExecutor<T>(tracker: { current: number; max: number }, delayMs: number) {
  return async (item: T, _signal: AbortSignal): Promise<T> => {
    tracker.current++
    if (tracker.current > tracker.max) {
      tracker.max = tracker.current
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    tracker.current--
    return item
  }
}

/** 创建一个按索引失败的 executor */
function failingExecutor(failIndices: Set<number>) {
  let index = 0
  return async (item: string, _signal: AbortSignal): Promise<string> => {
    const currentIndex = index++
    await new Promise((resolve) => setTimeout(resolve, 5))
    if (failIndices.has(currentIndex)) {
      throw new Error(`Task ${currentIndex} failed`)
    }
    return item
  }
}

// ============================================================================
// Property Tests
// ============================================================================

describe("Concurrency Controller Properties", () => {
  // Feature: subagent-enhancement, Property 10: Concurrency Limiting
  describe("Property 10: Concurrency Limiting", () => {
    it("should never exceed maxConcurrency running tasks simultaneously", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 2, max: 10 }),
          async (maxConcurrency, itemCount) => {
            const tracker = { current: 0, max: 0 }
            const controller = createConcurrencyController<number, number>()
            const items = Array.from({ length: itemCount }, (_, i) => i)

            await controller.run(
              items,
              trackingExecutor(tracker, 10),
              { maxConcurrency }
            )

            expect(tracker.max).toBeLessThanOrEqual(maxConcurrency)
          }
        ),
        { numRuns: 20 }
      )
    })

    it("should process all items regardless of concurrency setting", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 8 }),
          async (maxConcurrency, items) => {
            const controller = createConcurrencyController<string, string>()

            const result = await controller.run(
              items,
              async (item) => item,
              { maxConcurrency }
            )

            expect(result.results.length).toBe(items.length)
            expect(result.completed).toBe(items.length)
            expect(result.failed).toBe(0)
          }
        ),
        { numRuns: 30 }
      )
    })
  })

  // Feature: subagent-enhancement, Property 11: Parallel Error Handling
  describe("Property 11: Parallel Error Handling", () => {
    it("with failFast=false, failing tasks should not prevent others from completing", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 3, max: 8 }),
          fc.integer({ min: 0, max: 2 }),
          async (itemCount, failIndex) => {
            const safeFailIndex = failIndex % itemCount
            const controller = createConcurrencyController<string, string>()
            const items = Array.from({ length: itemCount }, (_, i) => `item-${i}`)

            const result = await controller.run(
              items,
              failingExecutor(new Set([safeFailIndex])),
              { maxConcurrency: 2, failFast: false }
            )

            // 所有任务都应该有结果
            expect(result.results.length).toBe(itemCount)
            // 恰好 1 个失败
            expect(result.failed).toBe(1)
            // 其余成功
            expect(result.completed).toBe(itemCount - 1)
          }
        ),
        { numRuns: 20 }
      )
    })

    it("with failFast=true, first failure should abort remaining tasks", async () => {
      const controller = createConcurrencyController<string, string>()
      const items = Array.from({ length: 6 }, (_, i) => `item-${i}`)

      const result = await controller.run(
        items,
        failingExecutor(new Set([0])),
        { maxConcurrency: 1, failFast: true }
      )

      // 第一个任务失败后，剩余应被 abort
      expect(result.results[0].status).toBe("failed")
      const abortedCount = result.results.filter((r) => r.status === "aborted").length
      expect(abortedCount).toBeGreaterThan(0)
    })
  })

  // Feature: subagent-enhancement, Property 12: Timeout Enforcement
  describe("Property 12: Timeout Enforcement", () => {
    it("tasks exceeding timeout should be marked as timeout", async () => {
      const controller = createConcurrencyController<number, number>()

      const result = await controller.run(
        [1, 2, 3],
        async (item, signal) => {
          // 任务执行 200ms，超时设为 50ms
          await new Promise((resolve) => setTimeout(resolve, 200))
          if (signal.aborted) throw new Error("aborted")
          return item
        },
        { maxConcurrency: 3, timeout: 50 }
      )

      // 所有任务都应该超时
      for (const r of result.results) {
        expect(r.success).toBe(false)
        expect(r.status).toBe("timeout")
      }
      expect(result.failed).toBe(3)
    })

    it("tasks completing within timeout should succeed", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (itemCount) => {
            const controller = createConcurrencyController<number, number>()
            const items = Array.from({ length: itemCount }, (_, i) => i)

            const result = await controller.run(
              items,
              async (item) => {
                await new Promise((resolve) => setTimeout(resolve, 5))
                return item
              },
              { maxConcurrency: 3, timeout: 5000 }
            )

            expect(result.completed).toBe(itemCount)
            for (const r of result.results) {
              expect(r.success).toBe(true)
              expect(r.status).toBe("completed")
            }
          }
        ),
        { numRuns: 10 }
      )
    })
  })

  // Additional: Config validation properties
  describe("Config Validation Properties", () => {
    it("mergeConcurrencyConfig should always produce valid config", () => {
      fc.assert(
        fc.property(
          fc.record({
            maxConcurrency: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
            failFast: fc.option(fc.boolean(), { nil: undefined }),
            timeout: fc.option(fc.integer({ min: 1, max: 300000 }), { nil: undefined }),
          }),
          (partial) => {
            const config = mergeConcurrencyConfig(partial)
            expect(config.maxConcurrency).toBeGreaterThan(0)
            expect(typeof config.failFast).toBe("boolean")
            if (config.timeout !== undefined) {
              expect(config.timeout).toBeGreaterThan(0)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("validateConcurrencyConfig should reject invalid values", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -100, max: 0 }),
          (invalidConcurrency) => {
            const errors = validateConcurrencyConfig({ maxConcurrency: invalidConcurrency })
            expect(errors.length).toBeGreaterThan(0)
          }
        ),
        { numRuns: 50 }
      )
    })

    it("empty items should return empty results", async () => {
      const controller = createConcurrencyController<string, string>()
      const result = await controller.run(
        [],
        async (item) => item,
        { maxConcurrency: 3 }
      )
      expect(result.results).toHaveLength(0)
      expect(result.completed).toBe(0)
      expect(result.failed).toBe(0)
      expect(result.totalDuration).toBeLessThanOrEqual(50)
    })
  })

  // Additional: Abort support
  describe("Abort Support", () => {
    it("abort() should cancel running tasks", async () => {
      const controller = createConcurrencyController<number, number>()
      const items = Array.from({ length: 5 }, (_, i) => i)

      // 启动后立即 abort
      const promise = controller.run(
        items,
        async (item, signal) => {
          await new Promise((resolve) => setTimeout(resolve, 500))
          if (signal.aborted) throw new Error("aborted")
          return item
        },
        { maxConcurrency: 2 }
      )

      // 等一小段时间让任务开始
      await new Promise((resolve) => setTimeout(resolve, 20))
      controller.abort()

      const result = await promise
      // 应该有 aborted 的任务
      const abortedCount = result.results.filter((r) => r.status === "aborted").length
      expect(abortedCount).toBeGreaterThan(0)
    })

    it("progress callback should be called", async () => {
      const controller = createConcurrencyController<number, number>()
      const progressUpdates: number[] = []

      controller.onProgress((p) => {
        progressUpdates.push(p.completed)
      })

      await controller.run(
        [1, 2, 3],
        async (item) => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return item
        },
        { maxConcurrency: 2 }
      )

      expect(progressUpdates.length).toBeGreaterThan(0)
    })
  })
})
