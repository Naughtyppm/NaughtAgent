/**
 * 错误类型测试
 * 
 * 测试 AgentError 类和 ErrorCode 枚举
 */

import { describe, it, expect } from 'vitest'
import { AgentError, ErrorCode } from '../../src/error/types.js'

describe('ErrorCode', () => {
  it('should have all required error codes', () => {
    // 网络错误（可恢复）
    expect(ErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR')
    expect(ErrorCode.TIMEOUT).toBe('TIMEOUT')
    expect(ErrorCode.RATE_LIMIT).toBe('RATE_LIMIT')
    
    // API 错误（部分可恢复）
    expect(ErrorCode.API_ERROR).toBe('API_ERROR')
    expect(ErrorCode.INVALID_REQUEST).toBe('INVALID_REQUEST')
    expect(ErrorCode.AUTHENTICATION_ERROR).toBe('AUTHENTICATION_ERROR')
    
    // 工具错误（可恢复）
    expect(ErrorCode.TOOL_EXECUTION_ERROR).toBe('TOOL_EXECUTION_ERROR')
    expect(ErrorCode.PERMISSION_DENIED).toBe('PERMISSION_DENIED')
    
    // 系统错误（不可恢复）
    expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR')
    expect(ErrorCode.CONFIGURATION_ERROR).toBe('CONFIGURATION_ERROR')
  })
})

describe('AgentError', () => {
  describe('constructor', () => {
    it('should create error with required fields', () => {
      const error = new AgentError(
        'Test error',
        ErrorCode.NETWORK_ERROR,
        true
      )

      expect(error.message).toBe('Test error')
      expect(error.code).toBe(ErrorCode.NETWORK_ERROR)
      expect(error.recoverable).toBe(true)
      expect(error.context).toBeUndefined()
      expect(error.name).toBe('AgentError')
    })

    it('should create error with context', () => {
      const context = { url: 'https://api.example.com', status: 500 }
      const error = new AgentError(
        'API request failed',
        ErrorCode.API_ERROR,
        true,
        context
      )

      expect(error.context).toEqual(context)
    })

    it('should maintain correct prototype chain', () => {
      const error = new AgentError(
        'Test error',
        ErrorCode.INTERNAL_ERROR,
        false
      )

      expect(error instanceof AgentError).toBe(true)
      expect(error instanceof Error).toBe(true)
    })

    it('should have stack trace', () => {
      const error = new AgentError(
        'Test error',
        ErrorCode.INTERNAL_ERROR,
        false
      )

      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('AgentError')
    })
  })

  describe('getRecoverySuggestion', () => {
    it('should return suggestion for RATE_LIMIT', () => {
      const error = new AgentError(
        'Rate limit exceeded',
        ErrorCode.RATE_LIMIT,
        true
      )

      const suggestion = error.getRecoverySuggestion()
      expect(suggestion).toContain('稍后重试')
      expect(suggestion).toContain('API 配额')
    })

    it('should return suggestion for PERMISSION_DENIED', () => {
      const error = new AgentError(
        'Permission denied',
        ErrorCode.PERMISSION_DENIED,
        true
      )

      const suggestion = error.getRecoverySuggestion()
      expect(suggestion).toContain('权限设置')
      expect(suggestion).toContain('手动批准')
    })

    it('should return suggestion for TOOL_EXECUTION_ERROR', () => {
      const error = new AgentError(
        'Tool execution failed',
        ErrorCode.TOOL_EXECUTION_ERROR,
        true
      )

      const suggestion = error.getRecoverySuggestion()
      expect(suggestion).toContain('工具执行失败')
      expect(suggestion).toContain('输入参数')
    })

    it('should return suggestion for NETWORK_ERROR', () => {
      const error = new AgentError(
        'Network error',
        ErrorCode.NETWORK_ERROR,
        true
      )

      const suggestion = error.getRecoverySuggestion()
      expect(suggestion).toContain('网络连接')
      expect(suggestion).toContain('重试')
    })

    it('should return suggestion for TIMEOUT', () => {
      const error = new AgentError(
        'Timeout',
        ErrorCode.TIMEOUT,
        true
      )

      const suggestion = error.getRecoverySuggestion()
      expect(suggestion).toContain('超时')
      expect(suggestion).toContain('重试')
    })

    it('should return suggestion for API_ERROR', () => {
      const error = new AgentError(
        'API error',
        ErrorCode.API_ERROR,
        true
      )

      const suggestion = error.getRecoverySuggestion()
      expect(suggestion).toContain('API')
      expect(suggestion).toContain('配置')
    })

    it('should return suggestion for INVALID_REQUEST', () => {
      const error = new AgentError(
        'Invalid request',
        ErrorCode.INVALID_REQUEST,
        false
      )

      const suggestion = error.getRecoverySuggestion()
      expect(suggestion).toContain('请求参数')
      expect(suggestion).toContain('输入参数')
    })

    it('should return suggestion for AUTHENTICATION_ERROR', () => {
      const error = new AgentError(
        'Authentication failed',
        ErrorCode.AUTHENTICATION_ERROR,
        false
      )

      const suggestion = error.getRecoverySuggestion()
      expect(suggestion).toContain('身份验证')
      expect(suggestion).toContain('API 密钥')
    })

    it('should return suggestion for INTERNAL_ERROR', () => {
      const error = new AgentError(
        'Internal error',
        ErrorCode.INTERNAL_ERROR,
        false
      )

      const suggestion = error.getRecoverySuggestion()
      expect(suggestion).toContain('内部错误')
      expect(suggestion).toContain('错误日志')
    })

    it('should return suggestion for CONFIGURATION_ERROR', () => {
      const error = new AgentError(
        'Configuration error',
        ErrorCode.CONFIGURATION_ERROR,
        false
      )

      const suggestion = error.getRecoverySuggestion()
      expect(suggestion).toContain('配置错误')
      expect(suggestion).toContain('配置文件')
    })

    it('should return default suggestion for unknown error code', () => {
      // 创建一个带有未知错误码的错误（通过类型断言）
      const error = new AgentError(
        'Unknown error',
        'UNKNOWN_CODE' as ErrorCode,
        false
      )

      const suggestion = error.getRecoverySuggestion()
      expect(suggestion).toContain('错误日志')
    })
  })

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const context = { url: 'https://api.example.com' }
      const error = new AgentError(
        'Test error',
        ErrorCode.NETWORK_ERROR,
        true,
        context
      )

      const json = error.toJSON()

      expect(json.name).toBe('AgentError')
      expect(json.message).toBe('Test error')
      expect(json.code).toBe(ErrorCode.NETWORK_ERROR)
      expect(json.recoverable).toBe(true)
      expect(json.context).toEqual(context)
      expect(json.stack).toBeDefined()
    })

    it('should serialize error without context', () => {
      const error = new AgentError(
        'Test error',
        ErrorCode.INTERNAL_ERROR,
        false
      )

      const json = error.toJSON()

      expect(json.context).toBeUndefined()
    })

    it('should be JSON.stringify compatible', () => {
      const error = new AgentError(
        'Test error',
        ErrorCode.API_ERROR,
        true,
        { status: 500 }
      )

      const jsonString = JSON.stringify(error)
      const parsed = JSON.parse(jsonString)

      expect(parsed.name).toBe('AgentError')
      expect(parsed.message).toBe('Test error')
      expect(parsed.code).toBe(ErrorCode.API_ERROR)
    })
  })

  describe('error scenarios', () => {
    it('should create recoverable network error', () => {
      const error = new AgentError(
        'Connection refused',
        ErrorCode.NETWORK_ERROR,
        true,
        { host: 'api.example.com', port: 443 }
      )

      expect(error.recoverable).toBe(true)
      expect(error.code).toBe(ErrorCode.NETWORK_ERROR)
    })

    it('should create non-recoverable configuration error', () => {
      const error = new AgentError(
        'Missing API key',
        ErrorCode.CONFIGURATION_ERROR,
        false,
        { configFile: '.env' }
      )

      expect(error.recoverable).toBe(false)
      expect(error.code).toBe(ErrorCode.CONFIGURATION_ERROR)
    })

    it('should create tool execution error with context', () => {
      const error = new AgentError(
        'Tool execution failed',
        ErrorCode.TOOL_EXECUTION_ERROR,
        true,
        { 
          tool: 'bash',
          command: 'invalid-command',
          exitCode: 127
        }
      )

      expect(error.recoverable).toBe(true)
      expect(error.context?.tool).toBe('bash')
      expect(error.context?.exitCode).toBe(127)
    })

    it('should create rate limit error', () => {
      const error = new AgentError(
        'Rate limit exceeded',
        ErrorCode.RATE_LIMIT,
        true,
        { 
          limit: 100,
          remaining: 0,
          resetAt: Date.now() + 60000
        }
      )

      expect(error.recoverable).toBe(true)
      expect(error.code).toBe(ErrorCode.RATE_LIMIT)
    })
  })
})
