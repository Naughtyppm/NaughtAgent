/**
 * 日志系统集成测试
 * 
 * 测试 Logger、PerformanceMonitor 和 TraceId 的协同工作
 */

import { describe, it, expect } from 'vitest'
import { Logger, LogLevel } from '../../src/logging/logger.js'
import { PerformanceMonitor } from '../../src/logging/monitor.js'
import { withTraceId, getCurrentTraceId } from '../../src/logging/trace.js'

describe('日志系统集成', () => {
  it('Logger 应该自动包含 TraceId', async () => {
    let capturedEntry: any = null
    const logger = new Logger('test', {
      output: (entry) => { capturedEntry = entry }
    })

    await withTraceId('trace_integration_test', async () => {
      logger.info('test message')
    })

    expect(capturedEntry).toBeDefined()
    expect(capturedEntry.trace_id).toBe('trace_integration_test')
  })

  it('PerformanceMonitor 和 Logger 应该协同工作', async () => {
    const logs: any[] = []
    const logger = new Logger('perf', {
      output: (entry) => logs.push(entry)
    })
    const monitor = new PerformanceMonitor()

    await withTraceId('trace_perf_test', async () => {
      const result = await monitor.measure('test_operation', async () => {
        logger.info('Operation started')
        await new Promise(resolve => setTimeout(resolve, 10))
        logger.info('Operation completed')
        return 'success'
      })

      expect(result).toBe('success')
    })

    // 验证日志包含 TraceId
    expect(logs).toHaveLength(2)
    expect(logs[0].trace_id).toBe('trace_perf_test')
    expect(logs[1].trace_id).toBe('trace_perf_test')

    // 验证性能监控数据
    const stats = monitor.getStats('test_operation')
    expect(stats).toBeDefined()
    expect(stats!.success_rate).toBe(1)
  })

  it('嵌套 TraceId 应该正确传递到日志', async () => {
    const logs: any[] = []
    const logger = new Logger('nested', {
      output: (entry) => logs.push(entry)
    })

    await withTraceId('outer_trace', async () => {
      logger.info('Outer operation')

      await withTraceId('inner_trace', async () => {
        logger.info('Inner operation')
      })

      logger.info('Back to outer')
    })

    expect(logs).toHaveLength(3)
    expect(logs[0].trace_id).toBe('outer_trace')
    expect(logs[1].trace_id).toBe('inner_trace')
    expect(logs[2].trace_id).toBe('outer_trace')
  })

  it('并发操作应该保持独立的 TraceId', async () => {
    const logs: any[] = []
    const logger = new Logger('concurrent', {
      output: (entry) => logs.push(entry)
    })

    await Promise.all([
      withTraceId('trace_1', async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        logger.info('Operation 1')
      }),
      withTraceId('trace_2', async () => {
        await new Promise(resolve => setTimeout(resolve, 5))
        logger.info('Operation 2')
      }),
      withTraceId('trace_3', async () => {
        logger.info('Operation 3')
      })
    ])

    expect(logs).toHaveLength(3)
    const traceIds = logs.map(log => log.trace_id)
    expect(traceIds).toContain('trace_1')
    expect(traceIds).toContain('trace_2')
    expect(traceIds).toContain('trace_3')
  })

  it('完整的请求处理流程', async () => {
    const logs: any[] = []
    const logger = new Logger('request', {
      minLevel: LogLevel.DEBUG,
      output: (entry) => logs.push(entry)
    })
    const monitor = new PerformanceMonitor()

    // 模拟一个完整的请求处理流程
    await withTraceId('trace_request_123', async () => {
      logger.info('Request received', { method: 'GET', path: '/api/data' })

      // 数据库查询
      await monitor.measure('db_query', async () => {
        logger.debug('Querying database')
        await new Promise(resolve => setTimeout(resolve, 20))
        logger.debug('Database query completed')
      })

      // API 调用
      await monitor.measure('api_call', async () => {
        logger.debug('Calling external API')
        await new Promise(resolve => setTimeout(resolve, 30))
        logger.debug('API call completed')
      })

      logger.info('Request completed', { status: 200 })
    })

    // 验证所有日志都有相同的 TraceId
    expect(logs.every(log => log.trace_id === 'trace_request_123')).toBe(true)

    // 验证日志顺序和内容
    expect(logs[0].message).toBe('Request received')
    expect(logs[logs.length - 1].message).toBe('Request completed')

    // 验证性能监控数据
    const dbStats = monitor.getStats('db_query')
    const apiStats = monitor.getStats('api_call')
    expect(dbStats).toBeDefined()
    expect(apiStats).toBeDefined()
    expect(dbStats!.avg_duration).toBeGreaterThanOrEqual(20)
    expect(apiStats!.avg_duration).toBeGreaterThanOrEqual(30)
  })

  it('错误处理应该记录到日志和监控', async () => {
    const logs: any[] = []
    const logger = new Logger('error', {
      output: (entry) => logs.push(entry)
    })
    const monitor = new PerformanceMonitor()

    await withTraceId('trace_error_test', async () => {
      logger.info('Starting risky operation')

      await monitor.measure('risky_operation', async () => {
        logger.warn('This might fail')
        throw new Error('Operation failed')
      }).catch((error) => {
        logger.error('Operation failed', { error: error.message })
      })

      logger.info('Error handled')
    })

    // 验证错误日志
    const errorLog = logs.find(log => log.level === LogLevel.ERROR)
    expect(errorLog).toBeDefined()
    expect(errorLog.trace_id).toBe('trace_error_test')
    expect(errorLog.metadata.error).toBe('Operation failed')

    // 验证监控记录了失败
    const stats = monitor.getStats('risky_operation')
    expect(stats).toBeDefined()
    expect(stats!.error_rate).toBe(1)
  })
})
