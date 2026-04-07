/**
 * 日志系统
 *
 * 提供结构化日志记录功能，支持多级别日志、元数据和 TraceId 追踪
 */

import { getCurrentTraceId } from './trace.js'
import { appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * 日志条目
 */
export interface LogEntry {
  timestamp: Date
  level: LogLevel
  category: string
  message: string
  metadata?: Record<string, unknown>
  trace_id?: string
}

/**
 * 日志器配置
 */
export interface LoggerConfig {
  minLevel?: LogLevel
  format?: 'json' | 'text'
  output?: (entry: LogEntry) => void
}

/**
 * 日志器
 * 
 * 提供分类的结构化日志记录，支持日志级别过滤和 TraceId 追踪
 * 
 * @example
 * ```typescript
 * const logger = new Logger('agent')
 * logger.info('Agent started', { version: '1.0.0' })
 * logger.error('Failed to execute tool', { tool: 'read', error: err })
 * ```
 */
export class Logger {
  private minLevel: LogLevel
  private format: 'json' | 'text'
  private output: (entry: LogEntry) => void

  // ─── 全局文件日志 transport ───
  private static fileLogPath: string | null = null
  private static fileLogBuffer: string[] = []
  private static flushTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 启用全局文件日志：所有 Logger 实例的日志同时写入文件
   * @param dir 日志目录（自动创建），文件名按日期生成
   */
  static enableFileLog(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const date = new Date().toISOString().slice(0, 10)
    const pid = process.pid
    Logger.fileLogPath = join(dir, `${date}-${pid}.log`)
  }

  /** 关闭文件日志 */
  static disableFileLog(): void {
    Logger.flush()
    Logger.fileLogPath = null
  }

  /** 获取当前日志文件路径 */
  static getFileLogPath(): string | null {
    return Logger.fileLogPath
  }

  /** 立即刷新缓冲区到文件 */
  private static flush(): void {
    if (Logger.fileLogBuffer.length === 0 || !Logger.fileLogPath) return
    try {
      appendFileSync(Logger.fileLogPath, Logger.fileLogBuffer.join(''))
    } catch { /* 日志写入失败不影响主流程 */ }
    Logger.fileLogBuffer = []
    Logger.flushTimer = null
  }

  /** 写入文件日志（异步批量：50ms 或 20 条一刷） */
  private static writeToFile(line: string): void {
    if (!Logger.fileLogPath) return
    Logger.fileLogBuffer.push(line)
    if (Logger.fileLogBuffer.length >= 20) {
      Logger.flush()
    } else if (!Logger.flushTimer) {
      Logger.flushTimer = setTimeout(() => Logger.flush(), 50)
    }
  }

  constructor(
    private category: string,
    config: LoggerConfig = {}
  ) {
    this.minLevel = config.minLevel || LogLevel.INFO
    this.format = config.format || 'text'
    this.output = config.output || this.defaultOutput.bind(this)
  }

  /**
   * 记录 DEBUG 级别日志
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, metadata)
  }

  /**
   * 记录 INFO 级别日志
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, metadata)
  }

  /**
   * 记录 WARN 级别日志
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, metadata)
  }

  /**
   * 记录 ERROR 级别日志
   */
  error(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, metadata)
  }

  /**
   * 设置最小日志级别
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level
  }

  /**
   * 获取当前最小日志级别
   */
  getMinLevel(): LogLevel {
    return this.minLevel
  }

  /**
   * 记录日志
   */
  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.shouldLog(level)) return

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category: this.category,
      message,
      metadata,
      trace_id: getCurrentTraceId()
    }

    this.output(entry)

    // 全局文件 transport（所有实例共享）
    if (Logger.fileLogPath) {
      const time = entry.timestamp.toISOString()
      const levelTag = level.toUpperCase().padEnd(5)
      const meta = metadata ? ` ${JSON.stringify(metadata)}` : ''
      Logger.writeToFile(`${time} ${levelTag} [${this.category}] ${message}${meta}\n`)
    }
  }

  /**
   * 判断是否应该记录该级别的日志
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
    return levels.indexOf(level) >= levels.indexOf(this.minLevel)
  }

  /**
   * 默认输出函数
   * 输出到 stderr，避免与用户输出混淆
   */
  private defaultOutput(entry: LogEntry): void {
    // QUIET=1 关闭所有非报错日志
    if (process.env.QUIET && entry.level !== LogLevel.ERROR) return

    // DEBUG 级别需要 DEBUG=1 环境变量
    if (entry.level === LogLevel.DEBUG && !process.env.DEBUG) return

    if (this.format === 'json') {
      console.error(JSON.stringify(entry))
    } else {
      // 简洁的时间格式 HH:MM:SS
      const time = entry.timestamp.toTimeString().slice(0, 8)

      // 级别标记
      const levelMarks: Record<string, string> = {
        debug: 'DBG',
        info: 'INF',
        warn: 'WRN',
        error: 'ERR'
      }
      const level = levelMarks[entry.level] || entry.level.toUpperCase()

      // 简化 metadata 输出
      let metaStr = ''
      if (entry.metadata) {
        const parts: string[] = []
        for (const [key, value] of Object.entries(entry.metadata)) {
          // 跳过 traceId（太长）
          if (key === 'traceId') continue
          // 简化值的显示
          const v = typeof value === 'string' ? value : JSON.stringify(value)
          parts.push(`${key}=${v}`)
        }
        if (parts.length > 0) {
          metaStr = ` (${parts.join(', ')})`
        }
      }

      console.error(`[${time}] ${level} [${entry.category}] ${entry.message}${metaStr}`)
    }
  }
}

/**
 * 创建日志器
 */
export function createLogger(category: string, config?: LoggerConfig): Logger {
  return new Logger(category, config)
}
