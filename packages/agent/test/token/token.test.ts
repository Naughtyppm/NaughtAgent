import { describe, it, expect } from "vitest"
import {
  estimateTokens,
  countMessageTokens,
  countMessagesTokens,
  countToolsTokens,
  countContextTokens,
  needsTruncation,
  getAvailableTokens,
  truncateDropOld,
  truncateSlidingWindow,
  truncateMessages,
  createTokenManager,
  DEFAULT_TOKEN_LIMITS,
} from "../../src/token"
import type { Message } from "../../src/session"

describe("Token", () => {
  describe("estimateTokens", () => {
    it("should return 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0)
    })

    it("should return 0 for null/undefined", () => {
      expect(estimateTokens(null as any)).toBe(0)
      expect(estimateTokens(undefined as any)).toBe(0)
    })

    it("should estimate English text", () => {
      const text = "Hello world this is a test"
      const tokens = estimateTokens(text)
      // ~26 chars, ~6.5 tokens for English
      expect(tokens).toBeGreaterThan(0)
      expect(tokens).toBeLessThan(20)
    })

    it("should estimate Chinese text", () => {
      const text = "你好世界这是一个测试"
      const tokens = estimateTokens(text)
      // 10 Chinese chars, ~6.7 tokens
      expect(tokens).toBeGreaterThan(0)
      expect(tokens).toBeLessThan(15)
    })

    it("should estimate mixed text", () => {
      const text = "Hello 你好 World 世界"
      const tokens = estimateTokens(text)
      expect(tokens).toBeGreaterThan(0)
    })

    it("should estimate code", () => {
      const code = `function hello() { return "world"; }`
      const tokens = estimateTokens(code)
      expect(tokens).toBeGreaterThan(0)
    })
  })

  describe("countMessageTokens", () => {
    it("should count user message tokens", () => {
      const message: Message = {
        role: "user",
        content: "Hello world",
      }
      const tokens = countMessageTokens(message)
      expect(tokens).toBeGreaterThan(4) // MESSAGE_OVERHEAD
    })

    it("should count assistant message tokens", () => {
      const message: Message = {
        role: "assistant",
        content: "Hello! How can I help?",
      }
      const tokens = countMessageTokens(message)
      expect(tokens).toBeGreaterThan(4)
    })

    it("should count assistant message with tool calls", () => {
      const message: Message = {
        role: "assistant",
        content: "Let me read that file.",
        toolCalls: [
          {
            id: "call_1",
            name: "read",
            args: { filePath: "/test.txt" },
          },
        ],
      }
      const tokens = countMessageTokens(message)
      // Should include tool call overhead
      expect(tokens).toBeGreaterThan(20)
    })

    it("should count tool result message tokens", () => {
      const message: Message = {
        role: "tool",
        toolCallId: "call_1",
        content: "File content here",
      }
      const tokens = countMessageTokens(message)
      expect(tokens).toBeGreaterThan(4)
    })
  })

  describe("countMessagesTokens", () => {
    it("should count multiple messages", () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
        { role: "user", content: "How are you?" },
      ]
      const tokens = countMessagesTokens(messages)
      expect(tokens).toBeGreaterThan(12) // 3 * MESSAGE_OVERHEAD
    })

    it("should return 0 for empty array", () => {
      expect(countMessagesTokens([])).toBe(0)
    })
  })

  describe("countToolsTokens", () => {
    it("should count tool definitions", () => {
      const tools = [
        {
          name: "read",
          description: "Read a file from the filesystem",
          parameters: { type: "object", properties: { filePath: { type: "string" } } },
        },
      ]
      const tokens = countToolsTokens(tools)
      expect(tokens).toBeGreaterThan(0)
    })

    it("should return 0 for empty array", () => {
      expect(countToolsTokens([])).toBe(0)
    })
  })

  describe("countContextTokens", () => {
    it("should count full context", () => {
      const context = {
        system: "You are a helpful assistant.",
        messages: [
          { role: "user" as const, content: "Hello" },
          { role: "assistant" as const, content: "Hi!" },
        ],
        tools: [
          {
            name: "read",
            description: "Read file",
            parameters: {},
          },
        ],
      }
      const count = countContextTokens(context)

      expect(count.system).toBeGreaterThan(0)
      expect(count.messages).toBeGreaterThan(0)
      expect(count.tools).toBeGreaterThan(0)
      expect(count.total).toBe(count.system + count.messages + count.tools)
    })

    it("should handle missing optional fields", () => {
      const context = {
        messages: [{ role: "user" as const, content: "Hello" }],
      }
      const count = countContextTokens(context)

      expect(count.system).toBe(0)
      expect(count.tools).toBe(0)
      expect(count.messages).toBeGreaterThan(0)
    })
  })

  describe("needsTruncation", () => {
    it("should return false when under threshold", () => {
      const tokenCount = { total: 1000, system: 100, messages: 800, tools: 100 }
      expect(needsTruncation(tokenCount)).toBe(false)
    })

    it("should return true when over threshold", () => {
      const tokenCount = { total: 150000, system: 1000, messages: 148000, tools: 1000 }
      expect(needsTruncation(tokenCount)).toBe(true)
    })

    it("should use custom limits", () => {
      const tokenCount = { total: 5000, system: 100, messages: 4800, tools: 100 }
      const limits = { ...DEFAULT_TOKEN_LIMITS, maxContext: 5000, compressThreshold: 0.5 }
      expect(needsTruncation(tokenCount, limits)).toBe(true)
    })
  })

  describe("getAvailableTokens", () => {
    it("should return available tokens with safety buffer", () => {
      const available = getAvailableTokens()
      // (180000 - 8192) * 0.9 = 154627
      expect(available).toBeLessThan(180000)
      expect(available).toBeGreaterThan(100000)
    })

    it("should use custom limits", () => {
      const limits = { ...DEFAULT_TOKEN_LIMITS, maxContext: 10000, reserveOutput: 1000 }
      const available = getAvailableTokens(limits)
      // (10000 - 1000) * 0.9 = 8100
      expect(available).toBe(8100)
    })
  })

  describe("truncateDropOld", () => {
    it("should keep recent messages within limit", () => {
      const messages: Message[] = [
        { role: "user", content: "This is a longer message that should take more tokens to represent" },
        { role: "assistant", content: "This is also a longer response with more content" },
        { role: "user", content: "Another message with substantial content here" },
        { role: "assistant", content: "Yet another response that adds to the token count" },
        { role: "user", content: "Final message" },
      ]

      // Very small limit to force truncation
      const result = truncateDropOld(messages, 20)

      expect(result.messages.length).toBeLessThan(messages.length)
      expect(result.removedCount).toBeGreaterThan(0)
      // Should keep the most recent messages
      expect(result.messages[result.messages.length - 1].content).toBe("Final message")
    })

    it("should keep all messages if under limit", () => {
      const messages: Message[] = [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ]

      const result = truncateDropOld(messages, 10000)

      expect(result.messages.length).toBe(2)
      expect(result.removedCount).toBe(0)
    })
  })

  describe("truncateSlidingWindow", () => {
    it("should keep only recent N messages", () => {
      const messages: Message[] = [
        { role: "user", content: "Message 1" },
        { role: "assistant", content: "Response 1" },
        { role: "user", content: "Message 2" },
        { role: "assistant", content: "Response 2" },
        { role: "user", content: "Message 3" },
      ]

      const result = truncateSlidingWindow(messages, 2)

      expect(result.messages.length).toBe(2)
      expect(result.removedCount).toBe(3)
      expect(result.messages[0].content).toBe("Response 2")
      expect(result.messages[1].content).toBe("Message 3")
    })

    it("should keep all if count exceeds length", () => {
      const messages: Message[] = [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ]

      const result = truncateSlidingWindow(messages, 10)

      expect(result.messages.length).toBe(2)
      expect(result.removedCount).toBe(0)
    })
  })

  describe("truncateMessages", () => {
    it("should use drop_old strategy by default", () => {
      const messages: Message[] = [
        { role: "user", content: "Message 1" },
        { role: "assistant", content: "Response 1" },
        { role: "user", content: "Message 2" },
      ]

      const result = truncateMessages(messages, { targetTokens: 30 })

      expect(result.messages.length).toBeLessThanOrEqual(messages.length)
    })

    it("should use sliding_window strategy", () => {
      const messages: Message[] = [
        { role: "user", content: "Message 1" },
        { role: "assistant", content: "Response 1" },
        { role: "user", content: "Message 2" },
        { role: "assistant", content: "Response 2" },
      ]

      const result = truncateMessages(messages, {
        strategy: "sliding_window",
        keepCount: 2,
      })

      expect(result.messages.length).toBe(2)
    })
  })

  describe("createTokenManager", () => {
    it("should create manager with default limits", () => {
      const manager = createTokenManager()

      expect(manager.limits).toEqual(DEFAULT_TOKEN_LIMITS)
    })

    it("should create manager with custom limits", () => {
      const manager = createTokenManager({ maxContext: 100000 })

      expect(manager.limits.maxContext).toBe(100000)
      expect(manager.limits.reserveOutput).toBe(DEFAULT_TOKEN_LIMITS.reserveOutput)
    })

    it("should estimate tokens", () => {
      const manager = createTokenManager()
      const tokens = manager.estimate("Hello world")

      expect(tokens).toBeGreaterThan(0)
    })

    it("should count messages", () => {
      const manager = createTokenManager()
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
      ]
      const tokens = manager.countMessages(messages)

      expect(tokens).toBeGreaterThan(0)
    })

    it("should count context", () => {
      const manager = createTokenManager()
      const count = manager.countContext({
        system: "You are helpful",
        messages: [{ role: "user", content: "Hello" }],
      })

      expect(count.total).toBeGreaterThan(0)
    })

    it("should check truncation need", () => {
      const manager = createTokenManager({ maxContext: 1000, compressThreshold: 0.5 })
      const tokenCount = { total: 600, system: 100, messages: 400, tools: 100 }

      expect(manager.needsTruncation(tokenCount)).toBe(true)
    })

    it("should get available tokens", () => {
      const manager = createTokenManager()
      const available = manager.getAvailable()

      expect(available).toBeGreaterThan(0)
    })

    it("should truncate messages", () => {
      const manager = createTokenManager()
      const messages: Message[] = [
        { role: "user", content: "Message 1" },
        { role: "assistant", content: "Response 1" },
        { role: "user", content: "Message 2" },
      ]

      const result = manager.truncate(messages, { targetTokens: 30 })

      expect(result.messages).toBeDefined()
      expect(result.tokenCount).toBeDefined()
    })
  })
})
