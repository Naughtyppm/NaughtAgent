/**
 * Worker Pool 测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createWorkerPool } from "../../src/daemon/pool"
import { createTaskQueue, TaskPriority } from "../../src/daemon/queue"

describe("WorkerPool", () => {
  let queue: ReturnType<typeof createTaskQueue>
  let pool: ReturnType<typeof createWorkerPool>

  beforeEach(() => {
    queue = createTaskQueue({ maxSize: 100 })
  })

  afterEach(async () => {
    if (pool?.isRunning()) {
      await pool.forceStop()
    }
  })

  describe("start/stop", () => {
    it("should start and stop pool", async () => {
      pool = createWorkerPool({
        maxWorkers: 2,
        executor: async () => ({ success: true }),
        queue,
      })

      expect(pool.isRunning()).toBe(false)

      pool.start()
      expect(pool.isRunning()).toBe(true)

      await pool.stop()
      expect(pool.isRunning()).toBe(false)
    })

    it("should not start twice", () => {
      pool = createWorkerPool({
        maxWorkers: 2,
        executor: async () => ({ success: true }),
        queue,
      })

      pool.start()
      pool.start() // Should not throw

      expect(pool.isRunning()).toBe(true)
    })
  })

  describe("task execution", () => {
    it("should execute tasks from queue", async () => {
      const executor = vi.fn().mockResolvedValue({ success: true, output: "done" })

      pool = createWorkerPool({
        maxWorkers: 2,
        executor,
        queue,
      })

      pool.start()

      queue.enqueue("session-1", "message", { message: "Hello" })

      // Wait for task to complete
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(executor).toHaveBeenCalled()
    })

    it("should execute tasks in parallel", async () => {
      const executionOrder: string[] = []
      const executor = vi.fn().mockImplementation(async (task) => {
        executionOrder.push(`start-${task.sessionId}`)
        await new Promise((resolve) => setTimeout(resolve, 50))
        executionOrder.push(`end-${task.sessionId}`)
        return { success: true }
      })

      pool = createWorkerPool({
        maxWorkers: 2,
        executor,
        queue,
      })

      pool.start()

      // Add tasks for different sessions
      queue.enqueue("session-1", "message", { message: "msg-1" })
      queue.enqueue("session-2", "message", { message: "msg-2" })

      // Wait for tasks to complete
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Both should start before either ends (parallel execution)
      expect(executionOrder[0]).toBe("start-session-1")
      expect(executionOrder[1]).toBe("start-session-2")
    })

    it("should execute same session tasks serially", async () => {
      const executionOrder: string[] = []
      const executor = vi.fn().mockImplementation(async (task) => {
        executionOrder.push(`start-${task.input.message}`)
        await new Promise((resolve) => setTimeout(resolve, 30))
        executionOrder.push(`end-${task.input.message}`)
        return { success: true }
      })

      pool = createWorkerPool({
        maxWorkers: 3,
        executor,
        queue,
      })

      pool.start()

      // Add multiple tasks for same session
      queue.enqueue("session-1", "message", { message: "msg-1" })
      queue.enqueue("session-1", "message", { message: "msg-2" })

      // Wait for tasks to complete
      await new Promise((resolve) => setTimeout(resolve, 150))

      // First task should complete before second starts
      expect(executionOrder).toEqual([
        "start-msg-1",
        "end-msg-1",
        "start-msg-2",
        "end-msg-2",
      ])
    })
  })

  describe("getStatus", () => {
    it("should return pool status", () => {
      pool = createWorkerPool({
        maxWorkers: 3,
        executor: async () => ({ success: true }),
        queue,
      })

      const status = pool.getStatus()

      expect(status.running).toBe(false)
      expect(status.activeWorkers).toBe(0)
      expect(status.totalWorkers).toBe(3)
    })
  })

  describe("getWorkers", () => {
    it("should return worker list", () => {
      pool = createWorkerPool({
        maxWorkers: 2,
        executor: async () => ({ success: true }),
        queue,
      })

      const workers = pool.getWorkers()

      expect(workers.length).toBe(2)
      expect(workers[0].id).toBe(0)
      expect(workers[1].id).toBe(1)
      expect(workers[0].status).toBe("idle")
    })
  })

  describe("events", () => {
    it("should emit taskStarted event", async () => {
      const handler = vi.fn()

      pool = createWorkerPool({
        maxWorkers: 1,
        executor: async () => ({ success: true }),
        queue,
      })

      pool.on("taskStarted", handler)
      pool.start()

      queue.enqueue("session-1", "message", { message: "Hello" })

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(handler).toHaveBeenCalled()
    })

    it("should emit taskCompleted event", async () => {
      const handler = vi.fn()

      pool = createWorkerPool({
        maxWorkers: 1,
        executor: async () => ({ success: true, output: "done" }),
        queue,
      })

      pool.on("taskCompleted", handler)
      pool.start()

      queue.enqueue("session-1", "message", { message: "Hello" })

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(handler).toHaveBeenCalled()
    })

    it("should emit taskFailed event on error", async () => {
      const handler = vi.fn()

      pool = createWorkerPool({
        maxWorkers: 1,
        executor: async () => {
          throw new Error("Test error")
        },
        queue,
      })

      pool.on("taskFailed", handler)
      pool.start()

      queue.enqueue("session-1", "message", { message: "Hello" })

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(handler).toHaveBeenCalled()
    })

    it("should emit workerIdle event", async () => {
      const handler = vi.fn()

      pool = createWorkerPool({
        maxWorkers: 1,
        executor: async () => ({ success: true }),
        queue,
      })

      pool.on("workerIdle", handler)
      pool.start()

      queue.enqueue("session-1", "message", { message: "Hello" })

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(handler).toHaveBeenCalled()
    })
  })

  describe("forceStop", () => {
    it("should cancel running tasks", async () => {
      let taskCancelled = false

      pool = createWorkerPool({
        maxWorkers: 1,
        executor: async (task, signal) => {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 1000)
            signal.addEventListener("abort", () => {
              clearTimeout(timeout)
              taskCancelled = true
              reject(new Error("Aborted"))
            })
          })
          return { success: true }
        },
        queue,
      })

      pool.start()
      queue.enqueue("session-1", "message", { message: "Hello" })

      // Wait for task to start
      await new Promise((resolve) => setTimeout(resolve, 20))

      await pool.forceStop()

      expect(taskCancelled).toBe(true)
    })
  })
})
