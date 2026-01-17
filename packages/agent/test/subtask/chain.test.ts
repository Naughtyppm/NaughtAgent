/**
 * 链式调用测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { SubTaskChain, createChain, chain } from "../../src/subtask/chain"
import type { SubTaskRuntime } from "../../src/subtask/runner"
import type { SubTaskResult } from "../../src/subtask/types"

// Mock runSubTask
vi.mock("../../src/subtask/runner", () => ({
  runSubTask: vi.fn(async (config: any): Promise<SubTaskResult> => {
    return {
      success: true,
      output: `Result for: ${config.prompt || config.workflow || "unknown"}`,
      usage: { inputTokens: 10, outputTokens: 5 },
      duration: 10,
    }
  }),
}))

describe("SubTaskChain", () => {
  let runtime: SubTaskRuntime

  beforeEach(() => {
    runtime = {
      provider: {
        chat: vi.fn(),
        chatWithSchema: vi.fn(),
      },
    }
    vi.clearAllMocks()
  })

  describe("basic chaining", () => {
    it("should execute single askLlm step", async () => {
      const result = await createChain(runtime)
        .askLlm("Test prompt")
        .execute()

      expect(result.success).toBe(true)
      expect(result.output).toContain("Test prompt")
    })

    it("should execute multiple steps in order", async () => {
      const { runSubTask } = await import("../../src/subtask/runner")
      const mockRunSubTask = vi.mocked(runSubTask)

      const prompts: string[] = []
      mockRunSubTask.mockImplementation(async (config: any) => {
        prompts.push(config.prompt)
        return {
          success: true,
          output: `Result: ${config.prompt}`,
          usage: { inputTokens: 10, outputTokens: 5 },
          duration: 10,
        }
      })

      await createChain(runtime)
        .askLlm("Step 1")
        .askLlm("Step 2")
        .askLlm("Step 3")
        .execute()

      expect(prompts).toEqual(["Step 1", "Step 2", "Step 3"])
    })

    it("should pass previous result to next step", async () => {
      const { runSubTask } = await import("../../src/subtask/runner")
      const mockRunSubTask = vi.mocked(runSubTask)

      mockRunSubTask.mockImplementation(async (config: any) => {
        return {
          success: true,
          output: config.prompt,
          usage: { inputTokens: 10, outputTokens: 5 },
          duration: 10,
        }
      })

      const result = await createChain(runtime)
        .askLlm("First")
        .askLlm((prev) => `Second based on: ${prev?.output}`)
        .execute()

      expect(result.output).toContain("Second based on: First")
    })

    it("should stop on failure", async () => {
      const { runSubTask } = await import("../../src/subtask/runner")
      const mockRunSubTask = vi.mocked(runSubTask)

      let callCount = 0
      mockRunSubTask.mockImplementation(async () => {
        callCount++
        if (callCount === 2) {
          return {
            success: false,
            output: "",
            error: "Failed",
            usage: { inputTokens: 10, outputTokens: 5 },
            duration: 10,
          }
        }
        return {
          success: true,
          output: "OK",
          usage: { inputTokens: 10, outputTokens: 5 },
          duration: 10,
        }
      })

      const result = await createChain(runtime)
        .askLlm("Step 1")
        .askLlm("Step 2") // This will fail
        .askLlm("Step 3") // This should not run
        .execute()

      expect(result.success).toBe(false)
      expect(callCount).toBe(2)
    })
  })

  describe("different step types", () => {
    it("should support runAgent", async () => {
      const { runSubTask } = await import("../../src/subtask/runner")
      const mockRunSubTask = vi.mocked(runSubTask)

      await createChain(runtime)
        .runAgent("Agent task")
        .execute()

      expect(mockRunSubTask).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "run_agent", prompt: "Agent task" }),
        runtime
      )
    })

    it("should support forkAgent", async () => {
      const { runSubTask } = await import("../../src/subtask/runner")
      const mockRunSubTask = vi.mocked(runSubTask)

      await createChain(runtime)
        .forkAgent("Fork task")
        .execute()

      expect(mockRunSubTask).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "fork_agent", prompt: "Fork task" }),
        runtime
      )
    })

    it("should support runWorkflow", async () => {
      const { runSubTask } = await import("../../src/subtask/runner")
      const mockRunSubTask = vi.mocked(runSubTask)

      await createChain(runtime)
        .runWorkflow("my-workflow", { key: "value" })
        .execute()

      expect(mockRunSubTask).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "run_workflow",
          workflow: "my-workflow",
          params: { key: "value" },
        }),
        runtime
      )
    })

    it("should support mixed step types", async () => {
      const { runSubTask } = await import("../../src/subtask/runner")
      const mockRunSubTask = vi.mocked(runSubTask)

      const modes: string[] = []
      mockRunSubTask.mockImplementation(async (config: any) => {
        modes.push(config.mode)
        return {
          success: true,
          output: "OK",
          usage: { inputTokens: 10, outputTokens: 5 },
          duration: 10,
        }
      })

      await createChain(runtime)
        .askLlm("Analyze")
        .runAgent("Implement")
        .askLlm("Summarize")
        .execute()

      expect(modes).toEqual(["ask_llm", "run_agent", "ask_llm"])
    })
  })

  describe("conditional execution", () => {
    it("should execute when condition is true", async () => {
      const { runSubTask } = await import("../../src/subtask/runner")
      const mockRunSubTask = vi.mocked(runSubTask)

      const prompts: string[] = []
      mockRunSubTask.mockImplementation(async (config: any) => {
        prompts.push(config.prompt)
        return {
          success: true,
          output: "success",
          usage: { inputTokens: 10, outputTokens: 5 },
          duration: 10,
        }
      })

      await createChain(runtime)
        .askLlm("First")
        .when(
          (prev) => prev?.output === "success",
          (c) => c.askLlm("Conditional")
        )
        .execute()

      expect(prompts).toContain("Conditional")
    })

    it("should skip when condition is false", async () => {
      const { runSubTask } = await import("../../src/subtask/runner")
      const mockRunSubTask = vi.mocked(runSubTask)

      const prompts: string[] = []
      mockRunSubTask.mockImplementation(async (config: any) => {
        prompts.push(config.prompt)
        return {
          success: true,
          output: "failure",
          usage: { inputTokens: 10, outputTokens: 5 },
          duration: 10,
        }
      })

      await createChain(runtime)
        .askLlm("First")
        .when(
          (prev) => prev?.output === "success",
          (c) => c.askLlm("Conditional")
        )
        .askLlm("After")
        .execute()

      expect(prompts).not.toContain("Conditional")
      expect(prompts).toContain("After")
    })
  })

  describe("map transformation", () => {
    it("should transform result", async () => {
      const { runSubTask } = await import("../../src/subtask/runner")
      const mockRunSubTask = vi.mocked(runSubTask)

      mockRunSubTask.mockImplementation(async (config: any) => {
        return {
          success: true,
          output: config.prompt,
          usage: { inputTokens: 10, outputTokens: 5 },
          duration: 10,
        }
      })

      const result = await createChain(runtime)
        .askLlm("Original")
        .map((r) => ({ ...r, output: r.output.toUpperCase() }))
        .askLlm((prev) => `Based on: ${prev?.output}`)
        .execute()

      expect(result.output).toContain("Based on: ORIGINAL")
    })
  })

  describe("executeAll", () => {
    it("should collect all results", async () => {
      const { runSubTask } = await import("../../src/subtask/runner")
      const mockRunSubTask = vi.mocked(runSubTask)

      let counter = 0
      mockRunSubTask.mockImplementation(async () => {
        counter++
        return {
          success: true,
          output: `Result ${counter}`,
          usage: { inputTokens: 10, outputTokens: 5 },
          duration: 10,
        }
      })

      const { success, results, totalUsage, totalDuration } = await createChain(runtime)
        .askLlm("Step 1")
        .askLlm("Step 2")
        .askLlm("Step 3")
        .executeAll()

      expect(success).toBe(true)
      expect(results.length).toBe(3)
      expect(totalUsage.inputTokens).toBe(30)
      expect(totalUsage.outputTokens).toBe(15)
      expect(totalDuration).toBe(30)
    })

    it("should return partial results on failure", async () => {
      const { runSubTask } = await import("../../src/subtask/runner")
      const mockRunSubTask = vi.mocked(runSubTask)

      let counter = 0
      mockRunSubTask.mockImplementation(async () => {
        counter++
        if (counter === 2) {
          return {
            success: false,
            output: "",
            error: "Failed",
            usage: { inputTokens: 10, outputTokens: 5 },
            duration: 10,
          }
        }
        return {
          success: true,
          output: `Result ${counter}`,
          usage: { inputTokens: 10, outputTokens: 5 },
          duration: 10,
        }
      })

      const { success, results } = await createChain(runtime)
        .askLlm("Step 1")
        .askLlm("Step 2")
        .askLlm("Step 3")
        .executeAll()

      expect(success).toBe(false)
      expect(results.length).toBe(2)
    })
  })

  describe("options passing", () => {
    it("should pass options to askLlm", async () => {
      const { runSubTask } = await import("../../src/subtask/runner")
      const mockRunSubTask = vi.mocked(runSubTask)

      await createChain(runtime)
        .askLlm("Test", { systemPrompt: "You are helpful" })
        .execute()

      expect(mockRunSubTask).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "ask_llm",
          prompt: "Test",
          systemPrompt: "You are helpful",
        }),
        runtime
      )
    })

    it("should pass options to runAgent", async () => {
      const { runSubTask } = await import("../../src/subtask/runner")
      const mockRunSubTask = vi.mocked(runSubTask)

      await createChain(runtime)
        .runAgent("Test", { maxTurns: 5, agentType: "explore" })
        .execute()

      expect(mockRunSubTask).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "run_agent",
          prompt: "Test",
          maxTurns: 5,
          agentType: "explore",
        }),
        runtime
      )
    })
  })
})

describe("createChain", () => {
  it("should create a new chain", () => {
    const runtime: SubTaskRuntime = {
      provider: { chat: vi.fn(), chatWithSchema: vi.fn() },
    }
    const c = createChain(runtime)
    expect(c).toBeInstanceOf(SubTaskChain)
  })
})

describe("chain", () => {
  it("should be an alias for createChain", () => {
    const runtime: SubTaskRuntime = {
      provider: { chat: vi.fn(), chatWithSchema: vi.fn() },
    }
    const c = chain(runtime)
    expect(c).toBeInstanceOf(SubTaskChain)
  })
})
