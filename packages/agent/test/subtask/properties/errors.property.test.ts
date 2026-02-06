/**
 * 错误处理属性测试
 *
 * 使用 fast-check 进行属性测试，验证错误处理模块的正确性属性。
 *
 * **Property 17: Error Structure**
 * **Property 18: Retry Behavior**
 * **Validates: Requirements 7.1, 7.3**
 *
 * @module test/subtask/properties/errors.property
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import {
  SubAgentErrorType,
  type SubAgentError,
  type SubAgentErrorContext,
  createConfigError,
  createAgentNotFoundError,
  createTimeoutError,
  createAbortedError,
  createLLMError,
  createToolError,
  createConcurrencyError,
  createRetryExhaustedError,
  isSubAgentError,
  isRetryableErrorType,
} from "../../../src/subtask/errors"
import {
  calculateDelay,
  isRetryableSubAgentError,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from "../../../src/subtask/error-handler"

describe("Error Handling Properties", () => {
  // ==========================================================================
  // Generators - 智能生成器，约束到有效输入空间
  // ==========================================================================

  /**
   * 生成有效的错误消息
   * - 非空字符串
   * - 长度 1-200
   */
  const validErrorMessage = fc
    .array(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .:_-错误信息测试".split(
          ""
        )
      ),
      { minLength: 1, maxLength: 200 }
    )
    .map((chars) => chars.join(""))

  /**
   * 生成有效的 Agent ID
   */
  const validAgentId = fc
    .tuple(
      fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")),
      fc.array(
        fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_".split("")),
        { minLength: 0, maxLength: 20 }
      )
    )
    .map(([first, rest]) => first + rest.join(""))

  /**
   * 生成有效的 Agent 类型
   */
  const validAgentType = fc.constantFrom("explore", "plan", "build", "custom")

  /**
   * 生成有效的工具名称
   */
  const validToolName = fc.constantFrom(
    "read",
    "write",
    "glob",
    "grep",
    "bash",
    "edit",
    "append",
    "search"
  )

  /**
   * 生成有效的步骤编号
   */
  const validStep = fc.integer({ min: 0, max: 100 })

  /**
   * 生成有效的持续时间（毫秒）
   */
  const validDuration = fc.integer({ min: 0, max: 300000 })

  /**
   * 生成有效的超时时间（毫秒）
   */
  const validTimeout = fc.integer({ min: 1000, max: 300000 })

  /**
   * 生成有效的重试次数
   */
  const validRetryCount = fc.integer({ min: 1, max: 10 })

  /**
   * 生成有效的并发数
   */
  const validConcurrency = fc.integer({ min: 1, max: 20 })

  /**
   * 生成有效的错误上下文
   */
  const validErrorContext: fc.Arbitrary<Partial<SubAgentErrorContext>> = fc.record(
    {
      agentId: fc.option(validAgentId, { nil: undefined }),
      agentType: fc.option(validAgentType, { nil: undefined }),
      step: fc.option(validStep, { nil: undefined }),
      toolName: fc.option(validToolName, { nil: undefined }),
      duration: fc.option(validDuration, { nil: undefined }),
      retryCount: fc.option(validRetryCount, { nil: undefined }),
      timeoutMs: fc.option(validTimeout, { nil: undefined }),
    },
    { requiredKeys: [] }
  )

  /**
   * 生成所有错误类型
   */
  const allErrorTypes = fc.constantFrom(
    SubAgentErrorType.CONFIG_ERROR,
    SubAgentErrorType.AGENT_NOT_FOUND,
    SubAgentErrorType.TIMEOUT,
    SubAgentErrorType.ABORTED,
    SubAgentErrorType.LLM_ERROR,
    SubAgentErrorType.TOOL_ERROR,
    SubAgentErrorType.CONCURRENCY_ERROR,
    SubAgentErrorType.RETRY_EXHAUSTED
  )

  /**
   * 生成可重试的错误类型
   */
  const retryableErrorTypes = fc.constantFrom(
    SubAgentErrorType.LLM_ERROR,
    SubAgentErrorType.TIMEOUT,
    SubAgentErrorType.CONCURRENCY_ERROR
  )

  /**
   * 生成不可重试的错误类型
   */
  const nonRetryableErrorTypes = fc.constantFrom(
    SubAgentErrorType.CONFIG_ERROR,
    SubAgentErrorType.AGENT_NOT_FOUND,
    SubAgentErrorType.ABORTED,
    SubAgentErrorType.TOOL_ERROR,
    SubAgentErrorType.RETRY_EXHAUSTED
  )

  /**
   * 生成有效的重试配置
   */
  const validRetryConfig: fc.Arbitrary<RetryConfig> = fc.record({
    maxRetries: fc.integer({ min: 1, max: 10 }),
    delay: fc.integer({ min: 100, max: 5000 }),
    backoffMultiplier: fc.option(fc.double({ min: 1, max: 4, noNaN: true }), {
      nil: undefined,
    }),
    maxDelay: fc.option(fc.integer({ min: 5000, max: 60000 }), { nil: undefined }),
  })

  /**
   * 生成有效的尝试次数
   */
  const validAttempt = fc.integer({ min: 1, max: 10 })

  // ==========================================================================
  // Property 17: Error Structure
  // ==========================================================================

  describe("Property 17: Error Structure", () => {
    /**
     * **Validates: Requirements 7.1**
     *
     * *For any* sub-agent error, the error SHALL be structured with type,
     * message, and context fields.
     */

    it("createConfigError should produce valid SubAgentError with all required fields", () => {
      fc.assert(
        fc.property(validErrorMessage, validErrorContext, (message, context) => {
          const error = createConfigError(message, context)

          // 验证错误结构
          expect(error).toHaveProperty("type")
          expect(error).toHaveProperty("message")
          expect(error).toHaveProperty("context")

          // 验证类型正确
          expect(error.type).toBe(SubAgentErrorType.CONFIG_ERROR)

          // 验证消息正确
          expect(error.message).toBe(message)

          // 验证 context 是对象
          expect(typeof error.context).toBe("object")

          // 验证通过 isSubAgentError 检查
          expect(isSubAgentError(error)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })

    it("createAgentNotFoundError should produce valid SubAgentError with all required fields", () => {
      const validAgentNames = fc.array(validAgentId, { minLength: 0, maxLength: 5 })

      fc.assert(
        fc.property(validAgentId, validAgentNames, (agentName, availableAgents) => {
          const error = createAgentNotFoundError(agentName, availableAgents)

          // 验证错误结构
          expect(error).toHaveProperty("type")
          expect(error).toHaveProperty("message")
          expect(error).toHaveProperty("context")

          // 验证类型正确
          expect(error.type).toBe(SubAgentErrorType.AGENT_NOT_FOUND)

          // 验证消息包含 agent 名称
          expect(error.message).toContain(agentName)

          // 验证 context 包含 customAgentName
          expect(error.context.customAgentName).toBe(agentName)

          // 验证通过 isSubAgentError 检查
          expect(isSubAgentError(error)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })

    it("createTimeoutError should produce valid SubAgentError with all required fields", () => {
      fc.assert(
        fc.property(validTimeout, validErrorContext, (timeoutMs, context) => {
          const error = createTimeoutError(timeoutMs, context)

          // 验证错误结构
          expect(error).toHaveProperty("type")
          expect(error).toHaveProperty("message")
          expect(error).toHaveProperty("context")

          // 验证类型正确
          expect(error.type).toBe(SubAgentErrorType.TIMEOUT)

          // 验证消息包含超时时间
          expect(error.message).toContain(String(timeoutMs))

          // 验证 context 包含 timeoutMs
          expect(error.context.timeoutMs).toBe(timeoutMs)

          // 验证通过 isSubAgentError 检查
          expect(isSubAgentError(error)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })

    it("createAbortedError should produce valid SubAgentError with all required fields", () => {
      fc.assert(
        fc.property(validErrorContext, (context) => {
          const error = createAbortedError(context)

          // 验证错误结构
          expect(error).toHaveProperty("type")
          expect(error).toHaveProperty("message")
          expect(error).toHaveProperty("context")

          // 验证类型正确
          expect(error.type).toBe(SubAgentErrorType.ABORTED)

          // 验证消息非空
          expect(error.message.length).toBeGreaterThan(0)

          // 验证通过 isSubAgentError 检查
          expect(isSubAgentError(error)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })

    it("createLLMError should produce valid SubAgentError with all required fields", () => {
      fc.assert(
        fc.property(validErrorMessage, validErrorContext, (message, context) => {
          const error = createLLMError(message, context)

          // 验证错误结构
          expect(error).toHaveProperty("type")
          expect(error).toHaveProperty("message")
          expect(error).toHaveProperty("context")

          // 验证类型正确
          expect(error.type).toBe(SubAgentErrorType.LLM_ERROR)

          // 验证消息正确
          expect(error.message).toBe(message)

          // 验证通过 isSubAgentError 检查
          expect(isSubAgentError(error)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })

    it("createToolError should produce valid SubAgentError with all required fields", () => {
      fc.assert(
        fc.property(
          validToolName,
          validErrorMessage,
          validErrorContext,
          (toolName, message, context) => {
            const error = createToolError(toolName, message, context)

            // 验证错误结构
            expect(error).toHaveProperty("type")
            expect(error).toHaveProperty("message")
            expect(error).toHaveProperty("context")

            // 验证类型正确
            expect(error.type).toBe(SubAgentErrorType.TOOL_ERROR)

            // 验证消息包含工具名称
            expect(error.message).toContain(toolName)

            // 验证 context 包含 toolName
            expect(error.context.toolName).toBe(toolName)

            // 验证通过 isSubAgentError 检查
            expect(isSubAgentError(error)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it("createConcurrencyError should produce valid SubAgentError with all required fields", () => {
      fc.assert(
        fc.property(validConcurrency, validConcurrency, (maxConcurrency, currentConcurrency) => {
          const error = createConcurrencyError(maxConcurrency, currentConcurrency)

          // 验证错误结构
          expect(error).toHaveProperty("type")
          expect(error).toHaveProperty("message")
          expect(error).toHaveProperty("context")

          // 验证类型正确
          expect(error.type).toBe(SubAgentErrorType.CONCURRENCY_ERROR)

          // 验证 context 包含并发信息
          expect(error.context.maxConcurrency).toBe(maxConcurrency)
          expect(error.context.currentConcurrency).toBe(currentConcurrency)

          // 验证通过 isSubAgentError 检查
          expect(isSubAgentError(error)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })

    it("createRetryExhaustedError should produce valid SubAgentError with all required fields", () => {
      fc.assert(
        fc.property(
          validRetryCount,
          validErrorMessage,
          validErrorContext,
          (retryCount, lastError, context) => {
            const error = createRetryExhaustedError(retryCount, lastError, context)

            // 验证错误结构
            expect(error).toHaveProperty("type")
            expect(error).toHaveProperty("message")
            expect(error).toHaveProperty("context")

            // 验证类型正确
            expect(error.type).toBe(SubAgentErrorType.RETRY_EXHAUSTED)

            // 验证消息包含重试次数
            expect(error.message).toContain(String(retryCount))

            // 验证 context 包含 retryCount
            expect(error.context.retryCount).toBe(retryCount)

            // 验证通过 isSubAgentError 检查
            expect(isSubAgentError(error)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：所有错误工厂函数产生的错误都应该通过 isSubAgentError 检查
     */
    it("all error factory functions should produce errors that pass isSubAgentError check", () => {
      fc.assert(
        fc.property(
          validErrorMessage,
          validErrorContext,
          validToolName,
          validTimeout,
          validConcurrency,
          validRetryCount,
          validAgentId,
          (message, context, toolName, timeout, concurrency, retryCount, agentName) => {
            // 测试所有错误工厂函数
            const errors: SubAgentError[] = [
              createConfigError(message, context),
              createAgentNotFoundError(agentName),
              createTimeoutError(timeout, context),
              createAbortedError(context),
              createLLMError(message, context),
              createToolError(toolName, message, context),
              createConcurrencyError(concurrency, concurrency + 1),
              createRetryExhaustedError(retryCount, message, context),
            ]

            // 验证所有错误都通过检查
            for (const error of errors) {
              expect(isSubAgentError(error)).toBe(true)
              expect(error.type).toBeDefined()
              expect(error.message).toBeDefined()
              expect(error.context).toBeDefined()
              expect(typeof error.type).toBe("string")
              expect(typeof error.message).toBe("string")
              expect(typeof error.context).toBe("object")
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：错误类型应该是有效的 SubAgentErrorType 枚举值
     */
    it("error type should be a valid SubAgentErrorType enum value", () => {
      const validErrorTypes = Object.values(SubAgentErrorType)

      fc.assert(
        fc.property(
          validErrorMessage,
          validErrorContext,
          validToolName,
          validTimeout,
          validConcurrency,
          validRetryCount,
          validAgentId,
          (message, context, toolName, timeout, concurrency, retryCount, agentName) => {
            const errors: SubAgentError[] = [
              createConfigError(message, context),
              createAgentNotFoundError(agentName),
              createTimeoutError(timeout, context),
              createAbortedError(context),
              createLLMError(message, context),
              createToolError(toolName, message, context),
              createConcurrencyError(concurrency, concurrency + 1),
              createRetryExhaustedError(retryCount, message, context),
            ]

            for (const error of errors) {
              expect(validErrorTypes).toContain(error.type)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })


  // ==========================================================================
  // Property 18: Retry Behavior
  // ==========================================================================

  describe("Property 18: Retry Behavior", () => {
    /**
     * **Validates: Requirements 7.3**
     *
     * *For any* Task tool execution with retry enabled, failed attempts SHALL
     * be retried up to maxAttempts times with exponential backoff delay.
     */

    /**
     * 属性：重试延迟应该遵循指数退避公式
     *
     * delay(attempt) = initialDelay * (backoffMultiplier ^ (attempt - 1))
     */
    it("retry delay should follow exponential backoff formula", () => {
      fc.assert(
        fc.property(validRetryConfig, validAttempt, (config, attempt) => {
          const delay = calculateDelay(attempt, config)
          const backoffMultiplier = config.backoffMultiplier ?? 1
          const expectedDelay = config.delay * Math.pow(backoffMultiplier, attempt - 1)
          const maxDelay = config.maxDelay ?? Infinity

          // 验证延迟计算正确（考虑 maxDelay 限制）
          expect(delay).toBe(Math.min(expectedDelay, maxDelay))
        }),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：重试延迟应该不超过 maxDelay
     */
    it("retry delay should never exceed maxDelay", () => {
      fc.assert(
        fc.property(validRetryConfig, validAttempt, (config, attempt) => {
          const delay = calculateDelay(attempt, config)
          const maxDelay = config.maxDelay ?? Infinity

          // 验证延迟不超过 maxDelay
          expect(delay).toBeLessThanOrEqual(maxDelay)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：第一次尝试的延迟应该等于初始延迟
     */
    it("first attempt delay should equal initial delay", () => {
      fc.assert(
        fc.property(validRetryConfig, (config) => {
          const delay = calculateDelay(1, config)

          // 第一次尝试：delay * (multiplier ^ 0) = delay * 1 = delay
          expect(delay).toBe(config.delay)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：延迟应该随尝试次数单调递增（在 maxDelay 限制内）
     */
    it("delay should monotonically increase with attempt number (within maxDelay)", () => {
      fc.assert(
        fc.property(
          validRetryConfig.filter((c) => (c.backoffMultiplier ?? 1) >= 1),
          fc.integer({ min: 1, max: 9 }),
          (config, attempt) => {
            const delay1 = calculateDelay(attempt, config)
            const delay2 = calculateDelay(attempt + 1, config)

            // 延迟应该单调递增或保持不变（当达到 maxDelay 时）
            expect(delay2).toBeGreaterThanOrEqual(delay1)
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：当 backoffMultiplier 为 1 时，延迟应该保持恒定
     */
    it("delay should remain constant when backoffMultiplier is 1", () => {
      const configWithNoBackoff = fc.record({
        maxRetries: fc.integer({ min: 1, max: 10 }),
        delay: fc.integer({ min: 100, max: 5000 }),
        backoffMultiplier: fc.constant(1),
        maxDelay: fc.option(fc.integer({ min: 5000, max: 60000 }), { nil: undefined }),
      })

      fc.assert(
        fc.property(configWithNoBackoff, validAttempt, (config, attempt) => {
          const delay = calculateDelay(attempt, config)

          // 当 backoffMultiplier 为 1 时，延迟应该等于初始延迟
          expect(delay).toBe(config.delay)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：延迟应该始终为正数
     */
    it("delay should always be positive", () => {
      fc.assert(
        fc.property(validRetryConfig, validAttempt, (config, attempt) => {
          const delay = calculateDelay(attempt, config)

          // 延迟应该为正数
          expect(delay).toBeGreaterThan(0)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：可重试错误类型应该被正确识别
     */
    it("retryable error types should be correctly identified", () => {
      fc.assert(
        fc.property(retryableErrorTypes, (errorType) => {
          const error: SubAgentError = {
            type: errorType,
            message: "Test error",
            context: {},
          }

          // 验证可重试错误被正确识别
          expect(isRetryableErrorType(error)).toBe(true)
          expect(isRetryableSubAgentError(error)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：不可重试错误类型应该被正确识别
     */
    it("non-retryable error types should be correctly identified", () => {
      fc.assert(
        fc.property(nonRetryableErrorTypes, (errorType) => {
          const error: SubAgentError = {
            type: errorType,
            message: "Test error",
            context: {},
          }

          // 验证不可重试错误被正确识别
          expect(isRetryableErrorType(error)).toBe(false)
          expect(isRetryableSubAgentError(error)).toBe(false)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：默认重试配置应该包含所有必要字段
     */
    it("default retry config should have all required fields", () => {
      expect(DEFAULT_RETRY_CONFIG).toHaveProperty("maxRetries")
      expect(DEFAULT_RETRY_CONFIG).toHaveProperty("delay")
      expect(DEFAULT_RETRY_CONFIG).toHaveProperty("backoffMultiplier")
      expect(DEFAULT_RETRY_CONFIG).toHaveProperty("maxDelay")
      expect(DEFAULT_RETRY_CONFIG).toHaveProperty("retryableErrorTypes")

      // 验证默认值合理
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBeGreaterThan(0)
      expect(DEFAULT_RETRY_CONFIG.delay).toBeGreaterThan(0)
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBeGreaterThanOrEqual(1)
      expect(DEFAULT_RETRY_CONFIG.maxDelay).toBeGreaterThan(DEFAULT_RETRY_CONFIG.delay)
      expect(Array.isArray(DEFAULT_RETRY_CONFIG.retryableErrorTypes)).toBe(true)
    })

    /**
     * 属性：自定义可重试错误类型列表应该被正确使用
     */
    it("custom retryable error types should be correctly used", () => {
      // 创建自定义可重试类型列表（只包含 CONFIG_ERROR）
      const customRetryableTypes = [SubAgentErrorType.CONFIG_ERROR]

      fc.assert(
        fc.property(allErrorTypes, (errorType) => {
          const error: SubAgentError = {
            type: errorType,
            message: "Test error",
            context: {},
          }

          const isRetryable = isRetryableSubAgentError(error, customRetryableTypes)

          // 只有 CONFIG_ERROR 应该被识别为可重试
          if (errorType === SubAgentErrorType.CONFIG_ERROR) {
            expect(isRetryable).toBe(true)
          } else {
            expect(isRetryable).toBe(false)
          }
        }),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：指数退避应该在多次尝试后显著增加延迟
     */
    it("exponential backoff should significantly increase delay after multiple attempts", () => {
      const configWithBackoff = fc.record({
        maxRetries: fc.integer({ min: 5, max: 10 }),
        delay: fc.integer({ min: 100, max: 1000 }),
        backoffMultiplier: fc.double({ min: 1.5, max: 3, noNaN: true }),
        maxDelay: fc.constant(Infinity), // 不限制 maxDelay 以观察增长
      })

      fc.assert(
        fc.property(configWithBackoff, (config) => {
          const delay1 = calculateDelay(1, config)
          const delay5 = calculateDelay(5, config)

          // 第 5 次尝试的延迟应该显著大于第 1 次
          // delay5 = delay * (multiplier ^ 4)
          // 当 multiplier >= 1.5 时，multiplier ^ 4 >= 5.0625
          expect(delay5).toBeGreaterThan(delay1 * 5)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * 属性：当达到 maxDelay 时，延迟应该保持在 maxDelay
     */
    it("delay should cap at maxDelay when exponential growth exceeds it", () => {
      const configWithLowMaxDelay = fc.record({
        maxRetries: fc.integer({ min: 5, max: 10 }),
        delay: fc.integer({ min: 1000, max: 2000 }),
        backoffMultiplier: fc.double({ min: 2, max: 3, noNaN: true }),
        maxDelay: fc.integer({ min: 3000, max: 5000 }),
      })

      fc.assert(
        fc.property(configWithLowMaxDelay, (config) => {
          // 计算足够大的尝试次数，使得理论延迟超过 maxDelay
          const largeAttempt = 10
          const delay = calculateDelay(largeAttempt, config)

          // 延迟应该被限制在 maxDelay
          expect(delay).toBe(config.maxDelay)
        }),
        { numRuns: 100 }
      )
    })
  })
})
