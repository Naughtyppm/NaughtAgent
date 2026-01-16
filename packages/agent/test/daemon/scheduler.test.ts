/**
 * 调度器测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createScheduler, TaskPriority } from "../../src/daemon/scheduler"

describe("Scheduler", () => {
  let scheduler: ReturnType<typeof createScheduler>

  beforeEach(() => {
    scheduler = createScheduler({
      maxConcurrentTasks: 2,
      maxQueueSize: 10,
      defaultTimeout: 5000,
      executor: async () => ({ success: true, output: "done" }),
    })
  })

  afterEach(async () => {
    if (scheduler?.isRunning()) {
      await scheduler.forceStop()
    }
  })

  describe("start/stop", () => {
    it("should start and stop scheduler", async () => {
      expect(scheduler.isRunning()).toBe(false)

      scheduler.start()
      expect(scheduler.isRunning()).toBe(true)

      await scheduler.stop()
      expect(scheduler.isRunning()).toBe(false)
    })

    it("should emit started event", () => {
      const handler = vi.fn()
      scheduler.on("started", handler)

      scheduler.start()

      expect(handler).toHaveBeenCalled()
    })

    it("should emit stopped event", async () => {
      const handler = vi.fn()
      scheduler.on("stopped", handler)

      scheduler.start()
      await scheduler.stop()

      expect(handler).toHaveBeenCalled()
    })
  })

  describe("submitMessage", () => {
    it("should submit message task", () => {
      scheduler.start()

      const task = scheduler.submitMessage("session-1", "Hello world")

      expect(task.id).toBeDefined()
      expect(task.sessionId).toBe("session-1")
      expect(task.type).toBe("message")
      expect(task.input.message).toBe("Hello world")
      expect(task.priority).toBe(TaskPriority.HIGH)
    })

    it("should use custom priority", () => {
      scheduler.start()

      const task = scheduler.submitMessage("session-1", "Hello", undefined, {
        priority: TaskPriority.LOW,
      })

      expect(task.priority).toBe(TaskPriority.LOW)
    })
  })

  describe("submitSkill", () => {
    it("should submit skill task", () => {
      scheduler.start()

      const task = scheduler.submitSkill("session-1", "commit", { message: "feat: add feature" })

      expect(task.type).toBe("skill")
      expect(task.input.skill).toBe("commit")
      expect(task.input.args).toEqual({ message: "feat: add feature" })
      expect(task.priority).toBe(TaskPriority.NORMAL)
    })
  })

  describe("submitSubtask", () => {
    it("should submit subtask", () => {
      scheduler.start()

      const task = scheduler.submitSubtask("session-1", { message: "Analyze code" })

      expect(task.type).toBe("subtask")
      expect(task.priority).toBe(TaskPriority.LOW)
    })
  })

  describe("submit", () => {
    it("should submit generic task", () => {
      scheduler.start()

      const task = scheduler.submit("session-1", "message", { message: "Hello" })

      expect(task.type).toBe("message")
    })
  })

  describe("cancel", () => {
    it("should cancel queued task", () => {
      scheduler.start()

      const task = scheduler.submitMessage("session-1", "Hello")
      const cancelled = scheduler.cancel(task.id)

      expect(cancelled).toBe(true)
      expect(scheduler.getTask(task.id)?.status).toBe("cancelled")
    })

    it("should emit taskCancelled event", () => {
      const handler = vi.fn()
      scheduler.on("taskCancelled", handler)
      scheduler.start()

      const task = scheduler.submitMessage("session-1", "Hello")
      scheduler.cancel(task.id)

      expect(handler).toHaveBeenCalled()
    })
  })

  describe("cancelSession", () => {
    it("should cancel all session tasks", () => {
      scheduler.start()

      scheduler.submitMessage("session-1", "msg-1")
      scheduler.submitMessage("session-1", "msg-2")
      scheduler.submitMessage("session-2", "msg-3")

      const cancelled = scheduler.cancelSession("session-1")

      expect(cancelled).toBe(2)
    })
  })

  describe("getTask", () => {
    it("should return task by id", () => {
      scheduler.start()

      const task = scheduler.submitMessage("session-1", "Hello")
      const retrieved = scheduler.getTask(task.id)

      expect(retrieved?.id).toBe(task.id)
    })

    it("should return null for unknown id", () => {
      scheduler.start()

      const task = scheduler.getTask("unknown-id")

      expect(task).toBeNull()
    })
  })

  describe("listTasks", () => {
    it("should list all tasks", () => {
      scheduler.start()

      scheduler.submitMessage("session-1", "msg-1")
      scheduler.submitSkill("session-2", "commit")

      const tasks = scheduler.listTasks()

      expect(tasks.length).toBe(2)
    })

    it("should filter by sessionId", () => {
      scheduler.start()

      scheduler.submitMessage("session-1", "msg-1")
      scheduler.submitMessage("session-2", "msg-2")

      const tasks = scheduler.listTasks({ sessionId: "session-1" })

      expect(tasks.length).toBe(1)
    })
  })

  describe("getSessionTasks", () => {
    it("should return tasks for session", () => {
      scheduler.start()

      scheduler.submitMessage("session-1", "msg-1")
      scheduler.submitMessage("session-1", "msg-2")
      scheduler.submitMessage("session-2", "msg-3")

      const tasks = scheduler.getSessionTasks("session-1")

      expect(tasks.length).toBe(2)
    })
  })

  describe("getStats", () => {
    it("should return scheduler stats", () => {
      scheduler.start()

      scheduler.submitMessage("session-1", "msg-1")
      scheduler.submitMessage("session-2", "msg-2")

      const stats = scheduler.getStats()

      expect(stats.running).toBe(true)
      expect(stats.total).toBe(2)
      expect(stats.totalWorkers).toBe(2)
    })
  })

  describe("getWorkers", () => {
    it("should return worker list", () => {
      scheduler.start()

      const workers = scheduler.getWorkers()

      expect(workers.length).toBe(2)
    })
  })

  describe("task execution", () => {
    it("should execute submitted tasks", async () => {
      const executor = vi.fn().mockResolvedValue({ success: true, output: "done" })

      scheduler = createScheduler({
        maxConcurrentTasks: 1,
        executor,
      })

      scheduler.start()
      scheduler.submitMessage("session-1", "Hello")

      // Wait for execution
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(executor).toHaveBeenCalled()
    })

    it("should emit taskStarted event", async () => {
      const handler = vi.fn()

      scheduler = createScheduler({
        maxConcurrentTasks: 1,
        executor: async () => ({ success: true }),
      })

      scheduler.on("taskStarted", handler)
      scheduler.start()
      scheduler.submitMessage("session-1", "Hello")

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(handler).toHaveBeenCalled()
    })

    it("should emit taskCompleted event", async () => {
      const handler = vi.fn()

      scheduler = createScheduler({
        maxConcurrentTasks: 1,
        executor: async () => ({ success: true, output: "done" }),
      })

      scheduler.on("taskCompleted", handler)
      scheduler.start()
      scheduler.submitMessage("session-1", "Hello")

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(handler).toHaveBeenCalled()
    })

    it("should emit taskFailed event on error", async () => {
      const handler = vi.fn()

      scheduler = createScheduler({
        maxConcurrentTasks: 1,
        executor: async () => {
          throw new Error("Test error")
        },
      })

      scheduler.on("taskFailed", handler)
      scheduler.start()
      scheduler.submitMessage("session-1", "Hello")

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(handler).toHaveBeenCalled()
    })
  })

  describe("cleanup", () => {
    it("should clean up old tasks", async () => {
      scheduler = createScheduler({
        maxConcurrentTasks: 1,
        executor: async () => ({ success: true }),
        taskMaxAge: 100,
      })

      scheduler.start()
      const task = scheduler.submitMessage("session-1", "Hello")

      // Wait for execution
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Manually set completedAt to old time
      const storedTask = scheduler.getTask(task.id)
      if (storedTask) {
        storedTask.completedAt = Date.now() - 200
      }

      const cleaned = scheduler.cleanup()

      expect(cleaned).toBe(1)
    })
  })
})
