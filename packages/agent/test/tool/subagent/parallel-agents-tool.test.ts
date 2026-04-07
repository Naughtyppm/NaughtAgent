/**
 * parallel_agents 工具单元测试
 *
 * 测试覆盖：
 * - 工具定义元数据
 * - 运行时未配置时的错误处理
 * - 深度限制
 * - 并行执行（mock runRunAgent）
 * - 部分失败不影响其他任务
 * - 事件发射（child_start / child_end / start / end）
 * - 结果汇总格式
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  ParallelAgentsTool,
  setParallelAgentsRuntime,
} from "../../../src/tool/subagent/parallel-agents-tool"
import {
  setGlobalSubAgentEventListener,
  type SubAgentEvent,
  type SubAgentEventListener,
} from "../../../src/subtask"
import type { RunAgentRuntime } from "../../../src/subtask/run-agent"

// Mock runRunAgent 以避免真实 LLM 调用
vi.mock("../../../src/subtask", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/subtask")>()
  return {
    ...actual,
    runRunAgent: vi.fn(),
  }
})

// 获取 mock 引用
import { runRunAgent } from "../../../src/subtask"
const mockRunRunAgent = vi.mocked(runRunAgent)

describe("ParallelAgentsTool", () => {
  const mockRuntime: RunAgentRuntime = {
    apiKey: "test-key",
    baseURL: "https://test.api.com",
    sessionId: "test-session-123",
  }

  const baseCtx = {
    cwd: "/test",
    depth: 0,
    sharedContextId: undefined,
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
    setParallelAgentsRuntime(mockRuntime)
    setGlobalSubAgentEventListener(null)
  })

  afterEach(() => {
    setParallelAgentsRuntime(null as any)
    setGlobalSubAgentEventListener(null)
  })

  // ========================================================================
  // 工具定义
  // ========================================================================
  describe("definition", () => {
    it("should have correct id", () => {
      expect(ParallelAgentsTool.id).toBe("parallel_agents")
    })

    it("should have description", () => {
      expect(ParallelAgentsTool.description).toContain("parallel")
    })

    it("should have parameters schema", () => {
      expect(ParallelAgentsTool.parameters).toBeDefined()
    })
  })

  // ========================================================================
  // 运行时校验
  // ========================================================================
  describe("runtime validation", () => {
    it("should error when runtime is not configured", async () => {
      setParallelAgentsRuntime(null as any)
      const result = await ParallelAgentsTool.execute(
        { tasks: [{ name: "test", prompt: "hello" }] },
        baseCtx
      )
      expect(result.output).toContain("Error")
      expect(result.metadata?.error).toBe(true)
    })
  })

  // ========================================================================
  // 深度限制
  // ========================================================================
  describe("depth limiting", () => {
    it("should reject when depth >= MAX_SUBAGENT_DEPTH", async () => {
      const result = await ParallelAgentsTool.execute(
        { tasks: [{ name: "test", prompt: "hello" }] },
        { ...baseCtx, depth: 3 }
      )
      expect(result.output).toContain("嵌套深度已达上限")
      expect(result.metadata?.error).toBe(true)
    })

    it("should allow depth < MAX_SUBAGENT_DEPTH", async () => {
      mockRunRunAgent.mockResolvedValue({
        success: true,
        output: "done",
        usage: { inputTokens: 10, outputTokens: 20 },
        duration: 100,
        steps: [],
      })

      const result = await ParallelAgentsTool.execute(
        { tasks: [{ name: "test", prompt: "hello" }] },
        { ...baseCtx, depth: 2 }
      )
      expect(result.output).toContain("Parallel Results")
    })
  })

  // ========================================================================
  // 并行执行
  // ========================================================================
  describe("parallel execution", () => {
    it("should execute all tasks in parallel", async () => {
      mockRunRunAgent.mockResolvedValue({
        success: true,
        output: "task done",
        usage: { inputTokens: 100, outputTokens: 50 },
        duration: 500,
        steps: [{ name: "read", type: "tool" as const, input: {}, output: "ok", duration: 50, success: true }],
      })

      const result = await ParallelAgentsTool.execute(
        {
          tasks: [
            { name: "task-a", prompt: "do A" },
            { name: "task-b", prompt: "do B" },
            { name: "task-c", prompt: "do C" },
          ],
        },
        baseCtx
      )

      // 验证 runRunAgent 被调用 3 次
      expect(mockRunRunAgent).toHaveBeenCalledTimes(3)

      // 验证结果汇总
      expect(result.output).toContain("3/3 succeeded")
      expect(result.output).toContain("task-a")
      expect(result.output).toContain("task-b")
      expect(result.output).toContain("task-c")
      expect(result.metadata?.succeeded).toBe(3)
      expect(result.metadata?.failed).toBe(0)
      expect(result.metadata?.total).toBe(3)
    })

    it("should pass correct config to each sub-agent", async () => {
      mockRunRunAgent.mockResolvedValue({
        success: true,
        output: "done",
        usage: { inputTokens: 10, outputTokens: 20 },
        duration: 100,
        steps: [],
      })

      await ParallelAgentsTool.execute(
        {
          tasks: [
            { name: "explore-task", prompt: "find code", agentType: "explore", maxTurns: 10 },
            { name: "build-task", prompt: "write code", tools: ["read", "write"] },
          ],
        },
        baseCtx
      )

      const calls = mockRunRunAgent.mock.calls

      // Task 1: explore, maxTurns 10
      expect(calls[0][0]).toMatchObject({
        prompt: "find code",
        agentType: "explore",
        maxTurns: 10,
        depth: 1,
      })

      // Task 2: default build, specific tools
      expect(calls[1][0]).toMatchObject({
        prompt: "write code",
        agentType: "build",
        tools: ["read", "write"],
        maxTurns: 30,
        depth: 1,
      })
    })

    it("should truly run in parallel (not sequential)", async () => {
      const callOrder: string[] = []

      mockRunRunAgent.mockImplementation(async (config) => {
        callOrder.push(`start:${config.prompt}`)
        // 模拟异步延迟
        await new Promise((r) => setTimeout(r, 50))
        callOrder.push(`end:${config.prompt}`)
        return {
          success: true,
          output: "done",
          usage: { inputTokens: 10, outputTokens: 20 },
          duration: 50,
          steps: [],
        }
      })

      await ParallelAgentsTool.execute(
        {
          tasks: [
            { name: "t1", prompt: "A" },
            { name: "t2", prompt: "B" },
          ],
        },
        baseCtx
      )

      // 并行执行时，两个 start 应该在任何 end 之前
      expect(callOrder[0]).toBe("start:A")
      expect(callOrder[1]).toBe("start:B")
    })
  })

  // ========================================================================
  // 部分失败
  // ========================================================================
  describe("partial failure", () => {
    it("should continue other tasks when one fails", async () => {
      mockRunRunAgent
        .mockResolvedValueOnce({
          success: true,
          output: "task A done",
          usage: { inputTokens: 100, outputTokens: 50 },
          duration: 200,
          steps: [],
        })
        .mockResolvedValueOnce({
          success: false,
          output: "",
          error: "API rate limit",
          usage: { inputTokens: 20, outputTokens: 0 },
          duration: 100,
          steps: [],
        })
        .mockResolvedValueOnce({
          success: true,
          output: "task C done",
          usage: { inputTokens: 100, outputTokens: 50 },
          duration: 300,
          steps: [],
        })

      const result = await ParallelAgentsTool.execute(
        {
          tasks: [
            { name: "ok-1", prompt: "A" },
            { name: "fail-1", prompt: "B" },
            { name: "ok-2", prompt: "C" },
          ],
        },
        baseCtx
      )

      expect(result.metadata?.succeeded).toBe(2)
      expect(result.metadata?.failed).toBe(1)
      expect(result.output).toContain("2/3 succeeded")
      expect(result.output).toContain("API rate limit")
    })

    it("should handle thrown exceptions from runRunAgent", async () => {
      mockRunRunAgent
        .mockResolvedValueOnce({
          success: true,
          output: "ok",
          usage: { inputTokens: 10, outputTokens: 20 },
          duration: 100,
          steps: [],
        })
        .mockRejectedValueOnce(new Error("Connection refused"))

      const result = await ParallelAgentsTool.execute(
        {
          tasks: [
            { name: "ok", prompt: "A" },
            { name: "crash", prompt: "B" },
          ],
        },
        baseCtx
      )

      expect(result.metadata?.succeeded).toBe(1)
      expect(result.metadata?.failed).toBe(1)
      expect(result.output).toContain("Connection refused")
    })

    it("should aggregate usage across all tasks", async () => {
      mockRunRunAgent
        .mockResolvedValueOnce({
          success: true,
          output: "a",
          usage: { inputTokens: 100, outputTokens: 50 },
          duration: 100,
          steps: [],
        })
        .mockResolvedValueOnce({
          success: true,
          output: "b",
          usage: { inputTokens: 200, outputTokens: 100 },
          duration: 200,
          steps: [],
        })

      const result = await ParallelAgentsTool.execute(
        {
          tasks: [
            { name: "t1", prompt: "A" },
            { name: "t2", prompt: "B" },
          ],
        },
        baseCtx
      )

      expect(result.metadata?.usage).toEqual({
        inputTokens: 300,
        outputTokens: 150,
      })
    })
  })

  // ========================================================================
  // 事件系统
  // ========================================================================
  describe("events", () => {
    it("should emit start event for parent", async () => {
      const events: SubAgentEvent[] = []
      setGlobalSubAgentEventListener((e) => events.push(e))

      mockRunRunAgent.mockResolvedValue({
        success: true,
        output: "done",
        usage: { inputTokens: 10, outputTokens: 20 },
        duration: 100,
        steps: [],
      })

      await ParallelAgentsTool.execute(
        { tasks: [{ name: "t1", prompt: "hello" }] },
        baseCtx
      )

      const startEvents = events.filter((e) => e.type === "start")
      // parallel_agents 本身发一次 start，runRunAgent 内部也会发（被 mock 跳过）
      expect(startEvents.length).toBeGreaterThanOrEqual(1)
      const parentStart = startEvents[0]
      expect(parentStart).toMatchObject({
        type: "start",
        mode: "parallel_agents",
      })
    })

    it("should emit child_start and child_end for each task", async () => {
      const events: SubAgentEvent[] = []
      setGlobalSubAgentEventListener((e) => events.push(e))

      mockRunRunAgent.mockResolvedValue({
        success: true,
        output: "done",
        usage: { inputTokens: 10, outputTokens: 20 },
        duration: 100,
        steps: [],
      })

      await ParallelAgentsTool.execute(
        {
          tasks: [
            { name: "task-x", prompt: "do X" },
            { name: "task-y", prompt: "do Y" },
          ],
        },
        baseCtx
      )

      const childStarts = events.filter((e) => e.type === "child_start")
      const childEnds = events.filter((e) => e.type === "child_end")

      expect(childStarts).toHaveLength(2)
      expect(childEnds).toHaveLength(2)

      // 验证 child_start 包含任务名
      const names = childStarts.map((e) => (e as any).childName)
      expect(names).toContain("task-x")
      expect(names).toContain("task-y")
    })

    it("should emit end event with aggregated result", async () => {
      const events: SubAgentEvent[] = []
      setGlobalSubAgentEventListener((e) => events.push(e))

      mockRunRunAgent.mockResolvedValue({
        success: true,
        output: "done",
        usage: { inputTokens: 50, outputTokens: 25 },
        duration: 100,
        steps: [],
      })

      await ParallelAgentsTool.execute(
        { tasks: [{ name: "t1", prompt: "hello" }] },
        baseCtx
      )

      const endEvents = events.filter((e) => e.type === "end")
      expect(endEvents.length).toBeGreaterThanOrEqual(1)

      // 最后一个 end 是 parallel_agents 的
      const parentEnd = endEvents[endEvents.length - 1] as any
      expect(parentEnd.success).toBe(true)
      expect(parentEnd.usage).toBeDefined()
    })
  })

  // ========================================================================
  // 边界情况
  // ========================================================================
  describe("edge cases", () => {
    it("should handle single task", async () => {
      mockRunRunAgent.mockResolvedValue({
        success: true,
        output: "single task result",
        usage: { inputTokens: 10, outputTokens: 20 },
        duration: 100,
        steps: [],
      })

      const result = await ParallelAgentsTool.execute(
        { tasks: [{ name: "solo", prompt: "do it" }] },
        baseCtx
      )

      expect(result.metadata?.total).toBe(1)
      expect(result.metadata?.succeeded).toBe(1)
    })

    it("should handle all tasks failing", async () => {
      mockRunRunAgent.mockResolvedValue({
        success: false,
        output: "",
        error: "All broken",
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: 50,
        steps: [],
      })

      const result = await ParallelAgentsTool.execute(
        {
          tasks: [
            { name: "f1", prompt: "A" },
            { name: "f2", prompt: "B" },
          ],
        },
        baseCtx
      )

      expect(result.metadata?.succeeded).toBe(0)
      expect(result.metadata?.failed).toBe(2)
      expect(result.output).toContain("0/2 succeeded")
    })
  })
})
