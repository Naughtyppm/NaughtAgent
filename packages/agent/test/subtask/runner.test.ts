import { describe, it, expect, vi, beforeEach } from "vitest"
import { runSubTask, type SubTaskRuntime } from "../../src/subtask/runner"
import type { SubTaskProvider, SubTaskToolExecutor } from "../../src/subtask/types"
import { clearWorkflows, registerWorkflow } from "../../src/subtask/workflow"

describe("SubTask Runner", () => {
  let mockProvider: SubTaskProvider
  let mockToolExecutor: SubTaskToolExecutor
  let runtime: SubTaskRuntime

  beforeEach(() => {
    clearWorkflows()

    mockProvider = {
      chat: vi.fn().mockResolvedValue({
        content: "Response",
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
  })

  describe("runSubTask", () => {
    it("should route API mode to runAPITask", async () => {
      const result = await runSubTask(
        {
          mode: "api",
          prompt: "Hello",
        },
        runtime
      )

      expect(result.success).toBe(true)
      expect(result.output).toBe("Response")
      expect(mockProvider.chat).toHaveBeenCalled()
    })

    it("should route Workflow mode to runWorkflowTask", async () => {
      registerWorkflow({
        name: "test-workflow",
        description: "Test",
        steps: [{ name: "step1", type: "llm", llm: { prompt: "test" } }],
      })

      const result = await runSubTask(
        {
          mode: "workflow",
          prompt: "Run workflow",
          workflow: "test-workflow",
        },
        runtime
      )

      expect(result.success).toBe(true)
    })

    it("should return error for API mode without provider", async () => {
      const result = await runSubTask(
        {
          mode: "api",
          prompt: "Hello",
        },
        { apiKey: "key" } // No provider
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain("Provider is required")
    })

    it("should return error for Workflow mode without provider", async () => {
      const result = await runSubTask(
        {
          mode: "workflow",
          prompt: "Run",
          workflow: "test",
        },
        { apiKey: "key" } // No provider
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain("Provider and toolExecutor are required")
    })

    it("should return error for Workflow mode without toolExecutor", async () => {
      const result = await runSubTask(
        {
          mode: "workflow",
          prompt: "Run",
          workflow: "test",
        },
        { provider: mockProvider } // No toolExecutor
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain("Provider and toolExecutor are required")
    })

    it("should return error for Agent mode without apiKey", async () => {
      const result = await runSubTask(
        {
          mode: "agent",
          prompt: "Do something",
        },
        { provider: mockProvider } // No apiKey
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain("API key is required")
    })

    it("should handle unknown mode", async () => {
      const result = await runSubTask(
        {
          mode: "unknown" as any,
          prompt: "Hello",
        },
        runtime
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain("Unknown mode")
    })
  })
})
