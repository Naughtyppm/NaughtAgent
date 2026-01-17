/**
 * 任务执行器测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  TaskExecutor,
  createTaskExecutor,
  type ExecutorEvent,
} from "../../../src/subtask/queue/executor"
import type { SubTaskConfig, SubTaskResult } from "../../../src/subtask/types"
import type { SubTaskRuntime } from "../../../src/subtask/runner"

// Mock runSubTask
vi.mock("../../../src/subtask/runner", () => ({
  runSubTask: vi.fn(async (config: SubTaskConfig): Promise<SubTaskResult> => {
    // Simulate some work
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Check if aborted
    if (config.abort?.aborted) {
      throw new Error("Task was cancelled")
    }

    return {
      success: true,
      output: `Result for ${config.prompt}`,
      usage: { inputTokens: 10, outputTokens: 5 },
      duration: 10,
    }
  }),
}))

describe("TaskExecutor", () => {
  let executor: TaskExecutor
  const mockRuntime: SubTaskRuntime = {
    provider: {
      chat: vi.fn(),
      chatWithSchema: vi.fn(),
    },
  }

  beforeEach(() => {
    executor = createTaskExecutor()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    // Wait for any pending tasks to complete or be cancelled
    try {
      executor.stop()
      // Give time for cleanup
      await new Promise((resolve) => setTimeout(resolve, 50))
    } catch {
      // Ignore errors during cleanup
    }
  })

  describe("basic operations", () => {
    it("should start in idle status", () => {
      expect(executor.getStatus()).toBe("idle")
    })

    it("should enqueue and execute a task", async () => {
      const config: SubTaskConfig = {
        mode: "ask_llm",
        prompt: "Test task",
      }

      const { taskId, promise } = executor.enqueue(config, mockRuntime)

      expect(taskId).toBeDefined()
      // Task may already be running by the time we check
      const status = executor.getExecution(taskId)?.status
      expect(["pending", "running"]).toContain(status)

      const result = await promise

      expect(result.success).toBe(true)
      expect(result.output).toContain("Test task")
      expect(executor.getExecution(taskId)?.status).toBe("done")
    })

    it("should execute tasks in order", async () => {
      const results: string[] = []

      const { promise: p1 } = executor.enqueue(
        { mode: "ask_llm", prompt: "Task 1" },
        mockRuntime
      )
      const { promise: p2 } = executor.enqueue(
        { mode: "ask_llm", prompt: "Task 2" },
        mockRuntime
      )
      const { promise: p3 } = executor.enqueue(
        { mode: "ask_llm", prompt: "Task 3" },
        mockRuntime
      )

      p1.then((r) => results.push(r.output))
      p2.then((r) => results.push(r.output))
      p3.then((r) => results.push(r.output))

      await Promise.all([p1, p2, p3])

      expect(results[0]).toContain("Task 1")
      expect(results[1]).toContain("Task 2")
      expect(results[2]).toContain("Task 3")
    })

    it("should track queue length", async () => {
      executor.pause() // Pause to prevent immediate execution

      const { promise: p1 } = executor.enqueue({ mode: "ask_llm", prompt: "Task 1" }, mockRuntime)
      const { promise: p2 } = executor.enqueue({ mode: "ask_llm", prompt: "Task 2" }, mockRuntime)

      expect(executor.getQueueLength()).toBe(2)

      // Resume and wait for completion to avoid unhandled rejections
      executor.resume()
      await Promise.all([p1, p2])
    })

    it("should track running count", async () => {
      const concurrentExecutor = createTaskExecutor({ concurrency: 2 })

      const { promise: p1 } = concurrentExecutor.enqueue(
        { mode: "ask_llm", prompt: "Task 1" },
        mockRuntime
      )
      const { promise: p2 } = concurrentExecutor.enqueue(
        { mode: "ask_llm", prompt: "Task 2" },
        mockRuntime
      )

      // Give time for tasks to start
      await new Promise((resolve) => setTimeout(resolve, 5))

      expect(concurrentExecutor.getRunningCount()).toBeLessThanOrEqual(2)

      await Promise.all([p1, p2])
      concurrentExecutor.stop()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  })

  describe("priority", () => {
    it("should execute higher priority tasks first", async () => {
      executor.pause()

      const results: string[] = []

      const { promise: p1 } = executor.enqueue(
        { mode: "ask_llm", prompt: "Low priority" },
        mockRuntime,
        { priority: 1 }
      )
      const { promise: p2 } = executor.enqueue(
        { mode: "ask_llm", prompt: "High priority" },
        mockRuntime,
        { priority: 10 }
      )
      const { promise: p3 } = executor.enqueue(
        { mode: "ask_llm", prompt: "Medium priority" },
        mockRuntime,
        { priority: 5 }
      )

      p1.then((r) => results.push(r.output))
      p2.then((r) => results.push(r.output))
      p3.then((r) => results.push(r.output))

      executor.resume()

      await Promise.all([p1, p2, p3])

      expect(results[0]).toContain("High priority")
      expect(results[1]).toContain("Medium priority")
      expect(results[2]).toContain("Low priority")
    })
  })

  describe("cancellation", () => {
    it("should cancel a queued task", async () => {
      executor.pause()

      const { taskId, promise } = executor.enqueue(
        { mode: "ask_llm", prompt: "Task to cancel" },
        mockRuntime
      )

      const cancelled = executor.cancel(taskId)

      expect(cancelled).toBe(true)
      expect(executor.getExecution(taskId)?.status).toBe("cancelled")

      await expect(promise).rejects.toThrow("cancelled")
    })

    it("should cancel a running task", async () => {
      const { taskId, promise } = executor.enqueue(
        { mode: "ask_llm", prompt: "Running task" },
        mockRuntime
      )

      // Give time for task to start
      await new Promise((resolve) => setTimeout(resolve, 5))

      const cancelled = executor.cancel(taskId)

      expect(cancelled).toBe(true)

      await expect(promise).rejects.toThrow("cancelled")
    })

    it("should cancel all tasks", async () => {
      executor.pause()

      const { promise: p1 } = executor.enqueue(
        { mode: "ask_llm", prompt: "Task 1" },
        mockRuntime
      )
      const { promise: p2 } = executor.enqueue(
        { mode: "ask_llm", prompt: "Task 2" },
        mockRuntime
      )

      executor.cancelAll()

      await expect(p1).rejects.toThrow("cancelled")
      await expect(p2).rejects.toThrow("cancelled")

      expect(executor.getQueueLength()).toBe(0)
    })
  })

  describe("pause and resume", () => {
    it("should pause execution", async () => {
      const { promise: p1 } = executor.enqueue(
        { mode: "ask_llm", prompt: "Task 1" },
        mockRuntime
      )

      await p1 // Wait for first task

      executor.pause()

      const { taskId, promise: p2 } = executor.enqueue({ mode: "ask_llm", prompt: "Task 2" }, mockRuntime)

      expect(executor.getStatus()).toBe("paused")
      expect(executor.getQueueLength()).toBe(1)

      // Resume and wait to avoid unhandled rejection
      executor.resume()
      await p2
    })

    it("should resume execution", async () => {
      executor.pause()

      const { promise } = executor.enqueue(
        { mode: "ask_llm", prompt: "Task" },
        mockRuntime
      )

      expect(executor.getQueueLength()).toBe(1)

      executor.resume()

      const result = await promise

      expect(result.success).toBe(true)
      expect(executor.getQueueLength()).toBe(0)
    })
  })

  describe("events", () => {
    it("should emit task_start event", async () => {
      const events: ExecutorEvent[] = []
      executor.on((event) => events.push(event))

      const { promise } = executor.enqueue(
        { mode: "ask_llm", prompt: "Task" },
        mockRuntime
      )

      await promise

      expect(events.some((e) => e.type === "task_start")).toBe(true)
    })

    it("should emit task_end event", async () => {
      const events: ExecutorEvent[] = []
      executor.on((event) => events.push(event))

      const { promise } = executor.enqueue(
        { mode: "ask_llm", prompt: "Task" },
        mockRuntime
      )

      await promise

      expect(events.some((e) => e.type === "task_end")).toBe(true)
    })

    it("should emit queue_empty event", async () => {
      const events: ExecutorEvent[] = []
      executor.on((event) => events.push(event))

      const { promise } = executor.enqueue(
        { mode: "ask_llm", prompt: "Task" },
        mockRuntime
      )

      await promise

      // Wait a bit for the event to be emitted
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(events.some((e) => e.type === "queue_empty")).toBe(true)
    })

    it("should emit status_change event", async () => {
      const events: ExecutorEvent[] = []
      executor.on((event) => events.push(event))

      const { promise } = executor.enqueue(
        { mode: "ask_llm", prompt: "Task" },
        mockRuntime
      )

      await promise

      const statusChanges = events.filter((e) => e.type === "status_change")
      expect(statusChanges.length).toBeGreaterThan(0)
    })

    it("should allow removing event listener", async () => {
      const events: ExecutorEvent[] = []
      const unsubscribe = executor.on((event) => events.push(event))

      unsubscribe()

      const { promise } = executor.enqueue(
        { mode: "ask_llm", prompt: "Task" },
        mockRuntime
      )

      await promise

      expect(events.length).toBe(0)
    })
  })

  describe("execution tracking", () => {
    it("should track all executions", async () => {
      const { promise: p1 } = executor.enqueue(
        { mode: "ask_llm", prompt: "Task 1" },
        mockRuntime
      )
      const { promise: p2 } = executor.enqueue(
        { mode: "ask_llm", prompt: "Task 2" },
        mockRuntime
      )

      await Promise.all([p1, p2])

      const executions = executor.getAllExecutions()
      expect(executions.length).toBe(2)
      expect(executions.every((e) => e.status === "done")).toBe(true)
    })

    it("should clear history", async () => {
      const { promise } = executor.enqueue(
        { mode: "ask_llm", prompt: "Task" },
        mockRuntime
      )

      await promise

      executor.clearHistory()

      expect(executor.getAllExecutions().length).toBe(0)
    })
  })

  describe("concurrency", () => {
    it("should respect concurrency limit", async () => {
      const concurrentExecutor = createTaskExecutor({ concurrency: 2 })
      let maxConcurrent = 0
      let currentConcurrent = 0

      const originalRunSubTask = vi.mocked(
        await import("../../../src/subtask/runner")
      ).runSubTask

      originalRunSubTask.mockImplementation(async () => {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
        await new Promise((resolve) => setTimeout(resolve, 20))
        currentConcurrent--
        return {
          success: true,
          output: "Result",
          usage: { inputTokens: 10, outputTokens: 5 },
          duration: 20,
        }
      })

      const promises = Array.from({ length: 5 }, (_, i) =>
        concurrentExecutor.enqueue({ mode: "ask_llm", prompt: `Task ${i}` }, mockRuntime)
      ).map((t) => t.promise)

      await Promise.all(promises)

      expect(maxConcurrent).toBeLessThanOrEqual(2)

      concurrentExecutor.stop()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  })
})

describe("createTaskExecutor", () => {
  it("should create executor with default config", () => {
    const executor = createTaskExecutor()
    expect(executor).toBeInstanceOf(TaskExecutor)
    executor.stop()
  })

  it("should create executor with custom config", () => {
    const executor = createTaskExecutor({
      concurrency: 3,
      defaultTimeout: 60000,
      retryCount: 2,
      retryDelay: 500,
    })
    expect(executor).toBeInstanceOf(TaskExecutor)
    executor.stop()
  })
})
