/**
 * 工具超时配置完整性测试
 *
 * 确保所有子代理工具都有显式的超时配置，
 * 防止再出现 task 工具漏配导致 30s 默认超时的问题。
 */

import { describe, it, expect } from "vitest"
import { TOOL_TIMEOUTS, DEFAULT_TIMEOUT, getToolTimeout } from "../../../src/tool/tool"
import { SUBAGENT_TOOL_IDS } from "../../../src/tool/subagent/register"

describe("Tool Timeout Config", () => {
  describe("TOOL_TIMEOUTS completeness", () => {
    // 所有需要长超时的子代理工具 ID
    const LONG_TIMEOUT_TOOLS = [
      "ask_llm",
      "run_agent",
      "fork_agent",
      "task",
      "parallel_agents",
    ]

    for (const toolId of LONG_TIMEOUT_TOOLS) {
      it(`should have explicit timeout for '${toolId}'`, () => {
        expect(TOOL_TIMEOUTS[toolId]).toBeDefined()
        expect(TOOL_TIMEOUTS[toolId]).toBeGreaterThan(DEFAULT_TIMEOUT)
      })
    }

    it("should not use DEFAULT_TIMEOUT for any subagent core tool", () => {
      for (const toolId of LONG_TIMEOUT_TOOLS) {
        const timeout = getToolTimeout(toolId)
        expect(timeout).not.toBe(DEFAULT_TIMEOUT)
      }
    })
  })

  describe("getToolTimeout", () => {
    it("should return configured timeout for known tools", () => {
      expect(getToolTimeout("read")).toBe(TOOL_TIMEOUTS["read"])
      expect(getToolTimeout("run_agent")).toBe(TOOL_TIMEOUTS["run_agent"])
    })

    it("should return DEFAULT_TIMEOUT for unknown tools", () => {
      expect(getToolTimeout("nonexistent_tool_xyz")).toBe(DEFAULT_TIMEOUT)
    })
  })

  describe("timeout ordering sanity", () => {
    it("parallel_agents >= run_agent (runs multiple sub-agents)", () => {
      expect(TOOL_TIMEOUTS["parallel_agents"]).toBeGreaterThanOrEqual(TOOL_TIMEOUTS["run_agent"])
    })

    it("task >= run_agent (can dispatch to run_agent internally)", () => {
      expect(TOOL_TIMEOUTS["task"]).toBeGreaterThanOrEqual(TOOL_TIMEOUTS["run_agent"])
    })

    it("run_agent > ask_llm (agent loop > single call)", () => {
      expect(TOOL_TIMEOUTS["run_agent"]).toBeGreaterThan(TOOL_TIMEOUTS["ask_llm"])
    })

    it("ask_llm > bash (LLM call > shell command)", () => {
      expect(TOOL_TIMEOUTS["ask_llm"]).toBeGreaterThan(TOOL_TIMEOUTS["bash"])
    })
  })

  describe("SUBAGENT_TOOL_IDS", () => {
    it("should include parallel_agents", () => {
      expect(SUBAGENT_TOOL_IDS).toContain("parallel_agents")
    })

    it("should include task", () => {
      expect(SUBAGENT_TOOL_IDS).toContain("task")
    })

    it("should include run_agent and fork_agent", () => {
      expect(SUBAGENT_TOOL_IDS).toContain("run_agent")
      expect(SUBAGENT_TOOL_IDS).toContain("fork_agent")
    })
  })
})
