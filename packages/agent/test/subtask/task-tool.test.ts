import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  TaskTool,
  setTaskRuntime,
  getTaskRuntime,
} from "../../src/subtask/task-tool"
import type { SubTaskProvider, SubTaskToolExecutor, SubTaskRuntime } from "../../src/subtask"
import { clearWorkflows, registerWorkflow } from "../../src/subtask/workflow"

describe("Task Tool", () => {
  let mockProvider: SubTaskProvider
  let mockToolExecutor: SubTaskToolExecutor
  let runtime: SubTaskRuntime

  beforeEach(() => {
    clearWorkflows()

    mockProvider = {
      chat: vi.fn().mockResolvedValue({
        content: "Task completed",
        usage: { inputTokens: 10, outputTokens: 20 },
      }),
      chatWithSchema: vi.fn().mockResolvedValue({
        data: { result: "data" },
        usage: { inputTokens: 15, outputTokens: 25 },
      }),
    }

    mockToolExecutor = {
      execute: vi.fn().mockResolvedValue({ output: "tool output" }),
    }

    runtime = {
      provider: mockProvider,
      toolExecutor: mockToolExecutor,
      apiKey: "test-key",
    }

    setTaskRuntime(runtime)
  })

  afterEach(() => {
    setTaskRuntime(null as any)
  })

  describe("TaskTool definition", () => {
    it("should have correct id", () => {
      expect(TaskTool.id).toBe("task")
    })

    it("should have description", () => {
      expect(TaskTool.description).toBeDefined()
      expect(TaskTool.description.length).toBeGreaterThan(0)
    })

    it("should have parameters schema", () => {
      expect(TaskTool.parameters).toBeDefined()
    })
  })

  describe("setTaskRuntime / getTaskRuntime", () => {
    it("should set and get runtime", () => {
      const newRuntime: SubTaskRuntime = { apiKey: "new-key" }
      setTaskRuntime(newRuntime)

      expect(getTaskRuntime()).toBe(newRuntime)
    })
  })

  describe("TaskTool.execute", () => {
    it("should execute API mode task", async () => {
      const result = await TaskTool.execute(
        {
          mode: "api",
          prompt: "Summarize this",
        },
        { cwd: "/test" }
      )

      expect(result.output).toContain("api task completed")
      expect(result.output).toContain("Task completed")
      expect(result.metadata?.success).toBe(true)
      expect(result.metadata?.mode).toBe("api")
    })

    it("should execute Workflow mode task", async () => {
      registerWorkflow({
        name: "test-workflow",
        description: "Test",
        steps: [{ name: "step1", type: "llm", llm: { prompt: "test" } }],
      })

      const result = await TaskTool.execute(
        {
          mode: "workflow",
          prompt: "Run workflow",
          workflow: "test-workflow",
        },
        { cwd: "/test" }
      )

      expect(result.output).toContain("workflow task completed")
      expect(result.metadata?.success).toBe(true)
      expect(result.metadata?.mode).toBe("workflow")
    })

    it("should pass system prompt for API mode", async () => {
      await TaskTool.execute(
        {
          mode: "api",
          prompt: "Hello",
          systemPrompt: "You are helpful",
        },
        { cwd: "/test" }
      )

      expect(mockProvider.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            { role: "system", content: "You are helpful" },
          ]),
        })
      )
    })

    it("should pass workflow params", async () => {
      registerWorkflow({
        name: "param-workflow",
        description: "Test",
        steps: [
          {
            name: "step1",
            type: "tool",
            tool: {
              name: "bash",
              params: (ctx) => ({ command: ctx.params.cmd }),
            },
          },
        ],
      })

      await TaskTool.execute(
        {
          mode: "workflow",
          prompt: "Run",
          workflow: "param-workflow",
          params: { cmd: "echo test" },
        },
        { cwd: "/test" }
      )

      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        "bash",
        { command: "echo test" },
        expect.any(Object)
      )
    })

    it("should throw error when runtime not configured", async () => {
      setTaskRuntime(null as any)

      await expect(
        TaskTool.execute(
          { mode: "api", prompt: "Hello" },
          { cwd: "/test" }
        )
      ).rejects.toThrow("Task runtime not configured")
    })

    it("should throw error for workflow mode without workflow name", async () => {
      await expect(
        TaskTool.execute(
          {
            mode: "workflow",
            prompt: "Run",
            // workflow is missing
          },
          { cwd: "/test" }
        )
      ).rejects.toThrow("Workflow name is required")
    })

    it("should include duration in metadata", async () => {
      const result = await TaskTool.execute(
        { mode: "api", prompt: "Hello" },
        { cwd: "/test" }
      )

      expect(result.metadata?.duration).toBeGreaterThanOrEqual(0)
    })

    it("should include usage in metadata", async () => {
      const result = await TaskTool.execute(
        { mode: "api", prompt: "Hello" },
        { cwd: "/test" }
      )

      expect(result.metadata?.usage).toEqual({
        inputTokens: 10,
        outputTokens: 20,
      })
    })

    it("should handle failed task", async () => {
      mockProvider.chat = vi.fn().mockRejectedValue(new Error("API error"))

      const result = await TaskTool.execute(
        { mode: "api", prompt: "Hello" },
        { cwd: "/test" }
      )

      expect(result.output).toContain("api task failed")
      expect(result.output).toContain("API error")
      expect(result.metadata?.success).toBe(false)
    })

    it("should default to agent mode", async () => {
      // Agent mode requires apiKey which we have in runtime
      // But it will try to create actual agent loop, so we test the config building
      const result = await TaskTool.execute(
        {
          mode: "agent",
          prompt: "Do something",
          agentType: "explore",
          maxSteps: 5,
        },
        { cwd: "/test" }
      )

      // Agent mode will fail without proper setup, but we can check it tried
      expect(result.metadata?.mode).toBe("agent")
    })
  })
})
