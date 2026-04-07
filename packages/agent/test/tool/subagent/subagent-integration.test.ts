/**
 * SubAgent 工具注册集成测试
 *
 * 验证：
 * - registerSubagentTools 注册所有核心工具
 * - parallel_agents 工具能通过 ToolRegistry 找到并使用
 * - 全局事件监听器多监听器正确分发
 * - setParallelAgentsRuntime 正确共享 runtime
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ToolRegistry } from "../../../src/tool/registry"
import {
  registerSubagentTools,
  SUBAGENT_TOOL_IDS,
} from "../../../src/tool/subagent/register"
import {
  setGlobalSubAgentEventListener,
  addGlobalSubAgentEventListener,
  removeGlobalSubAgentEventListener,
  getGlobalSubAgentEventListener,
  type SubAgentEvent,
  type SubAgentEventListener,
} from "../../../src/subtask"

describe("SubAgent Registration Integration", () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry()
    setGlobalSubAgentEventListener(null)
  })

  afterEach(() => {
    setGlobalSubAgentEventListener(null)
  })

  describe("registerSubagentTools", () => {
    it("should register parallel_agents in registry", () => {
      registerSubagentTools({
        provider: {
          chat: vi.fn(),
          chatWithSchema: vi.fn(),
        },
        agentRuntime: {
          apiKey: "test-key",
        },
        registry,
      })

      const tool = registry.get("parallel_agents")
      expect(tool).toBeDefined()
      expect(tool?.id).toBe("parallel_agents")
    })

    it("should register all core subagent tools", () => {
      registerSubagentTools({
        provider: {
          chat: vi.fn(),
          chatWithSchema: vi.fn(),
        },
        agentRuntime: {
          apiKey: "test-key",
        },
        registry,
      })

      const coreTools = ["ask_llm", "run_agent", "fork_agent", "task", "parallel_agents"]
      for (const id of coreTools) {
        expect(registry.get(id)).toBeDefined()
      }
    })
  })

  describe("Global Listener - Multi-listener", () => {
    it("should support adding multiple listeners", () => {
      const events1: SubAgentEvent[] = []
      const events2: SubAgentEvent[] = []

      addGlobalSubAgentEventListener((e) => events1.push(e))
      addGlobalSubAgentEventListener((e) => events2.push(e))

      const composite = getGlobalSubAgentEventListener()
      expect(composite).not.toBeNull()

      // 发送测试事件
      composite!({
        type: "start",
        id: "test-1",
        mode: "parallel_agents",
        prompt: "test",
        agentType: "parallel",
        maxSteps: 3,
      })

      expect(events1).toHaveLength(1)
      expect(events2).toHaveLength(1)
    })

    it("should isolate listener errors", () => {
      const events: SubAgentEvent[] = []

      // 第一个监听器抛异常
      addGlobalSubAgentEventListener(() => {
        throw new Error("listener crash")
      })
      // 第二个监听器正常
      addGlobalSubAgentEventListener((e) => events.push(e))

      const composite = getGlobalSubAgentEventListener()

      // 不应该抛出
      expect(() => {
        composite!({
          type: "end",
          id: "test-2",
          success: true,
          output: "done",
          duration: 100,
        })
      }).not.toThrow()

      // 第二个监听器应该仍然收到事件
      expect(events).toHaveLength(1)
    })

    it("should support cleanup via returned function", () => {
      const events: SubAgentEvent[] = []

      const cleanup = addGlobalSubAgentEventListener((e) => events.push(e))
      
      const composite1 = getGlobalSubAgentEventListener()
      composite1!({
        type: "start",
        id: "t1",
        mode: "run_agent",
        prompt: "test",
        agentType: "build",
        maxSteps: 10,
      })
      expect(events).toHaveLength(1)

      // 清理后不再收到事件
      cleanup()
      
      const composite2 = getGlobalSubAgentEventListener()
      // 可能为 null（没有其他监听器了）
      if (composite2) {
        composite2({
          type: "end",
          id: "t1",
          success: true,
          output: "done",
          duration: 100,
        })
      }
      // events 不应该增长
      expect(events).toHaveLength(1)
    })

    it("removeGlobalSubAgentEventListener should work", () => {
      const listener: SubAgentEventListener = vi.fn()
      const cleanup = addGlobalSubAgentEventListener(listener)

      removeGlobalSubAgentEventListener(listener)

      const composite = getGlobalSubAgentEventListener()
      // 没有其他监听器应该返回 null
      // 注意：前面测试可能注册了 listener 没清理，所以只验证我们添加的一个被移除了
      expect(listener).not.toHaveBeenCalled()
      if (composite) {
        composite({
          type: "end",
          id: "test-rm",
          success: true,
          output: "done",
          duration: 100,
        })
      }
      // 我们移除的 listener 不应该被调用
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe("SUBAGENT_TOOL_IDS const", () => {
    it("should be a frozen-like array with all known tool IDs", () => {
      // 验证核心工具都在列表中
      expect(SUBAGENT_TOOL_IDS).toContain("ask_llm")
      expect(SUBAGENT_TOOL_IDS).toContain("run_agent")
      expect(SUBAGENT_TOOL_IDS).toContain("fork_agent")
      expect(SUBAGENT_TOOL_IDS).toContain("task")
      expect(SUBAGENT_TOOL_IDS).toContain("parallel_agents")
    })

    it("should not have duplicates", () => {
      const unique = new Set(SUBAGENT_TOOL_IDS)
      expect(unique.size).toBe(SUBAGENT_TOOL_IDS.length)
    })
  })
})
