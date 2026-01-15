import { describe, it, expect, vi, beforeEach } from "vitest"
import { runAPITask } from "../../src/subtask/api"
import type { APITaskConfig, SubTaskProvider } from "../../src/subtask/types"
import { z } from "zod"

describe("API Mode", () => {
  let mockProvider: SubTaskProvider

  beforeEach(() => {
    mockProvider = {
      chat: vi.fn().mockResolvedValue({
        content: "Test response",
        usage: { inputTokens: 10, outputTokens: 20 },
      }),
      chatWithSchema: vi.fn().mockResolvedValue({
        data: { result: "structured" },
        usage: { inputTokens: 15, outputTokens: 25 },
      }),
    }
  })

  describe("runAPITask", () => {
    it("should execute simple text task", async () => {
      const config: APITaskConfig = {
        mode: "api",
        prompt: "Hello world",
      }

      const result = await runAPITask(config, mockProvider)

      expect(result.success).toBe(true)
      expect(result.output).toBe("Test response")
      expect(result.usage.inputTokens).toBe(10)
      expect(result.usage.outputTokens).toBe(20)
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })

    it("should include system prompt", async () => {
      const config: APITaskConfig = {
        mode: "api",
        prompt: "Hello",
        systemPrompt: "You are a helpful assistant",
      }

      await runAPITask(config, mockProvider)

      expect(mockProvider.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: "system", content: "You are a helpful assistant" },
            { role: "user", content: "Hello" },
          ],
        })
      )
    })

    it("should handle JSON output format", async () => {
      const schema = z.object({ result: z.string() })
      const config: APITaskConfig = {
        mode: "api",
        prompt: "Get data",
        outputFormat: "json",
        schema,
      }

      const result = await runAPITask(config, mockProvider)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ result: "structured" })
      expect(mockProvider.chatWithSchema).toHaveBeenCalled()
    })

    it("should pass model config", async () => {
      const config: APITaskConfig = {
        mode: "api",
        prompt: "Hello",
        model: {
          model: "claude-3-opus",
          temperature: 0.5,
          maxTokens: 1000,
        },
      }

      await runAPITask(config, mockProvider)

      expect(mockProvider.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-3-opus",
          temperature: 0.5,
          maxTokens: 1000,
        })
      )
    })

    it("should handle abort signal", async () => {
      const controller = new AbortController()
      controller.abort()

      const config: APITaskConfig = {
        mode: "api",
        prompt: "Hello",
        abort: controller.signal,
      }

      const result = await runAPITask(config, mockProvider)

      expect(result.success).toBe(false)
      expect(result.error).toContain("aborted")
      expect(mockProvider.chat).not.toHaveBeenCalled()
    })

    it("should handle provider errors", async () => {
      mockProvider.chat = vi.fn().mockRejectedValue(new Error("API error"))

      const config: APITaskConfig = {
        mode: "api",
        prompt: "Hello",
      }

      const result = await runAPITask(config, mockProvider)

      expect(result.success).toBe(false)
      expect(result.error).toBe("API error")
    })

    it("should return duration on error", async () => {
      mockProvider.chat = vi.fn().mockRejectedValue(new Error("API error"))

      const config: APITaskConfig = {
        mode: "api",
        prompt: "Hello",
      }

      const result = await runAPITask(config, mockProvider)

      expect(result.duration).toBeGreaterThanOrEqual(0)
    })

    it("should use text format when no schema provided", async () => {
      const config: APITaskConfig = {
        mode: "api",
        prompt: "Hello",
        outputFormat: "json", // json format but no schema
      }

      await runAPITask(config, mockProvider)

      // Should fall back to regular chat
      expect(mockProvider.chat).toHaveBeenCalled()
      expect(mockProvider.chatWithSchema).not.toHaveBeenCalled()
    })
  })
})
