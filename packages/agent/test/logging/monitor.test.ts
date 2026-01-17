/**
 * 性能监控测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PerformanceMonitor } from '../../src/logging/monitor.js'

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor

  beforeEach(() => {
    monitor = new PerformanceMonitor()
  })

  describe('异步操作测量', () => {
    it('应该测量成功的异步操作', async () => {
      const result = await monitor.measure('test_op', async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return 'success'
      })

      expect(result).toBe('success')

      const stats = monitor.getStats('test_op')
      expect(stats).toBeDefined()
      expect(stats!.count).toBe(1)
      expect(stats!.avg_duration).toBeGreaterThanOrEqual(10)
      expect(stats!.success_rate).toBe(1)
      expect(stats!.error_rate).toBe(0)
    })

    it('应该测量失败的异步操作', async () => {
      await expect(
        monitor.measure('test_op', async () => {
          await new Promise(resolve => setTimeout(resolve, 10))
          throw new Error('test error')
        })
      ).rejects.toThrow('test error')

      const stats = monitor.getStats('test_op')
      expect(stats).toBeDefined()
      expect(stats!.count).toBe(1)
      expect(stats!.success_rate).toBe(0)
      expect(stats!.error_rate).toBe(1)
    })

    it('应该累积多次操作的统计数据', async () => {
      // 3 次成功
      await monitor.measure('test_op', async () => 'ok')
      await monitor.measure('test_op', async () => 'ok')
      await monitor.measure('test_op', async () => 'ok')

      // 1 次失败
      await monitor.measure('test_op', async () => {
        throw new Error('fail')
      }).catch(() => {})

      const stats = monitor.getStats('test_op')
      expect(stats!.count).toBe(4)
      expect(stats!.success_rate).toBe(0.75)
      expect(stats!.error_rate).toBe(0.25)
    })
  })

  describe('同步操作测量', () => {
    it('应该测量成功的同步操作', () => {
      const result = monitor.measureSync('sync_op', () => {
        return 42
      })

      expect(result).toBe(42)

      const stats = monitor.getStats('sync_op')
      expect(stats).toBeDefined()
      expect(stats!.count).toBe(1)
      expect(stats!.success_rate).toBe(1)
    })

    it('应该测量失败的同步操作', () => {
      expect(() => {
        monitor.measureSync('sync_op', () => {
          throw new Error('sync error')
        })
      }).toThrow('sync error')

      const stats = monitor.getStats('sync_op')
      expect(stats).toBeDefined()
      expect(stats!.error_rate).toBe(1)
    })
  })

  describe('统计数据查询', () => {
    it('不存在的操作应该返回 null', () => {
      const stats = monitor.getStats('non_existent')
      expect(stats).toBeNull()
    })

    it('应该返回所有操作的统计数据', async () => {
      await monitor.measure('op1', async () => 'ok')
      await monitor.measure('op2', async () => 'ok')
      monitor.measureSync('op3', () => 'ok')

      const allStats = monitor.getAllStats()
      expect(allStats).toHaveLength(3)
      expect(allStats.map(s => s.operation)).toContain('op1')
      expect(allStats.map(s => s.operation)).toContain('op2')
      expect(allStats.map(s => s.operation)).toContain('op3')
    })

    it('空监控器应该返回空数组', () => {
      const allStats = monitor.getAllStats()
      expect(allStats).toEqual([])
    })
  })

  describe('统计数据重置', () => {
    it('应该重置指定操作的统计数据', async () => {
      await monitor.measure('test_op', async () => 'ok')
      expect(monitor.getStats('test_op')).toBeDefined()

      monitor.reset('test_op')
      expect(monitor.getStats('test_op')).toBeNull()
    })

    it('应该重置所有统计数据', async () => {
      await monitor.measure('op1', async () => 'ok')
      await monitor.measure('op2', async () => 'ok')

      expect(monitor.getAllStats()).toHaveLength(2)

      monitor.resetAll()
      expect(monitor.getAllStats()).toHaveLength(0)
    })
  })

  describe('平均耗时计算', () => {
    it('应该正确计算平均耗时', async () => {
      // 模拟不同耗时的操作
      await monitor.measure('test_op', async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      await monitor.measure('test_op', async () => {
        await new Promise(resolve => setTimeout(resolve, 20))
      })
      await monitor.measure('test_op', async () => {
        await new Promise(resolve => setTimeout(resolve, 30))
      })

      const stats = monitor.getStats('test_op')
      expect(stats!.count).toBe(3)
      // 平均耗时应该在 15-25ms 之间（考虑误差）
      expect(stats!.avg_duration).toBeGreaterThanOrEqual(15)
      expect(stats!.avg_duration).toBeLessThanOrEqual(30)
    })
  })
})
