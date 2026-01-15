import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  TodoTool,
  resetIdCounter,
  clearAllTodoLists,
} from "../../src/interaction/todo"
import {
  setInteractionCallbacks,
  resetInteractionCallbacks,
} from "../../src/interaction/callbacks"

describe("Todo Tool", () => {
  beforeEach(() => {
    clearAllTodoLists()
    resetInteractionCallbacks()
  })

  afterEach(() => {
    clearAllTodoLists()
    resetInteractionCallbacks()
  })

  describe("TodoTool definition", () => {
    it("should have correct id", () => {
      expect(TodoTool.id).toBe("todo")
    })

    it("should have description", () => {
      expect(TodoTool.description).toBeDefined()
      expect(TodoTool.description.length).toBeGreaterThan(0)
    })
  })

  describe("TodoTool.execute - add", () => {
    it("should add a task", async () => {
      const result = await TodoTool.execute(
        {
          action: "add",
          content: "Implement feature",
        },
        { cwd: "/test" }
      )

      expect(result.output).toContain("Added task")
      expect(result.output).toContain("Implement feature")
      expect(result.metadata?.action).toBe("add")
      expect(result.metadata?.item).toBeDefined()
      expect(result.metadata?.item.content).toBe("Implement feature")
      expect(result.metadata?.item.status).toBe("pending")
    })

    it("should generate unique IDs", async () => {
      const result1 = await TodoTool.execute(
        { action: "add", content: "Task 1" },
        { cwd: "/test" }
      )
      const result2 = await TodoTool.execute(
        { action: "add", content: "Task 2" },
        { cwd: "/test" }
      )

      expect(result1.metadata?.item.id).not.toBe(result2.metadata?.item.id)
    })

    it("should add subtask with parentId", async () => {
      const parent = await TodoTool.execute(
        { action: "add", content: "Parent task" },
        { cwd: "/test" }
      )

      const child = await TodoTool.execute(
        {
          action: "add",
          content: "Child task",
          parentId: parent.metadata?.item.id,
        },
        { cwd: "/test" }
      )

      expect(child.metadata?.item.parentId).toBe(parent.metadata?.item.id)
    })

    it("should require content for add", async () => {
      await expect(
        TodoTool.execute(
          { action: "add" },
          { cwd: "/test" }
        )
      ).rejects.toThrow("Content is required")
    })

    it("should require non-empty content", async () => {
      await expect(
        TodoTool.execute(
          { action: "add", content: "   " },
          { cwd: "/test" }
        )
      ).rejects.toThrow("Content is required")
    })

    it("should invoke todo update callback", async () => {
      const onTodoUpdate = vi.fn()
      setInteractionCallbacks({ onTodoUpdate })

      await TodoTool.execute(
        { action: "add", content: "Task" },
        { cwd: "/test" }
      )

      expect(onTodoUpdate).toHaveBeenCalled()
      expect(onTodoUpdate.mock.calls[0][0].items).toHaveLength(1)
    })
  })

  describe("TodoTool.execute - update", () => {
    it("should update task status", async () => {
      const addResult = await TodoTool.execute(
        { action: "add", content: "Task" },
        { cwd: "/test" }
      )
      const taskId = addResult.metadata?.item.id

      const result = await TodoTool.execute(
        {
          action: "update",
          id: taskId,
          status: "completed",
        },
        { cwd: "/test" }
      )

      expect(result.output).toContain("Updated task")
      expect(result.output).toContain("completed")
      expect(result.metadata?.item.status).toBe("completed")
    })

    it("should update to in_progress", async () => {
      const addResult = await TodoTool.execute(
        { action: "add", content: "Task" },
        { cwd: "/test" }
      )

      const result = await TodoTool.execute(
        {
          action: "update",
          id: addResult.metadata?.item.id,
          status: "in_progress",
        },
        { cwd: "/test" }
      )

      expect(result.metadata?.item.status).toBe("in_progress")
    })

    it("should handle non-existent task", async () => {
      const result = await TodoTool.execute(
        {
          action: "update",
          id: "non-existent",
          status: "completed",
        },
        { cwd: "/test" }
      )

      expect(result.output).toContain("not found")
      expect(result.metadata?.success).toBe(false)
    })

    it("should require id for update", async () => {
      await expect(
        TodoTool.execute(
          { action: "update", status: "completed" },
          { cwd: "/test" }
        )
      ).rejects.toThrow("ID is required")
    })

    it("should require status for update", async () => {
      await expect(
        TodoTool.execute(
          { action: "update", id: "1" },
          { cwd: "/test" }
        )
      ).rejects.toThrow("Status is required")
    })
  })

  describe("TodoTool.execute - remove", () => {
    it("should remove task", async () => {
      const addResult = await TodoTool.execute(
        { action: "add", content: "Task" },
        { cwd: "/test" }
      )

      const result = await TodoTool.execute(
        {
          action: "remove",
          id: addResult.metadata?.item.id,
        },
        { cwd: "/test" }
      )

      expect(result.output).toContain("Removed task")
      expect(result.metadata?.success).toBe(true)
    })

    it("should remove subtasks when removing parent", async () => {
      const parent = await TodoTool.execute(
        { action: "add", content: "Parent" },
        { cwd: "/test" }
      )
      await TodoTool.execute(
        { action: "add", content: "Child", parentId: parent.metadata?.item.id },
        { cwd: "/test" }
      )

      await TodoTool.execute(
        { action: "remove", id: parent.metadata?.item.id },
        { cwd: "/test" }
      )

      const listResult = await TodoTool.execute(
        { action: "list" },
        { cwd: "/test" }
      )

      expect(listResult.metadata?.items).toHaveLength(0)
    })

    it("should handle non-existent task", async () => {
      const result = await TodoTool.execute(
        { action: "remove", id: "non-existent" },
        { cwd: "/test" }
      )

      expect(result.output).toContain("not found")
      expect(result.metadata?.success).toBe(false)
    })

    it("should require id for remove", async () => {
      await expect(
        TodoTool.execute(
          { action: "remove" },
          { cwd: "/test" }
        )
      ).rejects.toThrow("ID is required")
    })
  })

  describe("TodoTool.execute - list", () => {
    it("should list empty tasks", async () => {
      const result = await TodoTool.execute(
        { action: "list" },
        { cwd: "/test" }
      )

      expect(result.output).toContain("No tasks")
      expect(result.metadata?.items).toHaveLength(0)
    })

    it("should list tasks with stats", async () => {
      await TodoTool.execute(
        { action: "add", content: "Task 1" },
        { cwd: "/test" }
      )
      const task2 = await TodoTool.execute(
        { action: "add", content: "Task 2" },
        { cwd: "/test" }
      )
      await TodoTool.execute(
        { action: "update", id: task2.metadata?.item.id, status: "completed" },
        { cwd: "/test" }
      )

      const result = await TodoTool.execute(
        { action: "list" },
        { cwd: "/test" }
      )

      expect(result.output).toContain("2 total")
      expect(result.output).toContain("1 completed")
      expect(result.output).toContain("1 pending")
      expect(result.metadata?.items).toHaveLength(2)
    })

    it("should show task hierarchy", async () => {
      const parent = await TodoTool.execute(
        { action: "add", content: "Parent" },
        { cwd: "/test" }
      )
      await TodoTool.execute(
        { action: "add", content: "Child", parentId: parent.metadata?.item.id },
        { cwd: "/test" }
      )

      const result = await TodoTool.execute(
        { action: "list" },
        { cwd: "/test" }
      )

      expect(result.output).toContain("Parent")
      expect(result.output).toContain("Child")
    })
  })

  describe("TodoTool.execute - clear", () => {
    it("should clear all tasks", async () => {
      await TodoTool.execute(
        { action: "add", content: "Task 1" },
        { cwd: "/test" }
      )
      await TodoTool.execute(
        { action: "add", content: "Task 2" },
        { cwd: "/test" }
      )

      const result = await TodoTool.execute(
        { action: "clear" },
        { cwd: "/test" }
      )

      expect(result.output).toContain("Cleared 2 task")
      expect(result.metadata?.count).toBe(2)
    })

    it("should handle clearing empty list", async () => {
      const result = await TodoTool.execute(
        { action: "clear" },
        { cwd: "/test" }
      )

      expect(result.output).toContain("Cleared 0 task")
    })
  })

  describe("Session isolation", () => {
    it("should isolate tasks by session (cwd)", async () => {
      await TodoTool.execute(
        { action: "add", content: "Session 1 task" },
        { cwd: "/session1" }
      )
      await TodoTool.execute(
        { action: "add", content: "Session 2 task" },
        { cwd: "/session2" }
      )

      const list1 = await TodoTool.execute(
        { action: "list" },
        { cwd: "/session1" }
      )
      const list2 = await TodoTool.execute(
        { action: "list" },
        { cwd: "/session2" }
      )

      expect(list1.metadata?.items).toHaveLength(1)
      expect(list1.metadata?.items[0].content).toBe("Session 1 task")
      expect(list2.metadata?.items).toHaveLength(1)
      expect(list2.metadata?.items[0].content).toBe("Session 2 task")
    })
  })

  describe("Status icons", () => {
    it("should show correct icons in list", async () => {
      await TodoTool.execute(
        { action: "add", content: "Pending" },
        { cwd: "/test" }
      )
      const task2 = await TodoTool.execute(
        { action: "add", content: "In Progress" },
        { cwd: "/test" }
      )
      await TodoTool.execute(
        { action: "update", id: task2.metadata?.item.id, status: "in_progress" },
        { cwd: "/test" }
      )
      const task3 = await TodoTool.execute(
        { action: "add", content: "Completed" },
        { cwd: "/test" }
      )
      await TodoTool.execute(
        { action: "update", id: task3.metadata?.item.id, status: "completed" },
        { cwd: "/test" }
      )

      const result = await TodoTool.execute(
        { action: "list" },
        { cwd: "/test" }
      )

      expect(result.output).toContain("□") // pending
      expect(result.output).toContain("◐") // in_progress
      expect(result.output).toContain("✓") // completed
    })
  })
})
