/**
 * 性能监控系统
 * 
 * 提供操作性能监控、统计数据收集和分析功能
 */

/**
 * 性能指标
 */
interface Metric {
  count: number
  total_duration: number
  success_count: number
  error_count: number
}

/**
 * 操作统计数据
 */
export interface OperationStats {
  operation: string
  count: number
  avg_duration: number
  success_rate: number
  error_rate: number
}

/**
 * 性能监控器
 * 
 * 记录和分析操作的性能指标，包括执行次数、耗时、成功率等
 * 
 * @example
 * ```typescript
 * const monitor = new PerformanceMonitor()
 * 
 * // 测量异步操作
 * const result = await monitor.measure('api_call', async () => {
 *   return await fetch('/api/data')
 * })
 * 
 * // 获取统计数据
 * const stats = monitor.getStats('api_call')
 * console.log(`平均耗时: ${stats.avg_duration}ms`)
 * console.log(`成功率: ${stats.success_rate * 100}%`)
 * ```
 */
export class PerformanceMonitor {
  private metrics = new Map<string, Metric>()

  /**
   * 测量操作性能
   * 
   * @param operation 操作名称
   * @param fn 要测量的函数
   * @returns 函数执行结果
   */
  async measure<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now()

    try {
      const result = await fn()
      const duration = Date.now() - start

      this.record(operation, { duration, success: true })
      return result
    } catch (error) {
      const duration = Date.now() - start
      this.record(operation, { duration, success: false })
      throw error
    }
  }

  /**
   * 测量同步操作性能
   * 
   * @param operation 操作名称
   * @param fn 要测量的函数
   * @returns 函数执行结果
   */
  measureSync<T>(
    operation: string,
    fn: () => T
  ): T {
    const start = Date.now()

    try {
      const result = fn()
      const duration = Date.now() - start

      this.record(operation, { duration, success: true })
      return result
    } catch (error) {
      const duration = Date.now() - start
      this.record(operation, { duration, success: false })
      throw error
    }
  }

  /**
   * 获取操作的统计数据
   * 
   * @param operation 操作名称
   * @returns 统计数据，如果操作不存在则返回 null
   */
  getStats(operation: string): OperationStats | null {
    const metric = this.metrics.get(operation)
    if (!metric) return null

    return {
      operation,
      count: metric.count,
      avg_duration: metric.total_duration / metric.count,
      success_rate: metric.success_count / metric.count,
      error_rate: metric.error_count / metric.count
    }
  }

  /**
   * 获取所有操作的统计数据
   * 
   * @returns 所有操作的统计数据数组
   */
  getAllStats(): OperationStats[] {
    const stats: OperationStats[] = []
    
    for (const operation of this.metrics.keys()) {
      const stat = this.getStats(operation)
      if (stat) {
        stats.push(stat)
      }
    }

    return stats
  }

  /**
   * 重置指定操作的统计数据
   * 
   * @param operation 操作名称
   */
  reset(operation: string): void {
    this.metrics.delete(operation)
  }

  /**
   * 重置所有统计数据
   */
  resetAll(): void {
    this.metrics.clear()
  }

  /**
   * 记录操作数据
   */
  private record(operation: string, data: { duration: number; success: boolean }): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, {
        count: 0,
        total_duration: 0,
        success_count: 0,
        error_count: 0
      })
    }

    const metric = this.metrics.get(operation)!
    metric.count++
    metric.total_duration += data.duration

    if (data.success) {
      metric.success_count++
    } else {
      metric.error_count++
    }
  }
}

/**
 * 全局性能监控器实例
 */
export const globalMonitor = new PerformanceMonitor()
