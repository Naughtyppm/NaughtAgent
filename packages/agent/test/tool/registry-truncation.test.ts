/**
 * ToolRegistry 截断集成测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { z } from "zod"
import { Tool } from "../../src/tool/tool"
import { ToolRegistry } from "../../src/tool/registry"

describe("ToolRegistry - Truncation Integration", () => {
  beforeEach(() => {
    ToolRegistry.clear()
  })

  afterEach(() => {
    ToolRegistry.clear()
  })

  describe("configureTruncation", () => {
    it("should enable truncation with default config", () => {
      ToolRegistry.configureTruncation({ enabled: true })
      
      const config = ToolRegistry.getTruncationConfig()
      expect(config.enabled).toBe(true)
    })

    it("should enable truncation with custom config", () => {
      ToolRegistry.configureTruncation({
        enabled: true,
        config: { maxOutputTokens: 2000 },
      })
      
      const config = ToolRegistry.getTruncationConfig()
      expect(config.enabled).toBe(true)
      expect(config.config?.maxOutputTokens).toBe(2000)
    })

    it("should disable truncation", () => {
      ToolRegistry.configureTruncation({ enabled: true })
      ToolRegistry.configureTruncation({ enabled: false })
      
      const config = ToolRegistry.getTruncationConfig()
      expect(config.enabled).toBe(false)
    })
  })

  describe("execute with truncation", () => {
    const createLongOutputTool = (outputLength: number) => {
      return Tool.define({
        id: "long-output",
        description: "Tool that produces long output",
        parameters: z.object({}),
        execute: async () => ({
          title: "Long Output",
          output: "x".repeat(outputLength),
        }),
      })
    }

    it("should not truncate when disabled", async () => {
      const tool = createLongOutputTool(50000)
      ToolRegistry.register(tool)
      ToolRegistry.configureTruncation({ enabled: false })

      const ctx = Tool.createContext()
      const result = await ToolRegistry.execute("long-output", {}, ctx)

      expect(result.output.length).toBe(50000)
      expect(result.metadata?.truncation).toBeUndefined()
    })

    it("should truncate long output when enabled", async () => {
      const tool = createLongOutputTool(50000)
      ToolRegistry.register(tool)
      ToolRegistry.configureTruncation({
        enabled: true,
        config: { maxOutputTokens: 1000 },
      })

      const ctx = Tool.createContext()
      const result = await ToolRegistry.execute("long-output", {}, ctx)

      // 输出应该被截断
      expect(result.output.length).toBeLessThan(50000)
      expect(result.metadata?.truncation).toBeDefined()
      expect((result.metadata?.truncation as { truncated: boolean }).truncated).toBe(true)
    })

    it("should not truncate short output", async () => {
      const tool = createLongOutputTool(100)
      ToolRegistry.register(tool)
      ToolRegistry.configureTruncation({
        enabled: true,
        config: { maxOutputTokens: 4000 },
      })

      const ctx = Tool.createContext()
      const result = await ToolRegistry.execute("long-output", {}, ctx)

      expect(result.output.length).toBe(100)
      // 短输出不应该有截断元数据
      expect(result.metadata?.truncation).toBeUndefined()
    })

    it("should include truncation metadata", async () => {
      const tool = createLongOutputTool(50000)
      ToolRegistry.register(tool)
      ToolRegistry.configureTruncation({
        enabled: true,
        config: { maxOutputTokens: 1000 },
      })

      const ctx = Tool.createContext()
      const result = await ToolRegistry.execute("long-output", {}, ctx)

      const truncation = result.metadata?.truncation as {
        originalTokens: number
        finalTokens: number
        truncated: boolean
      }
      
      expect(truncation).toBeDefined()
      expect(truncation.truncated).toBe(true)
      expect(truncation.originalTokens).toBeGreaterThan(truncation.finalTokens)
    })
  })

  describe("clear resets truncation", () => {
    it("should reset truncation config on clear", () => {
      ToolRegistry.configureTruncation({ enabled: true })
      ToolRegistry.clear()
      
      const config = ToolRegistry.getTruncationConfig()
      expect(config.enabled).toBe(false)
    })
  })
})
