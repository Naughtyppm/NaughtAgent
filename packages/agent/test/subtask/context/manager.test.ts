/**
 * 上下文管理器测试
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  ContextManager,
  createContextManager,
} from "../../../src/subtask/context/manager"
import type { Message } from "../../../src/session"
import type { ParentContext } from "../../../src/subtask/types"

// Helper to create test messages
function createMessage(
  role: "user" | "assistant",
  text: string,
  index: number
): Message {
  return {
    id: `msg_${index}`,
    role,
    content: [{ type: "text", text }],
    timestamp: Date.now() + index,
  }
}

describe("ContextManager", () => {
  let manager: ContextManager

  beforeEach(() => {
    manager = createContextManager({
      budget: {
        total: 10000,
        system: 1000,
        context: 3000,
        history: 4000,
        response: 2000,
      },
    })
  })

  describe("prepareContext", () => {
    it("should prepare context with system prompt", async () => {
      const result = await manager.prepareContext({
        systemPrompt: "You are a helpful assistant.",
      })

      expect(result.systemPrompt).toBe("You are a helpful assistant.")
      expect(result.tokenUsage.system).toBeGreaterThan(0)
    })

    it("should prepare context with messages", async () => {
      const messages = Array.from({ length: 5 }, (_, i) =>
        createMessage("user", `Message ${i}`, i)
      )

      const result = await manager.prepareContext({ messages })

      expect(result.messages.length).toBeGreaterThan(0)
      expect(result.tokenUsage.history).toBeGreaterThan(0)
    })

    it("should truncate long system prompt", async () => {
      const longPrompt = "a".repeat(5000) // ~1250 tokens, over 1000 budget

      const result = await manager.prepareContext({
        systemPrompt: longPrompt,
      })

      expect(result.truncated).toBe(true)
      expect(result.systemPrompt!.length).toBeLessThan(longPrompt.length)
    })

    it("should compress messages when over budget", async () => {
      // Create manager with very small budget
      const smallManager = createContextManager({
        budget: {
          total: 200,
          system: 50,
          context: 50,
          history: 50,
          response: 50,
        },
        compression: {
          strategy: "sliding_window",
          windowSize: 5,
        },
      })

      const messages = Array.from({ length: 100 }, (_, i) =>
        createMessage("user", `This is a longer message number ${i} with more content that should exceed the budget`, i)
      )

      const result = await smallManager.prepareContext({ messages })

      // Messages should be compressed due to sliding window (5) and budget limit
      expect(result.messages.length).toBeLessThan(messages.length)
      // The truncated flag is set when history allocation is truncated
      // With such a small budget, it should be truncated
    })

    it("should generate summary when requested", async () => {
      const messages = Array.from({ length: 5 }, (_, i) =>
        createMessage("user", `Message ${i}`, i)
      )

      const result = await manager.prepareContext({
        messages,
        generateSummary: true,
      })

      expect(result.summary).toBeDefined()
      expect(result.summary!.tokenCount).toBeGreaterThan(0)
    })
  })

  describe("prepareForkContext", () => {
    const parentContext: ParentContext = {
      sessionId: "parent_session_1",
      messages: Array.from({ length: 10 }, (_, i) =>
        createMessage(i % 2 === 0 ? "user" : "assistant", `Message ${i}`, i)
      ),
      systemPrompt: "You are a helpful assistant.",
      tools: ["read_file", "write_file"],
      agentType: "build",
    }

    it("should inherit all by default", async () => {
      const result = await manager.prepareForkContext(parentContext)

      expect(result.systemPrompt).toBe(parentContext.systemPrompt)
      expect(result.messages.length).toBeGreaterThan(0)
    })

    it("should inherit only specified number of messages", async () => {
      const result = await manager.prepareForkContext(parentContext, {
        messages: 3,
      })

      expect(result.messages.length).toBeLessThanOrEqual(3)
    })

    it("should not inherit messages when disabled", async () => {
      const result = await manager.prepareForkContext(parentContext, {
        messages: false,
      })

      expect(result.messages.length).toBe(0)
    })

    it("should not inherit system prompt when disabled", async () => {
      const result = await manager.prepareForkContext(parentContext, {
        systemPrompt: false,
      })

      expect(result.systemPrompt).toBeUndefined()
    })

    it("should include context summary when available", async () => {
      const contextWithSummary: ParentContext = {
        ...parentContext,
        contextSummary: {
          summary: "This is a summary of the parent context.",
          keyFiles: ["src/index.ts"],
          keyDecisions: ["Use TypeScript"],
          tokenCount: 50,
        },
      }

      const result = await manager.prepareForkContext(contextWithSummary, {
        context: true,
      })

      expect(result.summary).toBeDefined()
      expect(result.summary!.summary).toBe("This is a summary of the parent context.")
    })
  })

  describe("needsCompression", () => {
    it("should return false for small message list", () => {
      const messages = Array.from({ length: 5 }, (_, i) =>
        createMessage("user", `Message ${i}`, i)
      )

      expect(manager.needsCompression(messages)).toBe(false)
    })

    it("should return true for large message list", () => {
      const messages = Array.from({ length: 500 }, (_, i) =>
        createMessage("user", `This is a longer message number ${i} with more content`, i)
      )

      expect(manager.needsCompression(messages)).toBe(true)
    })
  })

  describe("estimateTokens", () => {
    it("should estimate tokens for messages", () => {
      const messages = Array.from({ length: 5 }, (_, i) =>
        createMessage("user", `Message ${i}`, i)
      )

      const tokens = manager.estimateTokens(messages)
      expect(tokens).toBeGreaterThan(0)
    })
  })

  describe("getRemainingBudget", () => {
    it("should return full budget initially", () => {
      const remaining = manager.getRemainingBudget()

      expect(remaining.system).toBe(1000)
      expect(remaining.context).toBe(3000)
      expect(remaining.history).toBe(4000)
    })

    it("should decrease after allocation", async () => {
      await manager.prepareContext({
        systemPrompt: "Hello, world!",
      })

      const remaining = manager.getRemainingBudget()
      expect(remaining.system).toBeLessThan(1000)
    })
  })
})

describe("createContextManager", () => {
  it("should create manager with default config", () => {
    const manager = createContextManager()
    expect(manager).toBeInstanceOf(ContextManager)
  })

  it("should create manager with custom budget", () => {
    const manager = createContextManager({
      budget: { total: 5000 },
    })

    const budget = manager.getBudgetManager().getBudget()
    expect(budget.total).toBe(5000)
  })
})
