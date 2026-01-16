/**
 * 任务队列测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  createTaskQueue,
  TaskPriority,
  type Task,
} from "../../src/daemon/queue"

describe("TaskQueue", () => {
  let queue: ReturnType<typeof createTaskQueue>

  beforeEach(() => {
    queue = createTaskQueue({ maxSize: 10 })
  })

  describe("enqueue", () => {
    it("should add task to queue", () => {
      const task = queue.enqueue("session-1", "message", { message: "Hello" })

      expect(task.id).toBeDefined()
      expect(task.sessionId).toBe("session-1")
      expect(task.type).toBe("message")
      expect(task.status).toBe("queued")
      expect(task.input.message).toBe("Hello")
    })

    it("should assign default priority", () => {
      const task = queue.enqueue("session-1", "message", { message: "Hello" })

      expect(task.priority).toBe(TaskPriority.NORMAL)
    })

    it("should use custom priority", () => {
      const task = queue.enqueue("session-1", "message", { message: "Hello" }, {
        priority: TaskPriority.HIGH,
      })

      expect(task.priority).toBe(TaskPriority.HIGH)
    })

    it("should throw when queue is full", () => {
      // Fill the queue
      for (let i = 0; i < 10; i++) {
        queue.enqueue(`session-${i}`, "message", { message: `msg-${i}` })
      }

      expect(() => {
        queue.enqueue("session-11", "message", { message: "overflow" })
      }).toThrow("Queue is full")
    })

    it("should emit enqueued event", () => {
      const handler = vi.fn()
      queue.on("enqueued", handler)

      const task = queue.enqueue("session-1", "message", { message: "Hello" })

      expect(handler).toHaveBeenCalledWith(task)
    })
  })

  describe("dequeue", () => {
    it("should return null for empty queue", () => {
      const task = queue.dequeue()

      expect(task).toBeNull()
    })

    it("should return task in priority order", () => {
      queue.enqueue("session-1", "message", { message: "low" }, { priority: TaskPriority.LOW })
      queue.enqueue("session-2", "message", { message: "high" }, { priority: TaskPriority.HIGH })
      queue.enqueue("session-3", "message", { message: "normal" }, { priority: TaskPriority.NORMAL })

      const task1 = queue.dequeue()
      const task2 = queue.dequeue()
      const task3 = queue.dequeue()

      expect(task1?.input.message).toBe("high")
      expect(task2?.input.message).toBe("normal")
      expect(task3?.input.message).toBe("low")
    })

    it("should update task status to running", () => {
      queue.enqueue("session-1", "message", { message: "Hello" })

      const task = queue.dequeue()

      expect(task?.status).toBe("running")
      expect(task?.startedAt).toBeDefined()
    })

    it("should exclude specified sessions", () => {
      queue.enqueue("session-1", "message", { message: "msg-1" })
      queue.enqueue("session-2", "message", { message: "msg-2" })

      const excludeSet = new Set(["session-1"])
      const task = queue.dequeue(excludeSet)

      expect(task?.sessionId).toBe("session-2")
    })

    it("should emit started event", () => {
      const handler = vi.fn()
      queue.on("started", handler)

      queue.enqueue("session-1", "message", { message: "Hello" })
      const task = queue.dequeue()

      expect(handler).toHaveBeenCalledWith(task)
    })
  })

  describe("complete", () => {
    it("should mark task as completed", () => {
      const task = queue.enqueue("session-1", "message", { message: "Hello" })
      queue.dequeue()

      const result = queue.complete(task.id, { success: true, output: "Done" })

      expect(result).toBe(true)
      expect(queue.getTask(task.id)?.status).toBe("completed")
      expect(queue.getTask(task.id)?.result?.output).toBe("Done")
    })

    it("should mark task as failed", () => {
      const task = queue.enqueue("session-1", "message", { message: "Hello" })
      queue.dequeue()

      queue.complete(task.id, { success: false, error: "Failed" })

      expect(queue.getTask(task.id)?.status).toBe("failed")
      expect(queue.getTask(task.id)?.result?.error).toBe("Failed")
    })

    it("should return false for non-running task", () => {
      const task = queue.enqueue("session-1", "message", { message: "Hello" })

      const result = queue.complete(task.id, { success: true })

      expect(result).toBe(false)
    })

    it("should emit completed event", () => {
      const handler = vi.fn()
      queue.on("completed", handler)

      const task = queue.enqueue("session-1", "message", { message: "Hello" })
      queue.dequeue()
      queue.complete(task.id, { success: true })

      expect(handler).toHaveBeenCalled()
    })
  })

  describe("cancel", () => {
    it("should cancel queued task", () => {
      const task = queue.enqueue("session-1", "message", { message: "Hello" })

      const result = queue.cancel(task.id)

      expect(result).toBe(true)
      expect(queue.getTask(task.id)?.status).toBe("cancelled")
    })

    it("should cancel running task", () => {
      const task = queue.enqueue("session-1", "message", { message: "Hello" })
      queue.dequeue()

      const result = queue.cancel(task.id)

      expect(result).toBe(true)
      expect(queue.getTask(task.id)?.status).toBe("cancelled")
    })

    it("should not cancel completed task", () => {
      const task = queue.enqueue("session-1", "message", { message: "Hello" })
      queue.dequeue()
      queue.complete(task.id, { success: true })

      const result = queue.cancel(task.id)

      expect(result).toBe(false)
    })

    it("should emit cancelled event", () => {
      const handler = vi.fn()
      queue.on("cancelled", handler)

      const task = queue.enqueue("session-1", "message", { message: "Hello" })
      queue.cancel(task.id)

      expect(handler).toHaveBeenCalled()
    })
  })

  describe("cancelSession", () => {
    it("should cancel all tasks for session", () => {
      queue.enqueue("session-1", "message", { message: "msg-1" })
      queue.enqueue("session-1", "message", { message: "msg-2" })
      queue.enqueue("session-2", "message", { message: "msg-3" })

      const cancelled = queue.cancelSession("session-1")

      expect(cancelled).toBe(2)
    })
  })

  describe("getStatus", () => {
    it("should return queue status", () => {
      // Add 3 tasks
      const task1 = queue.enqueue("session-1", "message", { message: "msg-1" })
      queue.enqueue("session-2", "message", { message: "msg-2" })
      queue.enqueue("session-3", "message", { message: "msg-3" })

      // Dequeue task1 - now running
      queue.dequeue()

      // Complete task1
      queue.complete(task1.id, { success: true })

      const status = queue.getStatus()

      expect(status.queued).toBe(2)    // session-2, session-3 still queued
      expect(status.running).toBe(0)   // task1 completed
      expect(status.completed).toBe(1) // task1 completed
      expect(status.total).toBe(3)
    })
  })

  describe("listTasks", () => {
    it("should list all tasks", () => {
      queue.enqueue("session-1", "message", { message: "msg-1" })
      queue.enqueue("session-2", "skill", { skill: "commit" })

      const tasks = queue.listTasks()

      expect(tasks.length).toBe(2)
    })

    it("should filter by sessionId", () => {
      queue.enqueue("session-1", "message", { message: "msg-1" })
      queue.enqueue("session-2", "message", { message: "msg-2" })

      const tasks = queue.listTasks({ sessionId: "session-1" })

      expect(tasks.length).toBe(1)
      expect(tasks[0].sessionId).toBe("session-1")
    })

    it("should filter by status", () => {
      queue.enqueue("session-1", "message", { message: "msg-1" })
      const task2 = queue.enqueue("session-2", "message", { message: "msg-2" })

      // Dequeue and complete task2
      queue.dequeue() // dequeues task1 (first in queue)
      queue.dequeue() // dequeues task2
      queue.complete(task2.id, { success: true })

      const tasks = queue.listTasks({ status: "completed" })

      expect(tasks.length).toBe(1)
      expect(tasks[0].id).toBe(task2.id)
    })

    it("should filter by type", () => {
      queue.enqueue("session-1", "message", { message: "msg-1" })
      queue.enqueue("session-2", "skill", { skill: "commit" })

      const tasks = queue.listTasks({ type: "skill" })

      expect(tasks.length).toBe(1)
      expect(tasks[0].type).toBe("skill")
    })
  })

  describe("cleanup", () => {
    it("should remove old completed tasks", () => {
      const task = queue.enqueue("session-1", "message", { message: "msg-1" })
      queue.dequeue()
      queue.complete(task.id, { success: true })

      // Manually set completedAt to old time
      const storedTask = queue.getTask(task.id)
      if (storedTask) {
        storedTask.completedAt = Date.now() - 7200000 // 2 hours ago
      }

      const cleaned = queue.cleanup(3600000) // 1 hour max age

      expect(cleaned).toBe(1)
      expect(queue.getTask(task.id)).toBeNull()
    })
  })

  describe("clear", () => {
    it("should cancel all queued tasks", () => {
      queue.enqueue("session-1", "message", { message: "msg-1" })
      queue.enqueue("session-2", "message", { message: "msg-2" })

      queue.clear()

      expect(queue.getQueueLength()).toBe(0)
    })
  })
})
