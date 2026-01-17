/**
 * 重试机制测试
 * 
 * 测试 withRetry 函数和重试策略
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withRetry, defaultRetryPolicy, type RetryPolicy } from '../../src/error/retry.js'
import { AgentError, ErrorCode } from '../../src/error/types.js'

describe('defaultRetryPolicy', () => {
  it('should have correct default values', () => {
    expect(defaultRetryPolicy.maxAttempts).toBe(3)
    expect(defaultRetryPolicy.initialDelay).toBe(1000)
    expect(defaultRetryPolicy.maxDelay).toBe(10000)
    expect(defaultRetryPolicy.backoffMultiplier).toBe(2)
    expect(defaultRetryPolicy.retryableErrors).toEqual([
      ErrorCode.NETWORK_ERROR,
      ErrorCode.TIMEOUT,
      ErrorCode.RATE_LIMIT
    ])
  })
})

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('successful execution', () => {
    it('should return result on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const promise = withRetry(fn)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should return result after retry', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new AgentError('Network error', ErrorCode.NETWORK_ERROR, true))
        .mockResolvedValue('success')

      const promise = withRetry(fn)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should work with different return types', async () => {
      const numberFn = vi.fn().mockResolvedValue(42)
      const objectFn = vi.fn().mockResolvedValue({ data: 'test' })
      const arrayFn = vi.fn().mockResolvedValue([1, 2, 3])

      const promise1 = withRetry(numberFn)
      await vi.runAllTimersAsync()
      expect(await promise1).toBe(42)

      const promise2 = withRetry(objectFn)
      await vi.runAllTimersAsync()
      expect(await promise2).toEqual({ data: 'test' })

      const promise3 = withRetry(arrayFn)
      await vi.runAllTimersAsync()
      expect(await promise3).toEqual([1, 2, 3])
    })
  })

  describe('retry behavior', () => {
    it('should retry on retryable errors', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new AgentError('Network error', ErrorCode.NETWORK_ERROR, true))
        .mockRejectedValueOnce(new AgentError('Timeout', ErrorCode.TIMEOUT, true))
        .mockResolvedValue('success')

      const promise = withRetry(fn)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should not retry on non-retryable errors', async () => {
      const fn = vi.fn()
        .mockRejectedValue(new AgentError('Internal error', ErrorCode.INTERNAL_ERROR, false))

      const promise = withRetry(fn)
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('Internal error')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should not retry on non-AgentError', async () => {
      const fn = vi.fn()
        .mockRejectedValue(new Error('Regular error'))

      const promise = withRetry(fn)
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('Regular error')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should respect maxAttempts', async () => {
      const fn = vi.fn()
        .mockRejectedValue(new AgentError('Network error', ErrorCode.NETWORK_ERROR, true))

      const policy: RetryPolicy = {
        ...defaultRetryPolicy,
        maxAttempts: 2
      }

      const promise = withRetry(fn, policy)
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('Network error')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should throw last error after all retries exhausted', async () => {
      const fn = vi.fn()
        .mockRejectedValue(new AgentError('Network error', ErrorCode.NETWORK_ERROR, true))

      const promise = withRetry(fn)
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('Network error')
      expect(fn).toHaveBeenCalledTimes(3)
    })
  })

  describe('exponential backoff', () => {
    it('should use exponential backoff delays', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new AgentError('Error 1', ErrorCode.NETWORK_ERROR, true))
        .mockRejectedValueOnce(new AgentError('Error 2', ErrorCode.NETWORK_ERROR, true))
        .mockResolvedValue('success')

      const policy: RetryPolicy = {
        maxAttempts: 3,
        initialDelay: 100,
        maxDelay: 10000,
        backoffMultiplier: 2,
        retryableErrors: [ErrorCode.NETWORK_ERROR]
      }

      const promise = withRetry(fn, policy)

      // 第一次失败后等待 100ms
      await vi.advanceTimersByTimeAsync(100)
      expect(fn).toHaveBeenCalledTimes(2)

      // 第二次失败后等待 200ms (100 * 2)
      await vi.advanceTimersByTimeAsync(200)
      expect(fn).toHaveBeenCalledTimes(3)

      const result = await promise
      expect(result).toBe('success')
    })

    it('should respect maxDelay', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new AgentError('Error 1', ErrorCode.NETWORK_ERROR, true))
        .mockRejectedValueOnce(new AgentError('Error 2', ErrorCode.NETWORK_ERROR, true))
        .mockResolvedValue('success')

      const policy: RetryPolicy = {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 1500,
        backoffMultiplier: 3,
        retryableErrors: [ErrorCode.NETWORK_ERROR]
      }

      const promise = withRetry(fn, policy)

      // 第一次失败后等待 1000ms
      await vi.advanceTimersByTimeAsync(1000)
      expect(fn).toHaveBeenCalledTimes(2)

      // 第二次失败后应该等待 3000ms，但被限制为 1500ms
      await vi.advanceTimersByTimeAsync(1500)
      expect(fn).toHaveBeenCalledTimes(3)

      const result = await promise
      expect(result).toBe('success')
    })

    it('should calculate delays correctly with different multipliers', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new AgentError('Error 1', ErrorCode.NETWORK_ERROR, true))
        .mockRejectedValueOnce(new AgentError('Error 2', ErrorCode.NETWORK_ERROR, true))
        .mockResolvedValue('success')

      const policy: RetryPolicy = {
        maxAttempts: 3,
        initialDelay: 50,
        maxDelay: 10000,
        backoffMultiplier: 3,
        retryableErrors: [ErrorCode.NETWORK_ERROR]
      }

      const promise = withRetry(fn, policy)

      // 第一次失败后等待 50ms
      await vi.advanceTimersByTimeAsync(50)
      expect(fn).toHaveBeenCalledTimes(2)

      // 第二次失败后等待 150ms (50 * 3)
      await vi.advanceTimersByTimeAsync(150)
      expect(fn).toHaveBeenCalledTimes(3)

      const result = await promise
      expect(result).toBe('success')
    })
  })

  describe('custom retry policy', () => {
    it('should use custom retryable errors', async () => {
      const fn = vi.fn()
        .mockRejectedValue(new AgentError('API error', ErrorCode.API_ERROR, true))

      const policy: RetryPolicy = {
        maxAttempts: 2,
        initialDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        retryableErrors: [ErrorCode.API_ERROR]
      }

      const promise = withRetry(fn, policy)
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('API error')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should not retry errors not in retryableErrors list', async () => {
      const fn = vi.fn()
        .mockRejectedValue(new AgentError('Network error', ErrorCode.NETWORK_ERROR, true))

      const policy: RetryPolicy = {
        maxAttempts: 3,
        initialDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        retryableErrors: [ErrorCode.TIMEOUT] // 只重试 TIMEOUT
      }

      const promise = withRetry(fn, policy)
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('Network error')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should work with empty retryableErrors list', async () => {
      const fn = vi.fn()
        .mockRejectedValue(new AgentError('Network error', ErrorCode.NETWORK_ERROR, true))

      const policy: RetryPolicy = {
        maxAttempts: 3,
        initialDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        retryableErrors: []
      }

      const promise = withRetry(fn, policy)
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('Network error')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should work with multiple retryable error types', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new AgentError('Network error', ErrorCode.NETWORK_ERROR, true))
        .mockRejectedValueOnce(new AgentError('Timeout', ErrorCode.TIMEOUT, true))
        .mockRejectedValueOnce(new AgentError('Rate limit', ErrorCode.RATE_LIMIT, true))
        .mockResolvedValue('success')

      const policy: RetryPolicy = {
        maxAttempts: 4,
        initialDelay: 50,
        maxDelay: 1000,
        backoffMultiplier: 2,
        retryableErrors: [
          ErrorCode.NETWORK_ERROR,
          ErrorCode.TIMEOUT,
          ErrorCode.RATE_LIMIT
        ]
      }

      const promise = withRetry(fn, policy)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(4)
    })
  })

  describe('edge cases', () => {
    it('should handle maxAttempts = 1 (no retry)', async () => {
      const fn = vi.fn()
        .mockRejectedValue(new AgentError('Network error', ErrorCode.NETWORK_ERROR, true))

      const policy: RetryPolicy = {
        maxAttempts: 1,
        initialDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        retryableErrors: [ErrorCode.NETWORK_ERROR]
      }

      const promise = withRetry(fn, policy)
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('Network error')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should handle very small delays', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new AgentError('Error', ErrorCode.NETWORK_ERROR, true))
        .mockResolvedValue('success')

      const policy: RetryPolicy = {
        maxAttempts: 2,
        initialDelay: 1,
        maxDelay: 10,
        backoffMultiplier: 2,
        retryableErrors: [ErrorCode.NETWORK_ERROR]
      }

      const promise = withRetry(fn, policy)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should handle very large delays', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new AgentError('Error', ErrorCode.NETWORK_ERROR, true))
        .mockResolvedValue('success')

      const policy: RetryPolicy = {
        maxAttempts: 2,
        initialDelay: 5000,
        maxDelay: 100000,
        backoffMultiplier: 2,
        retryableErrors: [ErrorCode.NETWORK_ERROR]
      }

      const promise = withRetry(fn, policy)
      await vi.advanceTimersByTimeAsync(5000)
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should handle backoffMultiplier = 1 (constant delay)', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new AgentError('Error 1', ErrorCode.NETWORK_ERROR, true))
        .mockRejectedValueOnce(new AgentError('Error 2', ErrorCode.NETWORK_ERROR, true))
        .mockResolvedValue('success')

      const policy: RetryPolicy = {
        maxAttempts: 3,
        initialDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 1,
        retryableErrors: [ErrorCode.NETWORK_ERROR]
      }

      const promise = withRetry(fn, policy)

      // 每次都等待 100ms
      await vi.advanceTimersByTimeAsync(100)
      expect(fn).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(100)
      expect(fn).toHaveBeenCalledTimes(3)

      const result = await promise
      expect(result).toBe('success')
    })

    it('should handle function that throws synchronously', async () => {
      const fn = vi.fn(() => {
        throw new AgentError('Sync error', ErrorCode.INTERNAL_ERROR, false)
      })

      const promise = withRetry(fn)
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('Sync error')
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })

  describe('real-world scenarios', () => {
    it('should handle API rate limiting scenario', async () => {
      let callCount = 0
      const fn = vi.fn(async () => {
        callCount++
        if (callCount <= 2) {
          throw new AgentError(
            'Rate limit exceeded',
            ErrorCode.RATE_LIMIT,
            true,
            { remaining: 0, resetAt: Date.now() + 1000 }
          )
        }
        return { data: 'success' }
      })

      const promise = withRetry(fn)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toEqual({ data: 'success' })
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should handle network timeout scenario', async () => {
      let callCount = 0
      const fn = vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          throw new AgentError(
            'Connection timeout',
            ErrorCode.TIMEOUT,
            true,
            { timeout: 5000 }
          )
        }
        return 'connected'
      })

      const promise = withRetry(fn)
      await vi.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('connected')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should handle authentication failure (non-retryable)', async () => {
      const fn = vi.fn(async () => {
        throw new AgentError(
          'Invalid API key',
          ErrorCode.AUTHENTICATION_ERROR,
          false,
          { apiKey: 'sk-xxx' }
        )
      })

      const promise = withRetry(fn)
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('Invalid API key')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should handle mixed error types', async () => {
      let callCount = 0
      const fn = vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          throw new AgentError('Network error', ErrorCode.NETWORK_ERROR, true)
        }
        if (callCount === 2) {
          throw new AgentError('Internal error', ErrorCode.INTERNAL_ERROR, false)
        }
        return 'success'
      })

      const promise = withRetry(fn)
      await vi.runAllTimersAsync()

      // 第一次重试成功，第二次遇到不可重试错误
      await expect(promise).rejects.toThrow('Internal error')
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })
})
