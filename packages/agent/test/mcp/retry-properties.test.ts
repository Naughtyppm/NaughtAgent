/**
 * Feature: phase-2-tool-layer, Property 7: 连接失败的指数退避重试
 *
 * 对于任何 MCP 服务器连接失败，客户端应该实施指数退避重试策略，
 * 每次重试的延迟应该是前一次的倍数（直到达到最大延迟），
 * 并且在达到最大重试次数后应该抛出 ConnectionError。
 *
 * **Validates: Requirements 2.6**
 */

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import {
  calculateBackoffDelay,
  connectWithRetry,
  retryOperation,
  createRetryConfig,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from "../../src/mcp/retry"
import { McpClient } from "../../src/mcp/client"
import type { McpServerConfig } from "../../src/mcp/types"

describe("Property 7: 连接失败的指数退避重试", () => {
  /**
   * 属性：退避延迟应该按指数增长
   */
  it("Property 7.1: 退避延迟按指数增长", () => {
    fc.assert(
      fc.property(
        fc.record({
          initialDelayMs: fc.integer({ min: 100, max: 5000 }),
          backoffMultiplier: fc.integer({ min: 2, max: 5 }),
          maxDelayMs: fc.integer({ min: 10000, max: 60000 }),
        }),
        fc.integer({ min: 0, max: 10 }),
        (configData, attempt) => {
          const config: RetryConfig = {
            maxAttempts: 10,
            initialDelayMs: configData.initialDelayMs,
            maxDelayMs: configData.maxDelayMs,
            backoffMultiplier: configData.backoffMultiplier,
          }

          const delay = calculateBackoffDelay(attempt, config)

          // 计算期望的延迟（不超过最大值）
          const expectedDelay = Math.min(
            config.initialDelayMs *
              Math.pow(config.backoffMultiplier, attempt),
            config.maxDelayMs
          )

          // 验证延迟值
          return delay === expectedDelay && delay <= config.maxDelayMs
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * 属性：延迟不应超过最大延迟
   */
  it("Property 7.2: 延迟不超过最大延迟", () => {
    fc.assert(
      fc.property(
        fc.record({
          initialDelayMs: fc.integer({ min: 100, max: 5000 }),
          maxDelayMs: fc.integer({ min: 1000, max: 10000 }),
          backoffMultiplier: fc.integer({ min: 2, max: 5 }),
        }),
        fc.integer({ min: 0, max: 20 }),
        (configData, attempt) => {
          const config: RetryConfig = {
            maxAttempts: 20,
            ...configData,
          }

          const delay = calculateBackoffDelay(attempt, config)

          return delay <= config.maxDelayMs
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * 属性：第一次尝试的延迟应该等于初始延迟
   */
  it("Property 7.3: 第一次重试延迟等于初始延迟", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 10000 }),
        (initialDelayMs) => {
          const config: RetryConfig = {
            maxAttempts: 3,
            initialDelayMs,
            maxDelayMs: 60000,
            backoffMultiplier: 2,
          }

          const delay = calculateBackoffDelay(0, config)

          return delay === initialDelayMs
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * 属性：每次重试的延迟应该大于等于前一次（直到达到最大值）
   */
  it("Property 7.4: 延迟单调递增直到最大值", () => {
    fc.assert(
      fc.property(
        fc.record({
          initialDelayMs: fc.integer({ min: 100, max: 1000 }),
          maxDelayMs: fc.integer({ min: 10000, max: 60000 }),
          backoffMultiplier: fc.integer({ min: 2, max: 5 }),
        }),
        (configData) => {
          const config: RetryConfig = {
            maxAttempts: 10,
            ...configData,
          }

          let previousDelay = 0
          let reachedMax = false

          for (let attempt = 0; attempt < 10; attempt++) {
            const delay = calculateBackoffDelay(attempt, config)

            // 延迟应该大于等于前一次
            if (delay < previousDelay) {
              return false
            }

            // 一旦达到最大值，后续应该保持不变
            if (reachedMax && delay !== config.maxDelayMs) {
              return false
            }

            if (delay === config.maxDelayMs) {
              reachedMax = true
            }

            previousDelay = delay
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * 属性：重试次数不应超过最大重试次数
   */
  it("Property 7.5: 重试次数不超过最大值", async () => {
    const config: McpServerConfig = {
      name: "test-server",
      transport: "stdio",
      command: "nonexistent-command",
      timeout: 100,
    }

    const client = new McpClient(config)

    const retryConfig: RetryConfig = {
      maxAttempts: 3,
      initialDelayMs: 10,
      maxDelayMs: 100,
      backoffMultiplier: 2,
    }

    const result = await connectWithRetry(client, retryConfig)

    // 验证结果
    expect(result.success).toBe(false)
    expect(result.attempts).toBeLessThanOrEqual(retryConfig.maxAttempts)
    expect(result.lastError).toBeDefined()
  })

  /**
   * 属性：成功连接应该立即返回
   */
  it("Property 7.6: 成功连接立即返回", async () => {
    // 使用一个简单的 echo 命令模拟成功连接
    const config: McpServerConfig = {
      name: "test-server",
      transport: "stdio",
      command: "node",
      args: [
        "-e",
        'console.log(JSON.stringify({jsonrpc:"2.0",id:1,result:{protocolVersion:"2024-11-05",capabilities:{},serverInfo:{name:"test",version:"1.0"}}}))',
      ],
      timeout: 1000,
    }

    const client = new McpClient(config)

    const retryConfig: RetryConfig = {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 2,
    }

    const startTime = Date.now()
    const result = await connectWithRetry(client, retryConfig)
    const duration = Date.now() - startTime

    // 如果成功，应该只尝试一次
    if (result.success) {
      expect(result.attempts).toBe(1)
      // 不应该有重试延迟
      expect(duration).toBeLessThan(2000)
    }

    await client.disconnect()
  })

  /**
   * 属性：retryOperation 应该遵循相同的重试逻辑
   */
  it("Property 7.7: retryOperation 遵循重试逻辑", async () => {
    let attemptCount = 0

    const operation = async () => {
      attemptCount++
      if (attemptCount < 3) {
        throw new Error("Operation failed")
      }
      return "success"
    }

    const retryConfig: RetryConfig = {
      maxAttempts: 5,
      initialDelayMs: 10,
      maxDelayMs: 100,
      backoffMultiplier: 2,
    }

    const result = await retryOperation(operation, retryConfig, "test-op")

    expect(result).toBe("success")
    expect(attemptCount).toBe(3)
  })

  /**
   * 属性：retryOperation 失败后应该抛出错误
   */
  it("Property 7.8: retryOperation 失败后抛出错误", async () => {
    const operation = async () => {
      throw new Error("Always fails")
    }

    const retryConfig: RetryConfig = {
      maxAttempts: 3,
      initialDelayMs: 10,
      maxDelayMs: 100,
      backoffMultiplier: 2,
    }

    await expect(
      retryOperation(operation, retryConfig, "test-op")
    ).rejects.toThrow()
  })

  /**
   * 属性：createRetryConfig 应该合并默认配置
   */
  it("Property 7.9: createRetryConfig 合并默认配置", () => {
    // 测试空配置
    const config1 = createRetryConfig({})
    expect(config1).toEqual(DEFAULT_RETRY_CONFIG)

    // 测试部分配置
    const config2 = createRetryConfig({ maxAttempts: 5 })
    expect(config2.maxAttempts).toBe(5)
    expect(config2.initialDelayMs).toBe(DEFAULT_RETRY_CONFIG.initialDelayMs)
    expect(config2.maxDelayMs).toBe(DEFAULT_RETRY_CONFIG.maxDelayMs)
    expect(config2.backoffMultiplier).toBe(
      DEFAULT_RETRY_CONFIG.backoffMultiplier
    )

    // 测试完整配置
    const config3 = createRetryConfig({
      maxAttempts: 10,
      initialDelayMs: 500,
      maxDelayMs: 20000,
      backoffMultiplier: 3,
    })
    expect(config3.maxAttempts).toBe(10)
    expect(config3.initialDelayMs).toBe(500)
    expect(config3.maxDelayMs).toBe(20000)
    expect(config3.backoffMultiplier).toBe(3)
  })

  /**
   * 属性：默认配置应该是合理的
   */
  it("Property 7.10: 默认配置合理", () => {
    expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBeGreaterThan(0)
    expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBeGreaterThan(0)
    expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBeGreaterThan(
      DEFAULT_RETRY_CONFIG.initialDelayMs
    )
    expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBeGreaterThan(1)
  })
})
