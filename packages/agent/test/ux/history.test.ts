import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import {
  createOperationHistory,
  getGlobalHistory,
  resetGlobalHistory,
  type FileOperation,
} from "../../src/ux/history"

describe("OperationHistory", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "history-test-"))
    resetGlobalHistory()
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe("createOperationHistory", () => {
    it("should create empty history", () => {
      const history = createOperationHistory()
      expect(history.count).toBe(0)
    })

    it("should record operations", () => {
      const history = createOperationHistory()

      const op = history.record({
        type: "create",
        filePath: "/test/file.txt",
        newContent: "content",
        toolName: "write",
        sessionId: "session-1",
      })

      expect(op.id).toBeDefined()
      expect(op.timestamp).toBeDefined()
      expect(history.count).toBe(1)
    })

    it("should limit max operations", () => {
      const history = createOperationHistory({ maxOperations: 3 })

      for (let i = 0; i < 5; i++) {
        history.record({
          type: "create",
          filePath: `/test/file${i}.txt`,
          newContent: "content",
          toolName: "write",
          sessionId: "session-1",
        })
      }

      expect(history.count).toBe(3)
    })
  })

  describe("getRecent", () => {
    it("should return recent operations in reverse order", () => {
      const history = createOperationHistory()

      history.record({
        type: "create",
        filePath: "/test/file1.txt",
        newContent: "1",
        toolName: "write",
        sessionId: "s1",
      })

      history.record({
        type: "create",
        filePath: "/test/file2.txt",
        newContent: "2",
        toolName: "write",
        sessionId: "s1",
      })

      const recent = history.getRecent(2)

      expect(recent.length).toBe(2)
      expect(recent[0].filePath).toBe("/test/file2.txt")
      expect(recent[1].filePath).toBe("/test/file1.txt")
    })

    it("should limit results", () => {
      const history = createOperationHistory()

      for (let i = 0; i < 10; i++) {
        history.record({
          type: "create",
          filePath: `/test/file${i}.txt`,
          newContent: "content",
          toolName: "write",
          sessionId: "s1",
        })
      }

      const recent = history.getRecent(3)
      expect(recent.length).toBe(3)
    })
  })

  describe("getByFile", () => {
    it("should filter by file path", () => {
      const history = createOperationHistory()

      history.record({
        type: "create",
        filePath: "/test/a.txt",
        newContent: "a",
        toolName: "write",
        sessionId: "s1",
      })

      history.record({
        type: "modify",
        filePath: "/test/b.txt",
        previousContent: "old",
        newContent: "new",
        toolName: "edit",
        sessionId: "s1",
      })

      history.record({
        type: "modify",
        filePath: "/test/a.txt",
        previousContent: "a",
        newContent: "a2",
        toolName: "edit",
        sessionId: "s1",
      })

      const ops = history.getByFile("/test/a.txt")

      expect(ops.length).toBe(2)
      expect(ops.every((op) => op.filePath === "/test/a.txt")).toBe(true)
    })
  })

  describe("getBySession", () => {
    it("should filter by session id", () => {
      const history = createOperationHistory()

      history.record({
        type: "create",
        filePath: "/test/a.txt",
        newContent: "a",
        toolName: "write",
        sessionId: "session-1",
      })

      history.record({
        type: "create",
        filePath: "/test/b.txt",
        newContent: "b",
        toolName: "write",
        sessionId: "session-2",
      })

      history.record({
        type: "create",
        filePath: "/test/c.txt",
        newContent: "c",
        toolName: "write",
        sessionId: "session-1",
      })

      const ops = history.getBySession("session-1")

      expect(ops.length).toBe(2)
      expect(ops.every((op) => op.sessionId === "session-1")).toBe(true)
    })
  })

  describe("undoLast", () => {
    it("should return error for empty history", async () => {
      const history = createOperationHistory()

      const result = await history.undoLast()

      expect(result.success).toBe(false)
      expect(result.error).toContain("No operations")
    })

    it("should undo create by deleting file", async () => {
      const history = createOperationHistory()
      const filePath = path.join(tempDir, "created.txt")

      // Create file
      await fs.writeFile(filePath, "content", "utf-8")

      history.record({
        type: "create",
        filePath,
        newContent: "content",
        toolName: "write",
        sessionId: "s1",
      })

      const result = await history.undoLast()

      expect(result.success).toBe(true)
      expect(history.count).toBe(0)

      // File should be deleted
      await expect(fs.access(filePath)).rejects.toThrow()
    })

    it("should undo modify by restoring previous content", async () => {
      const history = createOperationHistory()
      const filePath = path.join(tempDir, "modified.txt")

      // Create file with new content
      await fs.writeFile(filePath, "new content", "utf-8")

      history.record({
        type: "modify",
        filePath,
        previousContent: "old content",
        newContent: "new content",
        toolName: "edit",
        sessionId: "s1",
      })

      const result = await history.undoLast()

      expect(result.success).toBe(true)

      // File should have old content
      const content = await fs.readFile(filePath, "utf-8")
      expect(content).toBe("old content")
    })

    it("should undo delete by recreating file", async () => {
      const history = createOperationHistory()
      const filePath = path.join(tempDir, "deleted.txt")

      history.record({
        type: "delete",
        filePath,
        previousContent: "original content",
        toolName: "bash",
        sessionId: "s1",
      })

      const result = await history.undoLast()

      expect(result.success).toBe(true)

      // File should exist with original content
      const content = await fs.readFile(filePath, "utf-8")
      expect(content).toBe("original content")
    })

    it("should fail if file was modified externally", async () => {
      const history = createOperationHistory()
      const filePath = path.join(tempDir, "external.txt")

      // Create file with different content than recorded
      await fs.writeFile(filePath, "externally modified", "utf-8")

      history.record({
        type: "modify",
        filePath,
        previousContent: "old",
        newContent: "new",
        toolName: "edit",
        sessionId: "s1",
      })

      const result = await history.undoLast()

      expect(result.success).toBe(false)
      expect(result.error).toContain("modified externally")
    })

    it("should fail to undo delete if file already exists", async () => {
      const history = createOperationHistory()
      const filePath = path.join(tempDir, "exists.txt")

      // File already exists
      await fs.writeFile(filePath, "existing", "utf-8")

      history.record({
        type: "delete",
        filePath,
        previousContent: "deleted content",
        toolName: "bash",
        sessionId: "s1",
      })

      const result = await history.undoLast()

      expect(result.success).toBe(false)
      expect(result.error).toContain("already exists")
    })
  })

  describe("undo by id", () => {
    it("should undo specific operation", async () => {
      const history = createOperationHistory()
      const filePath1 = path.join(tempDir, "file1.txt")
      const filePath2 = path.join(tempDir, "file2.txt")

      await fs.writeFile(filePath1, "content1", "utf-8")
      await fs.writeFile(filePath2, "content2", "utf-8")

      const op1 = history.record({
        type: "create",
        filePath: filePath1,
        newContent: "content1",
        toolName: "write",
        sessionId: "s1",
      })

      history.record({
        type: "create",
        filePath: filePath2,
        newContent: "content2",
        toolName: "write",
        sessionId: "s1",
      })

      // Undo first operation
      const result = await history.undo(op1.id)

      expect(result.success).toBe(true)
      expect(history.count).toBe(1)

      // First file should be deleted
      await expect(fs.access(filePath1)).rejects.toThrow()

      // Second file should still exist
      await expect(fs.access(filePath2)).resolves.toBeUndefined()
    })

    it("should return error for non-existent operation", async () => {
      const history = createOperationHistory()

      const result = await history.undo("non-existent-id")

      expect(result.success).toBe(false)
      expect(result.error).toContain("not found")
    })
  })

  describe("clear", () => {
    it("should clear all operations", () => {
      const history = createOperationHistory()

      history.record({
        type: "create",
        filePath: "/test/file.txt",
        newContent: "content",
        toolName: "write",
        sessionId: "s1",
      })

      history.clear()

      expect(history.count).toBe(0)
    })
  })

  describe("persistence", () => {
    it("should save and load history", async () => {
      const storagePath = path.join(tempDir, "history.json")

      const history1 = createOperationHistory({
        persist: true,
        storagePath,
      })

      history1.record({
        type: "create",
        filePath: "/test/file.txt",
        newContent: "content",
        toolName: "write",
        sessionId: "s1",
      })

      await history1.save()

      // Create new history and load
      const history2 = createOperationHistory({
        persist: true,
        storagePath,
      })

      await history2.load()

      expect(history2.count).toBe(1)
      expect(history2.getRecent(1)[0].filePath).toBe("/test/file.txt")
    })

    it("should handle missing storage file", async () => {
      const storagePath = path.join(tempDir, "nonexistent.json")

      const history = createOperationHistory({
        persist: true,
        storagePath,
      })

      await history.load()

      expect(history.count).toBe(0)
    })
  })

  describe("global history", () => {
    it("should return same instance", () => {
      const h1 = getGlobalHistory()
      const h2 = getGlobalHistory()

      expect(h1).toBe(h2)
    })

    it("should reset global history", () => {
      const h1 = getGlobalHistory()
      h1.record({
        type: "create",
        filePath: "/test/file.txt",
        newContent: "content",
        toolName: "write",
        sessionId: "s1",
      })

      resetGlobalHistory()

      const h2 = getGlobalHistory()
      expect(h2.count).toBe(0)
    })
  })
})
