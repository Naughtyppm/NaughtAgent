/**
 * TraceId 管理测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  generateTraceId,
  getCurrentTraceId,
  setTraceId,
  withTraceId,
  withNewTraceId
} from '../../src/logging/trace.js'

describe('TraceId 管理', () => {
  describe('generateTraceId', () => {
    it('应该生成符合格式的 TraceId', () => {
      const traceId = generateTraceId()
      expect(traceId).toMatch(/^trace_\d+_[a-z0-9]+$/)
    })

    it('每次生成的 TraceId 应该不同', () => {
      const id1 = generateTraceId()
      const id2 = generateTraceId()
      expect(id1).not.toBe(id2)
    })

    it('TraceId 应该包含时间戳', () => {
      const before = Date.now()
      const traceId = generateTraceId()
      const after = Date.now()

      const timestamp = parseInt(traceId.split('_')[1])
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe('getCurrentTraceId', () => {
    it('没有设置时应该返回 undefined', () => {
      const traceId = getCurrentTraceId()
      expect(traceId).toBeUndefined()
    })
  })

  describe('setTraceId', () => {
    it('应该设置当前 TraceId', () => {
      const testId = 'trace_test_123'
      setTraceId(testId)
      expect(getCurrentTraceId()).toBe(testId)
    })

    it('应该覆盖之前的 TraceId', () => {
      setTraceId('trace_1')
      setTraceId('trace_2')
      expect(getCurrentTraceId()).toBe('trace_2')
    })
  })

  describe('withTraceId', () => {
    it('应该在指定 TraceId 上下文中执行函数', async () => {
      const testId = 'trace_test_456'
      let capturedId: string | undefined

      await withTraceId(testId, async () => {
        capturedId = getCurrentTraceId()
      })

      expect(capturedId).toBe(testId)
    })

    it('应该返回函数的执行结果', async () => {
      const result = await withTraceId('trace_test', async () => {
        return 'success'
      })

      expect(result).toBe('success')
    })

    it('应该传播函数抛出的错误', async () => {
      await expect(
        withTraceId('trace_test', async () => {
          throw new Error('test error')
        })
      ).rejects.toThrow('test error')
    })

    it('应该在嵌套调用中保持独立的上下文', async () => {
      const results: string[] = []

      await withTraceId('outer', async () => {
        results.push(getCurrentTraceId()!)

        await withTraceId('inner', async () => {
          results.push(getCurrentTraceId()!)
        })

        results.push(getCurrentTraceId()!)
      })

      expect(results).toEqual(['outer', 'inner', 'outer'])
    })

    it('应该在并发调用中隔离上下文', async () => {
      const results: string[] = []

      await Promise.all([
        withTraceId('trace_1', async () => {
          await new Promise(resolve => setTimeout(resolve, 10))
          results.push(getCurrentTraceId()!)
        }),
        withTraceId('trace_2', async () => {
          await new Promise(resolve => setTimeout(resolve, 5))
          results.push(getCurrentTraceId()!)
        }),
        withTraceId('trace_3', async () => {
          results.push(getCurrentTraceId()!)
        })
      ])

      expect(results).toHaveLength(3)
      expect(results).toContain('trace_1')
      expect(results).toContain('trace_2')
      expect(results).toContain('trace_3')
    })
  })

  describe('withNewTraceId', () => {
    it('应该自动生成新的 TraceId', async () => {
      const { traceId, result } = await withNewTraceId(async () => {
        return getCurrentTraceId()
      })

      expect(traceId).toMatch(/^trace_\d+_[a-z0-9]+$/)
      expect(result).toBe(traceId)
    })

    it('应该返回函数的执行结果', async () => {
      const { traceId, result } = await withNewTraceId(async () => {
        return 'test result'
      })

      expect(traceId).toBeDefined()
      expect(result).toBe('test result')
    })

    it('每次调用应该生成不同的 TraceId', async () => {
      const { traceId: id1 } = await withNewTraceId(async () => {})
      const { traceId: id2 } = await withNewTraceId(async () => {})

      expect(id1).not.toBe(id2)
    })
  })

  describe('跨异步操作的上下文传递', () => {
    it('应该在 Promise 链中保持 TraceId', async () => {
      const ids: string[] = []

      await withTraceId('trace_chain', async () => {
        ids.push(getCurrentTraceId()!)

        await Promise.resolve().then(() => {
          ids.push(getCurrentTraceId()!)
        })

        await new Promise(resolve => setTimeout(resolve, 10)).then(() => {
          ids.push(getCurrentTraceId()!)
        })
      })

      expect(ids).toEqual(['trace_chain', 'trace_chain', 'trace_chain'])
    })

    it('应该在 async/await 中保持 TraceId', async () => {
      const ids: string[] = []

      await withTraceId('trace_async', async () => {
        ids.push(getCurrentTraceId()!)

        await new Promise(resolve => setTimeout(resolve, 10))
        ids.push(getCurrentTraceId()!)

        await new Promise(resolve => setTimeout(resolve, 10))
        ids.push(getCurrentTraceId()!)
      })

      expect(ids).toEqual(['trace_async', 'trace_async', 'trace_async'])
    })
  })
})
