/**
 * 错误处理测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  runWithErrorHandler,
  withRetry,
  withFallback,
  withTimeout_,
  combineErrorHandlers,
  errorHandler,
  isRetryableError,
  calculateDelay,
  DEFAULT_RETRY_CONFIG,
  type ErrorHandlerConfig,
} from "../../src/subtask/error-handler"
import type { SubTaskConfig, SubTaskResult } from "../../src/subtask/types"
import type { SubTaskRuntime } from "../../src/subtask/runner"

// Mock runSubTask
vi.mock("../../src/subtask/runner", () => ({
  runSubTask: vi.fn(),
}))

describe("isRetryableError", () => {
  it("should return true for rate limit errors", () => {
    expect(isRetryableError("Rate limit exceeded")).toBe(true)
    expect(isRetryableError("429 Too Many Requests")).toBe(true)
  })

  it("should return true for timeout errors", () => {
    expect(isRetryableError("Request timeout")).toBe(true)
    expect(isRetryableError("ETIMEDOUT")).toBe(true)
  })

  it("should return true for network errors", () => {
    expect(isRetryableError("ECONNRESET")).toBe(true)
    expect(isRetryableError("Network error")).toBe(true)
    expect(isRetryableError("ENOTFOUND")).toBe(true)
  })

  it("should return true for server errors", () => {
    expect(isRetryableError("503 Service Unavailable")).toBe(true)
    expect(isRetryableError("502 Bad Gateway")).toBe(true)
    expect(isRetryableError("Server overloaded")).toBe(true)
  })

  it("should return false for non-retryable errors", () => {
    expect(isRetryableError("Invalid input")).toBe(false)
    expect(isRetryableError("Authentication failed")).toBe(false)
    expect(isRetryableError("Permission denied")).toBe(false)
  })
})

describe("calculateDelay", () => {
  it("should return base delay for first attempt", () => {
    const delay = calculateDelay(1, { ...DEFAULT_RETRY_CONFIG, delay: 1000 })
    expect(delay).toBe(1000)
  })

  it("should apply exponential backoff", () => {
    const config = { ...DEFAULT_RETRY_CONFIG, delay: 1000, backoffMultiplier: 2 }
    expect(calculateDelay(1, config)).toBe(1000)
    expect(calculateDelay(2, config)).toBe(2000)
    expect(calculateDelay(3, config)).toBe(4000)
  })

  it("should respect maxDelay", () => {
    const config = { ...DEFAULT_RETRY_CONFIG, delay: 1000, backoffMultiplier: 2, maxDelay: 3000 }
    expect(calculateDelay(1, config)).toBe(1000)
    expect(calculateDelay(2, config)).toBe(2000)
    expect(calculateDelay(3, config)).toBe(3000) // Capped at maxDelay
    expect(calculateDelay(4, config)).toBe(3000)
  })
})

describe("runWithErrorHandler", () => {
  let mockRunSubTask: ReturnType<typeof vi.fn>
  let runtime: SubTaskRuntime
  let config: SubTaskConfig

  beforeEach(async () => {
    const runner = await import("../../src/subtask/runner")
    mockRunSubTask = vi.mocked(runner.runSubTask)
    mockRunSubTask.mockReset()

    runtime = {
      provider: { chat: vi.fn(), chatWithSchema: vi.fn() },
    }
    config = { mode: "ask_llm", prompt: "Test" }
  })

  describe("retry", () => {
    it("should succeed without retry if first attempt succeeds", async () => {
      mockRunSubTask.mockResolvedValueOnce({
        success: true,
        output: "Success",
        usage: { inputTokens: 10, outputTokens: 5 },
        duration: 100,
      })

      const result = await runWithErrorHandler(config, runtime, {
        retry: { maxRetries: 3, delay: 10 },
      })

      expect(result.success).toBe(true)
      expect(mockRunSubTask).toHaveBeenCalledTimes(1)
    })

    it("should retry on retryable error", async () => {
      mockRunSubTask
        .mockResolvedValueOnce({
          success: false,
          output: "",
          error: "Rate limit exceeded",
          usage: { inputTokens: 0, outputTokens: 0 },
          duration: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          output: "Success",
          usage: { inputTokens: 10, outputTokens: 5 },
          duration: 100,
        })

      const result = await runWithErrorHandler(config, runtime, {
        retry: { maxRetries: 3, delay: 10 },
      })

      expect(result.success).toBe(true)
      expect(mockRunSubTask).toHaveBeenCalledTimes(2)
    })

    it("should not retry on non-retryable error", async () => {
      mockRunSubTask.mockResolvedValueOnce({
        success: false,
        output: "",
        error: "Invalid input",
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: 0,
      })

      const result = await runWithErrorHandler(config, runtime, {
        retry: { maxRetries: 3, delay: 10 },
      })

      expect(result.success).toBe(false)
      expect(mockRunSubTask).toHaveBeenCalledTimes(1)
    })

    it("should use custom retryOn function", async () => {
      mockRunSubTask
        .mockResolvedValueOnce({
          success: false,
          output: "",
          error: "Custom error",
          usage: { inputTokens: 0, outputTokens: 0 },
          duration: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          output: "Success",
          usage: { inputTokens: 10, outputTokens: 5 },
          duration: 100,
        })

      const result = await runWithErrorHandler(config, runtime, {
        retry: {
          maxRetries: 3,
          delay: 10,
          retryOn: (error) => error.includes("Custom"),
        },
      })

      expect(result.success).toBe(true)
      expect(mockRunSubTask).toHaveBeenCalledTimes(2)
    })

    it("should call onError callback on retry", async () => {
      const onError = vi.fn()

      mockRunSubTask
        .mockResolvedValueOnce({
          success: false,
          output: "",
          error: "Rate limit exceeded",
          usage: { inputTokens: 0, outputTokens: 0 },
          duration: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          output: "Success",
          usage: { inputTokens: 10, outputTokens: 5 },
          duration: 100,
        })

      await runWithErrorHandler(config, runtime, {
        retry: { maxRetries: 3, delay: 10 },
        onError,
      })

      expect(onError).toHaveBeenCalledWith("Rate limit exceeded", 1, config)
    })

    it("should fail after max retries", async () => {
      mockRunSubTask.mockResolvedValue({
        success: false,
        output: "",
        error: "Rate limit exceeded",
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: 0,
      })

      const result = await runWithErrorHandler(config, runtime, {
        retry: { maxRetries: 2, delay: 10 },
      })

      expect(result.success).toBe(false)
      // Error message contains the original error
      expect(result.error).toContain("Rate limit exceeded")
      expect(mockRunSubTask).toHaveBeenCalledTimes(3)
    })
  })

  describe("fallback", () => {
    it("should use fallback on failure", async () => {
      mockRunSubTask.mockResolvedValueOnce({
        success: false,
        output: "",
        error: "Failed",
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: 0,
      })

      const fallbackResult: SubTaskResult = {
        success: true,
        output: "Fallback result",
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: 0,
      }

      const result = await runWithErrorHandler(config, runtime, {
        fallback: {
          fallback: () => fallbackResult,
        },
      })

      expect(result.success).toBe(true)
      expect(result.output).toBe("Fallback result")
    })

    it("should use custom fallbackOn condition", async () => {
      mockRunSubTask.mockResolvedValueOnce({
        success: false,
        output: "",
        error: "Specific error",
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: 0,
      })

      const fallbackResult: SubTaskResult = {
        success: true,
        output: "Fallback result",
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: 0,
      }

      const result = await runWithErrorHandler(config, runtime, {
        fallback: {
          fallback: () => fallbackResult,
          fallbackOn: (error) => error.includes("Specific"),
        },
      })

      expect(result.output).toBe("Fallback result")
    })

    it("should not use fallback if condition is false", async () => {
      mockRunSubTask.mockResolvedValueOnce({
        success: false,
        output: "",
        error: "Other error",
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: 0,
      })

      const result = await runWithErrorHandler(config, runtime, {
        fallback: {
          fallback: () => ({
            success: true,
            output: "Fallback",
            usage: { inputTokens: 0, outputTokens: 0 },
            duration: 0,
          }),
          fallbackOn: (error) => error.includes("Specific"),
        },
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe("Other error")
    })

    it("should use fallback after retries exhausted", async () => {
      mockRunSubTask.mockResolvedValue({
        success: false,
        output: "",
        error: "Rate limit exceeded",
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: 0,
      })

      const result = await runWithErrorHandler(config, runtime, {
        retry: { maxRetries: 2, delay: 10 },
        fallback: {
          fallback: () => ({
            success: true,
            output: "Fallback after retries",
            usage: { inputTokens: 0, outputTokens: 0 },
            duration: 0,
          }),
        },
      })

      expect(result.success).toBe(true)
      expect(result.output).toBe("Fallback after retries")
      expect(mockRunSubTask).toHaveBeenCalledTimes(3)
    })
  })

  describe("timeout", () => {
    it("should timeout long-running tasks", async () => {
      mockRunSubTask.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      )

      const result = await runWithErrorHandler(config, runtime, {
        timeout: { timeout: 50 },
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("timed out")
    })

    it("should use onTimeout handler", async () => {
      mockRunSubTask.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 1000))
      )

      const result = await runWithErrorHandler(config, runtime, {
        timeout: {
          timeout: 50,
          onTimeout: () => ({
            success: true,
            output: "Timeout fallback",
            usage: { inputTokens: 0, outputTokens: 0 },
            duration: 0,
          }),
        },
      })

      expect(result.success).toBe(true)
      expect(result.output).toBe("Timeout fallback")
    })
  })
})

describe("withRetry", () => {
  it("should create a retry wrapper", async () => {
    const runner = await import("../../src/subtask/runner")
    const mockRunSubTask = vi.mocked(runner.runSubTask)

    mockRunSubTask.mockResolvedValueOnce({
      success: true,
      output: "Success",
      usage: { inputTokens: 10, outputTokens: 5 },
      duration: 100,
    })

    const retryRunner = withRetry({ maxRetries: 3, delay: 10 })
    const result = await retryRunner(
      { mode: "ask_llm", prompt: "Test" },
      { provider: { chat: vi.fn(), chatWithSchema: vi.fn() } }
    )

    expect(result.success).toBe(true)
  })
})

describe("withFallback", () => {
  it("should create a fallback wrapper", async () => {
    const runner = await import("../../src/subtask/runner")
    const mockRunSubTask = vi.mocked(runner.runSubTask)

    mockRunSubTask.mockResolvedValueOnce({
      success: false,
      output: "",
      error: "Failed",
      usage: { inputTokens: 0, outputTokens: 0 },
      duration: 0,
    })

    const fallbackRunner = withFallback(() => ({
      success: true,
      output: "Fallback",
      usage: { inputTokens: 0, outputTokens: 0 },
      duration: 0,
    }))

    const result = await fallbackRunner(
      { mode: "ask_llm", prompt: "Test" },
      { provider: { chat: vi.fn(), chatWithSchema: vi.fn() } }
    )

    expect(result.success).toBe(true)
    expect(result.output).toBe("Fallback")
  })
})

describe("withTimeout_", () => {
  it("should create a timeout wrapper", async () => {
    const runner = await import("../../src/subtask/runner")
    const mockRunSubTask = vi.mocked(runner.runSubTask)

    mockRunSubTask.mockResolvedValueOnce({
      success: true,
      output: "Success",
      usage: { inputTokens: 10, outputTokens: 5 },
      duration: 100,
    })

    const timeoutRunner = withTimeout_(5000)
    const result = await timeoutRunner(
      { mode: "ask_llm", prompt: "Test" },
      { provider: { chat: vi.fn(), chatWithSchema: vi.fn() } }
    )

    expect(result.success).toBe(true)
  })
})

describe("combineErrorHandlers", () => {
  it("should combine multiple handlers", () => {
    const handler1: ErrorHandlerConfig = {
      retry: { maxRetries: 3, delay: 1000 },
    }
    const handler2: ErrorHandlerConfig = {
      timeout: { timeout: 5000 },
    }
    const handler3: ErrorHandlerConfig = {
      fallback: {
        fallback: () => ({
          success: true,
          output: "",
          usage: { inputTokens: 0, outputTokens: 0 },
          duration: 0,
        }),
      },
    }

    const combined = combineErrorHandlers(handler1, handler2, handler3)

    expect(combined.retry).toBeDefined()
    expect(combined.timeout).toBeDefined()
    expect(combined.fallback).toBeDefined()
  })

  it("should combine onError callbacks", () => {
    const callback1 = vi.fn()
    const callback2 = vi.fn()

    const combined = combineErrorHandlers(
      { onError: callback1 },
      { onError: callback2 }
    )

    combined.onError?.("error", 1, { mode: "ask_llm", prompt: "Test" })

    expect(callback1).toHaveBeenCalled()
    expect(callback2).toHaveBeenCalled()
  })
})

describe("ErrorHandlerBuilder", () => {
  beforeEach(async () => {
    const runner = await import("../../src/subtask/runner")
    vi.mocked(runner.runSubTask).mockReset()
  })

  it("should build config with retry", () => {
    const config = errorHandler()
      .retry({ maxRetries: 5 })
      .build()

    expect(config.retry?.maxRetries).toBe(5)
  })

  it("should build config with fallback", () => {
    const fallbackFn = vi.fn()
    const config = errorHandler()
      .fallback(fallbackFn)
      .build()

    expect(config.fallback?.fallback).toBe(fallbackFn)
  })

  it("should build config with timeout", () => {
    const config = errorHandler()
      .timeout(5000)
      .build()

    expect(config.timeout?.timeout).toBe(5000)
  })

  it("should build config with onError", () => {
    const onErrorFn = vi.fn()
    const config = errorHandler()
      .onError(onErrorFn)
      .build()

    expect(config.onError).toBe(onErrorFn)
  })

  it("should chain multiple configurations", () => {
    const config = errorHandler()
      .retry({ maxRetries: 3 })
      .timeout(5000)
      .fallback(() => ({
        success: true,
        output: "",
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: 0,
      }))
      .build()

    expect(config.retry).toBeDefined()
    expect(config.timeout).toBeDefined()
    expect(config.fallback).toBeDefined()
  })

  it("should execute with built config", async () => {
    const runner = await import("../../src/subtask/runner")
    const mockRunSubTask = vi.mocked(runner.runSubTask)

    mockRunSubTask.mockResolvedValueOnce({
      success: true,
      output: "Success",
      usage: { inputTokens: 10, outputTokens: 5 },
      duration: 100,
    })

    const result = await errorHandler()
      .retry({ maxRetries: 3, delay: 10 })
      .execute(
        { mode: "ask_llm", prompt: "Test" },
        { provider: { chat: vi.fn(), chatWithSchema: vi.fn() } }
      )

    expect(result.success).toBe(true)
  })
})
