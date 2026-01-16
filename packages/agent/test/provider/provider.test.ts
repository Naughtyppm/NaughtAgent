import { describe, it, expect, vi } from "vitest"
import {
  DEFAULT_MODEL,
  FAST_MODEL,
  KIRO_MODEL_MAP,
  KIRO_MODELS,
  mapToKiroModel,
  type ModelConfig,
  type TokenUsage,
  type Message,
  type ChatResult,
  type StreamEvent,
} from "../../src/provider"

describe("Provider", () => {
  describe("ModelConfig", () => {
    it("should have DEFAULT_MODEL with correct values", () => {
      expect(DEFAULT_MODEL).toEqual({
        provider: "auto",
        model: "claude-sonnet-4-20250514",
        temperature: 0,
        maxTokens: 8192,
      })
    })

    it("should have FAST_MODEL with correct values", () => {
      expect(FAST_MODEL).toEqual({
        provider: "auto",
        model: "claude-haiku-4-20250514",
        temperature: 0,
        maxTokens: 4096,
      })
    })
  })

  describe("mapToKiroModel", () => {
    it("should map official Claude model names", () => {
      expect(mapToKiroModel("claude-sonnet-4-20250514")).toBe("claude-sonnet-4")
      expect(mapToKiroModel("claude-opus-4-20250514")).toBe("claude-opus-4.5")
      expect(mapToKiroModel("claude-haiku-4-20250514")).toBe("claude-haiku-4.5")
    })

    it("should map shorthand names", () => {
      expect(mapToKiroModel("sonnet")).toBe("claude-sonnet-4")
      expect(mapToKiroModel("opus")).toBe("claude-opus-4.5")
      expect(mapToKiroModel("haiku")).toBe("claude-haiku-4.5")
    })

    it("should return Kiro models as-is", () => {
      expect(mapToKiroModel("claude-sonnet-4")).toBe("claude-sonnet-4")
      expect(mapToKiroModel("claude-opus-4.5")).toBe("claude-opus-4.5")
      expect(mapToKiroModel("auto")).toBe("auto")
    })

    it("should fuzzy match model names", () => {
      expect(mapToKiroModel("some-opus-model")).toBe("claude-opus-4.5")
      expect(mapToKiroModel("my-haiku")).toBe("claude-haiku-4.5")
      expect(mapToKiroModel("sonnet-custom")).toBe("claude-sonnet-4")
    })

    it("should default to claude-sonnet-4 for unknown models", () => {
      expect(mapToKiroModel("unknown-model")).toBe("claude-sonnet-4")
      expect(mapToKiroModel("")).toBe("claude-sonnet-4")
    })
  })

  describe("KIRO_MODEL_MAP", () => {
    it("should contain expected mappings", () => {
      expect(KIRO_MODEL_MAP["claude-sonnet-4-20250514"]).toBe("claude-sonnet-4")
      expect(KIRO_MODEL_MAP["sonnet"]).toBe("claude-sonnet-4")
      expect(KIRO_MODEL_MAP["gpt-4o"]).toBe("claude-sonnet-4")
    })
  })

  describe("KIRO_MODELS", () => {
    it("should contain supported models", () => {
      expect(KIRO_MODELS.has("auto")).toBe(true)
      expect(KIRO_MODELS.has("claude-sonnet-4")).toBe(true)
      expect(KIRO_MODELS.has("claude-opus-4.5")).toBe(true)
      expect(KIRO_MODELS.has("claude-haiku-4.5")).toBe(true)
    })
  })

  describe("Type definitions", () => {
    it("should define TokenUsage interface correctly", () => {
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
      }

      expect(usage.inputTokens).toBe(100)
      expect(usage.outputTokens).toBe(50)
    })

    it("should define Message interface correctly", () => {
      const userMessage: Message = {
        role: "user",
        content: "Hello",
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: [{ type: "text", text: "Hi there" }],
      }

      expect(userMessage.role).toBe("user")
      expect(assistantMessage.role).toBe("assistant")
    })

    it("should define ChatResult interface correctly", () => {
      const result: ChatResult = {
        text: "Response text",
        toolCalls: [{ id: "call-1", name: "read", args: { filePath: "/test" } }],
        usage: { inputTokens: 10, outputTokens: 20 },
      }

      expect(result.text).toBe("Response text")
      expect(result.toolCalls).toHaveLength(1)
      expect(result.usage.inputTokens).toBe(10)
    })

    it("should define StreamEvent types correctly", () => {
      const textEvent: StreamEvent = { type: "text", text: "Hello" }
      const toolCallEvent: StreamEvent = {
        type: "tool_call",
        id: "call-1",
        name: "read",
        args: {},
      }
      const endEvent: StreamEvent = {
        type: "message_end",
        usage: { inputTokens: 10, outputTokens: 20 },
      }
      const errorEvent: StreamEvent = {
        type: "error",
        error: new Error("test"),
      }

      expect(textEvent.type).toBe("text")
      expect(toolCallEvent.type).toBe("tool_call")
      expect(endEvent.type).toBe("message_end")
      expect(errorEvent.type).toBe("error")
    })
  })
})
