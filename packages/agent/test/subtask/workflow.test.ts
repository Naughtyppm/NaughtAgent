import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  runWorkflowTask,
  registerWorkflow,
  getWorkflow,
  listWorkflows,
  clearWorkflows,
} from "../../src/subtask/workflow"
import type {
  WorkflowTaskConfig,
  WorkflowDefinition,
  SubTaskProvider,
  SubTaskToolExecutor,
  WorkflowModeRuntime,
} from "../../src/subtask"
import { z } from "zod"

describe("Workflow Mode", () => {
  let mockProvider: SubTaskProvider
  let mockToolExecutor: SubTaskToolExecutor
  let runtime: WorkflowModeRuntime

  beforeEach(() => {
    clearWorkflows()

    mockProvider = {
      chat: vi.fn().mockResolvedValue({
        content: "LLM response",
        usage: { inputTokens: 10, outputTokens: 20 },
      }),
      chatWithSchema: vi.fn().mockResolvedValue({
        data: { type: "feat", message: "add feature" },
        usage: { inputTokens: 15, outputTokens: 25 },
      }),
    }

    mockToolExecutor = {
      execute: vi.fn().mockResolvedValue({
        output: "tool output",
      }),
    }

    runtime = {
      provider: mockProvider,
      toolExecutor: mockToolExecutor,
    }
  })

  describe("Workflow Registry", () => {
    it("should register workflow", () => {
      const workflow: WorkflowDefinition = {
        name: "test",
        description: "Test workflow",
        steps: [{ name: "step1", type: "llm", llm: { prompt: "test" } }],
      }

      registerWorkflow(workflow)

      expect(getWorkflow("test")).toEqual(workflow)
    })

    it("should list workflows", () => {
      registerWorkflow({
        name: "w1",
        description: "Workflow 1",
        steps: [],
      })
      registerWorkflow({
        name: "w2",
        description: "Workflow 2",
        steps: [],
      })

      const workflows = listWorkflows()

      expect(workflows).toHaveLength(2)
      expect(workflows.map((w) => w.name)).toContain("w1")
      expect(workflows.map((w) => w.name)).toContain("w2")
    })

    it("should clear workflows", () => {
      registerWorkflow({
        name: "test",
        description: "Test",
        steps: [],
      })

      clearWorkflows()

      expect(listWorkflows()).toHaveLength(0)
    })

    it("should return undefined for unknown workflow", () => {
      expect(getWorkflow("unknown")).toBeUndefined()
    })
  })

  describe("runWorkflowTask", () => {
    it("should return error for unknown workflow", async () => {
      const config: WorkflowTaskConfig = {
        mode: "workflow",
        prompt: "test",
        workflow: "unknown",
      }

      const result = await runWorkflowTask(config, runtime)

      expect(result.success).toBe(false)
      expect(result.error).toContain("not found")
    })

    it("should execute simple LLM step", async () => {
      registerWorkflow({
        name: "simple",
        description: "Simple workflow",
        steps: [
          {
            name: "generate",
            type: "llm",
            llm: { prompt: "Generate something" },
          },
        ],
      })

      const config: WorkflowTaskConfig = {
        mode: "workflow",
        prompt: "test",
        workflow: "simple",
      }

      const result = await runWorkflowTask(config, runtime)

      expect(result.success).toBe(true)
      expect(result.output).toBe("LLM response")
      expect(result.steps).toHaveLength(1)
      expect(result.steps![0].name).toBe("generate")
    })

    it("should execute tool step", async () => {
      registerWorkflow({
        name: "tool-workflow",
        description: "Tool workflow",
        steps: [
          {
            name: "run-tool",
            type: "tool",
            tool: {
              name: "bash",
              params: { command: "echo hello" },
            },
          },
        ],
      })

      const config: WorkflowTaskConfig = {
        mode: "workflow",
        prompt: "test",
        workflow: "tool-workflow",
      }

      const result = await runWorkflowTask(config, runtime)

      expect(result.success).toBe(true)
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        "bash",
        { command: "echo hello" },
        expect.any(Object)
      )
    })

    it("should execute multiple steps in sequence", async () => {
      registerWorkflow({
        name: "multi-step",
        description: "Multi-step workflow",
        steps: [
          {
            name: "step1",
            type: "tool",
            tool: { name: "bash", params: { command: "step1" } },
          },
          {
            name: "step2",
            type: "llm",
            llm: { prompt: "step2" },
          },
        ],
      })

      const config: WorkflowTaskConfig = {
        mode: "workflow",
        prompt: "test",
        workflow: "multi-step",
      }

      const result = await runWorkflowTask(config, runtime)

      expect(result.success).toBe(true)
      expect(result.steps).toHaveLength(2)
      expect(result.steps![0].name).toBe("step1")
      expect(result.steps![1].name).toBe("step2")
    })

    it("should handle condition step - then branch", async () => {
      registerWorkflow({
        name: "conditional",
        description: "Conditional workflow",
        steps: [
          {
            name: "check",
            type: "condition",
            condition: {
              check: () => true,
              then: "success",
              else: "failure",
            },
          },
          {
            name: "success",
            type: "llm",
            llm: { prompt: "Success!" },
          },
          {
            name: "failure",
            type: "llm",
            llm: { prompt: "Failure!" },
          },
        ],
      })

      const config: WorkflowTaskConfig = {
        mode: "workflow",
        prompt: "test",
        workflow: "conditional",
      }

      const result = await runWorkflowTask(config, runtime)

      expect(result.success).toBe(true)
      // check -> success -> failure (sequential after jump)
      expect(result.steps).toHaveLength(3)
      expect(result.steps![0].name).toBe("check")
      expect(result.steps![1].name).toBe("success")
    })

    it("should handle condition step - else branch", async () => {
      registerWorkflow({
        name: "conditional-else",
        description: "Conditional workflow",
        steps: [
          {
            name: "check",
            type: "condition",
            condition: {
              check: () => false,
              then: "success",
              else: "failure",
            },
          },
          {
            name: "success",
            type: "llm",
            llm: { prompt: "Success!" },
          },
          {
            name: "failure",
            type: "llm",
            llm: { prompt: "Failure!" },
          },
        ],
      })

      const config: WorkflowTaskConfig = {
        mode: "workflow",
        prompt: "test",
        workflow: "conditional-else",
      }

      const result = await runWorkflowTask(config, runtime)

      expect(result.success).toBe(true)
      expect(result.steps![1].name).toBe("failure")
    })

    it("should pass context between steps", async () => {
      mockToolExecutor.execute = vi.fn().mockResolvedValue({
        output: "diff content",
      })

      registerWorkflow({
        name: "context-test",
        description: "Context test",
        steps: [
          {
            name: "get-diff",
            type: "tool",
            tool: { name: "bash", params: { command: "git diff" } },
          },
          {
            name: "generate",
            type: "llm",
            llm: {
              prompt: (ctx) => `Diff: ${ctx.results["get-diff"]}`,
            },
          },
        ],
      })

      const config: WorkflowTaskConfig = {
        mode: "workflow",
        prompt: "test",
        workflow: "context-test",
      }

      await runWorkflowTask(config, runtime)

      expect(mockProvider.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: "Diff: diff content",
            }),
          ]),
        })
      )
    })

    it("should handle dynamic tool params", async () => {
      registerWorkflow({
        name: "dynamic-params",
        description: "Dynamic params",
        steps: [
          {
            name: "run",
            type: "tool",
            tool: {
              name: "bash",
              params: (ctx) => ({ command: `echo ${ctx.params.message}` }),
            },
          },
        ],
      })

      const config: WorkflowTaskConfig = {
        mode: "workflow",
        prompt: "test",
        workflow: "dynamic-params",
        params: { message: "hello" },
      }

      await runWorkflowTask(config, runtime)

      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        "bash",
        { command: "echo hello" },
        expect.any(Object)
      )
    })

    it("should handle abort signal", async () => {
      const controller = new AbortController()
      controller.abort()

      registerWorkflow({
        name: "abort-test",
        description: "Abort test",
        steps: [{ name: "step1", type: "llm", llm: { prompt: "test" } }],
      })

      const config: WorkflowTaskConfig = {
        mode: "workflow",
        prompt: "test",
        workflow: "abort-test",
        abort: controller.signal,
      }

      const result = await runWorkflowTask(config, runtime)

      expect(result.success).toBe(false)
      expect(result.error).toContain("aborted")
    })

    it("should handle step failure", async () => {
      mockToolExecutor.execute = vi.fn().mockResolvedValue({
        output: "",
        error: "Command failed",
      })

      registerWorkflow({
        name: "fail-test",
        description: "Fail test",
        steps: [
          {
            name: "failing-step",
            type: "tool",
            tool: { name: "bash", params: { command: "fail" } },
          },
        ],
      })

      const config: WorkflowTaskConfig = {
        mode: "workflow",
        prompt: "test",
        workflow: "fail-test",
      }

      const result = await runWorkflowTask(config, runtime)

      expect(result.success).toBe(false)
      expect(result.steps![0].success).toBe(false)
    })

    it("should continue on optional step failure", async () => {
      mockToolExecutor.execute = vi
        .fn()
        .mockResolvedValueOnce({ output: "", error: "Failed" })
        .mockResolvedValueOnce({ output: "success" })

      registerWorkflow({
        name: "optional-test",
        description: "Optional test",
        steps: [
          {
            name: "optional-step",
            type: "tool",
            tool: { name: "bash", params: { command: "maybe-fail" } },
            optional: true,
          },
          {
            name: "required-step",
            type: "tool",
            tool: { name: "bash", params: { command: "must-succeed" } },
          },
        ],
      })

      const config: WorkflowTaskConfig = {
        mode: "workflow",
        prompt: "test",
        workflow: "optional-test",
      }

      const result = await runWorkflowTask(config, runtime)

      expect(result.success).toBe(true)
      expect(result.steps).toHaveLength(2)
    })

    it("should handle empty workflow", async () => {
      registerWorkflow({
        name: "empty",
        description: "Empty workflow",
        steps: [],
      })

      const config: WorkflowTaskConfig = {
        mode: "workflow",
        prompt: "test",
        workflow: "empty",
      }

      const result = await runWorkflowTask(config, runtime)

      expect(result.success).toBe(false)
      expect(result.error).toContain("no steps")
    })

    it("should accumulate token usage", async () => {
      registerWorkflow({
        name: "token-test",
        description: "Token test",
        steps: [
          { name: "step1", type: "llm", llm: { prompt: "1" } },
          { name: "step2", type: "llm", llm: { prompt: "2" } },
        ],
      })

      const config: WorkflowTaskConfig = {
        mode: "workflow",
        prompt: "test",
        workflow: "token-test",
      }

      const result = await runWorkflowTask(config, runtime)

      expect(result.usage.inputTokens).toBe(20) // 10 + 10
      expect(result.usage.outputTokens).toBe(40) // 20 + 20
    })
  })
})
