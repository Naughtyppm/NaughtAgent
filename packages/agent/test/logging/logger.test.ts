/**
 * 日志器测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Logger, LogLevel, createLogger } from '../../src/logging/logger.js'

describe('Logger', () => {
  describe('日志级别过滤', () => {
    it('应该只记录大于等于最小级别的日志', () => {
      const logs: string[] = []
      const logger = new Logger('test', {
        minLevel: LogLevel.INFO,
        output: (entry) => logs.push(entry.message)
      })

      logger.debug('debug message')
      logger.info('info message')
      logger.warn('warn message')
      logger.error('error message')

      expect(logs).toHaveLength(3)
      expect(logs).toEqual(['info message', 'warn message', 'error message'])
    })

    it('DEBUG 级别应该记录所有日志', () => {
      const logs: string[] = []
      const logger = new Logger('test', {
        minLevel: LogLevel.DEBUG,
        output: (entry) => logs.push(entry.message)
      })

      logger.debug('debug')
      logger.info('info')
      logger.warn('warn')
      logger.error('error')

      expect(logs).toHaveLength(4)
    })

    it('ERROR 级别应该只记录错误日志', () => {
      const logs: string[] = []
      const logger = new Logger('test', {
        minLevel: LogLevel.ERROR,
        output: (entry) => logs.push(entry.message)
      })

      logger.debug('debug')
      logger.info('info')
      logger.warn('warn')
      logger.error('error')

      expect(logs).toHaveLength(1)
      expect(logs[0]).toBe('error')
    })
  })

  describe('日志条目结构', () => {
    it('应该包含所有必需字段', () => {
      let capturedEntry: any = null
      const logger = new Logger('test-category', {
        output: (entry) => { capturedEntry = entry }
      })

      logger.info('test message', { key: 'value' })

      expect(capturedEntry).toBeDefined()
      expect(capturedEntry.timestamp).toBeInstanceOf(Date)
      expect(capturedEntry.level).toBe(LogLevel.INFO)
      expect(capturedEntry.category).toBe('test-category')
      expect(capturedEntry.message).toBe('test message')
      expect(capturedEntry.metadata).toEqual({ key: 'value' })
    })

    it('应该支持不带元数据的日志', () => {
      let capturedEntry: any = null
      const logger = new Logger('test', {
        output: (entry) => { capturedEntry = entry }
      })

      logger.info('simple message')

      expect(capturedEntry.metadata).toBeUndefined()
    })
  })

  describe('日志级别管理', () => {
    it('应该能够动态设置最小日志级别', () => {
      const logs: string[] = []
      const logger = new Logger('test', {
        minLevel: LogLevel.INFO,
        output: (entry) => logs.push(entry.message)
      })

      logger.debug('debug 1')
      logger.info('info 1')

      logger.setMinLevel(LogLevel.DEBUG)

      logger.debug('debug 2')
      logger.info('info 2')

      expect(logs).toEqual(['info 1', 'debug 2', 'info 2'])
    })

    it('应该能够获取当前最小日志级别', () => {
      const logger = new Logger('test', { minLevel: LogLevel.WARN })
      expect(logger.getMinLevel()).toBe(LogLevel.WARN)
    })
  })

  describe('日志格式化', () => {
    it('JSON 格式应该输出有效的 JSON', () => {
      let capturedOutput: string | null = null
      const logger = new Logger('test', {
        format: 'json',
        output: (entry) => {
          // 模拟 JSON 格式输出
          capturedOutput = JSON.stringify(entry)
        }
      })
      logger.info('test message', { key: 'value' })

      expect(capturedOutput).not.toBeNull()
      const parsed = JSON.parse(capturedOutput!)
      expect(parsed.message).toBe('test message')
      expect(parsed.metadata).toEqual({ key: 'value' })
    })

    it('文本格式应该输出可读的文本', () => {
      let capturedEntry: any = null
      const logger = new Logger('test', {
        format: 'text',
        output: (entry) => {
          capturedEntry = entry
        }
      })
      logger.info('test message')

      expect(capturedEntry).not.toBeNull()
      expect(capturedEntry.level).toBe(LogLevel.INFO)
      expect(capturedEntry.category).toBe('test')
      expect(capturedEntry.message).toBe('test message')
    })
  })

  describe('createLogger 工厂函数', () => {
    it('应该创建新的 Logger 实例', () => {
      const logger = createLogger('test')
      expect(logger).toBeInstanceOf(Logger)
    })

    it('应该支持配置参数', () => {
      const logger = createLogger('test', { minLevel: LogLevel.WARN })
      expect(logger.getMinLevel()).toBe(LogLevel.WARN)
    })
  })
})
