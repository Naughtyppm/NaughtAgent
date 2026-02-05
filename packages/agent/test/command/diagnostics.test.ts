/**
 * 错误诊断模块单元测试
 *
 * 测试 ErrorDiagnostics 类的错误分类、诊断和相似命令查找功能
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  ErrorDiagnostics,
  createErrorDiagnostics,
  levenshteinDistance,
  type DiagnosticContext,
  type CommandLookup,
} from '../../src/command/diagnostics.js'
import type { UnifiedCommand } from '../../src/command/types.js'

// ============================================================================
// 测试辅助
// ============================================================================

/**
 * 创建模拟的命令查找器
 */
function createMockLookup(commands: Partial<UnifiedCommand>[]): CommandLookup {
  const fullCommands: UnifiedCommand[] = commands.map((cmd, index) => ({
    name: cmd.name || `cmd${index}`,
    description: cmd.description || 'Test command',
    layer: cmd.layer || 'builtin',
    executionMode: cmd.executionMode || 'sync',
    source: cmd.source || 'builtin',
    parameters: cmd.parameters || [],
    aliases: cmd.aliases,
  }))

  return {
    getAll: () => fullCommands,
  }
}

// ============================================================================
// Levenshtein 距离测试
// ============================================================================

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0)
    expect(levenshteinDistance('', '')).toBe(0)
  })

  it('should return length of other string when one is empty', () => {
    expect(levenshteinDistance('', 'hello')).toBe(5)
    expect(levenshteinDistance('hello', '')).toBe(5)
  })

  it('should calculate correct distance for single character changes', () => {
    // 替换
    expect(levenshteinDistance('cat', 'bat')).toBe(1)
    // 插入
    expect(levenshteinDistance('cat', 'cats')).toBe(1)
    // 删除
    expect(levenshteinDistance('cats', 'cat')).toBe(1)
  })

  it('should calculate correct distance for multiple changes', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
    expect(levenshteinDistance('help', 'hepl')).toBe(2) // 交换需要2步
    expect(levenshteinDistance('model', 'modle')).toBe(2)
  })

  it('should be case sensitive', () => {
    expect(levenshteinDistance('Hello', 'hello')).toBe(1)
    expect(levenshteinDistance('HELP', 'help')).toBe(4)
  })
})

// ============================================================================
// ErrorDiagnostics 类测试
// ============================================================================

describe('ErrorDiagnostics', () => {
  let diagnostics: ErrorDiagnostics

  beforeEach(() => {
    diagnostics = new ErrorDiagnostics()
  })

  describe('diagnose', () => {
    describe('not_found errors', () => {
      it('should classify "command not found" as not_found', () => {
        const result = diagnostics.diagnose('Command not found: xyz')
        expect(result.errorType).toBe('not_found')
        expect(result.recoverable).toBe(true)
      })

      it('should classify "unknown command" as not_found', () => {
        const result = diagnostics.diagnose('Unknown command: test')
        expect(result.errorType).toBe('not_found')
      })

      it('should include command name in message when provided', () => {
        const result = diagnostics.diagnose('not found', { command: 'hepl' })
        expect(result.message).toContain('hepl')
      })

      it('should suggest using /help', () => {
        const result = diagnostics.diagnose('not found', { command: 'xyz' })
        expect(result.suggestions.some(s => s.includes('/help'))).toBe(true)
      })
    })

    describe('permission_denied errors', () => {
      it('should classify "permission denied" as permission_denied', () => {
        const result = diagnostics.diagnose('Permission denied')
        expect(result.errorType).toBe('permission_denied')
        expect(result.recoverable).toBe(true)
      })

      it('should classify "EACCES" as permission_denied', () => {
        const result = diagnostics.diagnose('EACCES: permission denied')
        expect(result.errorType).toBe('permission_denied')
      })

      it('should provide fix action for permission errors', () => {
        const result = diagnostics.diagnose('permission denied')
        expect(result.fixAction).toBeDefined()
        expect(result.fixAction?.command).toContain('chmod')
      })
    })

    describe('timeout errors', () => {
      it('should classify "timeout" as timeout', () => {
        const result = diagnostics.diagnose('Operation timed out')
        expect(result.errorType).toBe('timeout')
        expect(result.recoverable).toBe(true)
      })

      it('should classify "ETIMEDOUT" as timeout', () => {
        const result = diagnostics.diagnose('ETIMEDOUT: connection timed out')
        expect(result.errorType).toBe('timeout')
      })
    })

    describe('dependency_missing errors', () => {
      it('should classify "just: command not found" as dependency_missing', () => {
        const result = diagnostics.diagnose('just: command not found')
        expect(result.errorType).toBe('dependency_missing')
        expect(result.recoverable).toBe(true)
      })

      it('should classify "ENOENT" as dependency_missing', () => {
        const result = diagnostics.diagnose('ENOENT: no such file or directory')
        expect(result.errorType).toBe('dependency_missing')
      })

      it('should provide installation instructions for just', () => {
        const result = diagnostics.diagnose('just: command not found')
        expect(result.fixAction).toBeDefined()
        expect(result.fixAction?.description).toContain('just')
      })

      it('should detect just dependency for external layer', () => {
        const result = diagnostics.diagnose('ENOENT', { layer: 'external' })
        expect(result.suggestions.some(s => s.toLowerCase().includes('just'))).toBe(true)
      })
    })

    describe('syntax_error errors', () => {
      it('should classify "syntax error" as syntax_error', () => {
        const result = diagnostics.diagnose('Syntax error in command')
        expect(result.errorType).toBe('syntax_error')
        expect(result.recoverable).toBe(true)
      })

      it('should classify "invalid argument" as syntax_error', () => {
        const result = diagnostics.diagnose('Invalid argument: --foo')
        expect(result.errorType).toBe('syntax_error')
      })

      it('should suggest checking command usage', () => {
        const result = diagnostics.diagnose('missing argument', { command: 'model' })
        expect(result.suggestions.some(s => s.includes('/help'))).toBe(true)
      })
    })

    describe('runtime_error errors', () => {
      it('should classify non-zero exit code as runtime_error', () => {
        const result = diagnostics.diagnose('Command failed', { exitCode: 1 })
        expect(result.errorType).toBe('runtime_error')
        expect(result.recoverable).toBe(false)
      })

      it('should include stderr in suggestions', () => {
        const result = diagnostics.diagnose('failed', {
          exitCode: 1,
          stderr: 'Error: something went wrong',
        })
        expect(result.suggestions.some(s => s.includes('something went wrong'))).toBe(true)
      })

      it('should include exit code in suggestions', () => {
        const result = diagnostics.diagnose('failed', { exitCode: 127 })
        expect(result.suggestions.some(s => s.includes('127'))).toBe(true)
      })
    })

    describe('workflow_error errors', () => {
      it('should classify skill layer errors as workflow_error', () => {
        const result = diagnostics.diagnose('AI failed', { layer: 'skill' })
        expect(result.errorType).toBe('workflow_error')
        expect(result.recoverable).toBe(true)
      })

      it('should classify errors with workflowStep as workflow_error', () => {
        const result = diagnostics.diagnose('Step failed', {
          workflowStep: 'generate-commit-message',
        })
        expect(result.errorType).toBe('workflow_error')
      })

      it('should include workflow step in suggestions', () => {
        const result = diagnostics.diagnose('failed', {
          workflowStep: 'analyze-code',
        })
        expect(result.suggestions.some(s => s.includes('analyze-code'))).toBe(true)
      })
    })

    describe('unknown errors', () => {
      it('should classify unrecognized errors as unknown', () => {
        const result = diagnostics.diagnose('Something weird happened')
        expect(result.errorType).toBe('unknown')
        expect(result.recoverable).toBe(false)
      })

      it('should include error message in suggestions', () => {
        const result = diagnostics.diagnose('Unexpected error XYZ')
        expect(result.suggestions.some(s => s.includes('Unexpected error XYZ'))).toBe(true)
      })
    })

    describe('Error object handling', () => {
      it('should handle Error objects', () => {
        const error = new Error('Command not found')
        const result = diagnostics.diagnose(error)
        expect(result.errorType).toBe('not_found')
      })

      it('should extract message from Error objects', () => {
        const error = new Error('Permission denied')
        const result = diagnostics.diagnose(error)
        expect(result.errorType).toBe('permission_denied')
      })
    })
  })

  describe('findSimilar', () => {
    it('should find exact matches', () => {
      const lookup = createMockLookup([
        { name: 'help' },
        { name: 'clear' },
        { name: 'model' },
      ])

      const similar = diagnostics.findSimilar('help', lookup)
      expect(similar).toContain('help')
    })

    it('should find similar commands within edit distance', () => {
      const lookup = createMockLookup([
        { name: 'help' },
        { name: 'clear' },
        { name: 'model' },
      ])

      // 'hepl' is 2 edits from 'help'
      const similar = diagnostics.findSimilar('hepl', lookup)
      expect(similar).toContain('help')
    })

    it('should not find commands beyond max edit distance', () => {
      const lookup = createMockLookup([
        { name: 'help' },
        { name: 'configuration' },
      ])

      // 'xyz' is too far from any command
      const similar = diagnostics.findSimilar('xyz', lookup)
      expect(similar).not.toContain('configuration')
    })

    it('should sort results by edit distance', () => {
      const lookup = createMockLookup([
        { name: 'model' },
        { name: 'mode' },
        { name: 'modem' },
      ])

      const similar = diagnostics.findSimilar('mode', lookup)
      // 'mode' should be first (exact match)
      expect(similar[0]).toBe('mode')
    })

    it('should find commands by alias', () => {
      const lookup = createMockLookup([
        { name: 'help', aliases: ['h', '?'] },
        { name: 'clear', aliases: ['cls'] },
      ])

      const similar = diagnostics.findSimilar('cls', lookup)
      expect(similar).toContain('clear')
    })

    it('should be case insensitive', () => {
      const lookup = createMockLookup([
        { name: 'Help' },
        { name: 'CLEAR' },
      ])

      const similar = diagnostics.findSimilar('help', lookup)
      expect(similar).toContain('Help')
    })

    it('should return empty array when no similar commands found', () => {
      const lookup = createMockLookup([
        { name: 'help' },
        { name: 'clear' },
      ])

      const similar = diagnostics.findSimilar('zzzzzzzzz', lookup)
      expect(similar).toHaveLength(0)
    })

    it('should not duplicate commands found by both name and alias', () => {
      const lookup = createMockLookup([
        { name: 'help', aliases: ['hlp'] },
      ])

      const similar = diagnostics.findSimilar('hlp', lookup)
      // Should only contain 'help' once
      expect(similar.filter(s => s === 'help')).toHaveLength(1)
    })

    it('should respect custom max edit distance', () => {
      const strictDiagnostics = new ErrorDiagnostics(1)
      const lookup = createMockLookup([
        { name: 'help' },
        { name: 'clear' },
      ])

      // 'hepl' is 2 edits from 'help', should not match with maxEditDistance=1
      const similar = strictDiagnostics.findSimilar('hepl', lookup)
      expect(similar).not.toContain('help')
    })
  })
})

// ============================================================================
// 工厂函数测试
// ============================================================================

describe('createErrorDiagnostics', () => {
  it('should create ErrorDiagnostics instance', () => {
    const diagnostics = createErrorDiagnostics()
    expect(diagnostics).toBeInstanceOf(ErrorDiagnostics)
  })

  it('should accept custom max edit distance', () => {
    const diagnostics = createErrorDiagnostics(5)
    const lookup = createMockLookup([
      { name: 'configuration' },
    ])

    // 'config' is 7 edits from 'configuration', but with maxEditDistance=5 it won't match
    // Let's use a closer example
    const similar = diagnostics.findSimilar('confg', lookup)
    // 'confg' is 8 edits from 'configuration', won't match even with 5
    expect(similar).toHaveLength(0)
  })
})

// ============================================================================
// DiagnosticResult 结构测试
// ============================================================================

describe('DiagnosticResult structure', () => {
  let diagnostics: ErrorDiagnostics

  beforeEach(() => {
    diagnostics = new ErrorDiagnostics()
  })

  it('should always have required fields', () => {
    const result = diagnostics.diagnose('any error')

    expect(result).toHaveProperty('errorType')
    expect(result).toHaveProperty('message')
    expect(result).toHaveProperty('suggestions')
    expect(result).toHaveProperty('recoverable')
    expect(Array.isArray(result.suggestions)).toBe(true)
    expect(typeof result.message).toBe('string')
    expect(result.message.length).toBeGreaterThan(0)
  })

  it('should have non-empty suggestions array', () => {
    const result = diagnostics.diagnose('some error')
    expect(result.suggestions.length).toBeGreaterThan(0)
  })

  it('should have valid errorType', () => {
    const validTypes = [
      'not_found',
      'permission_denied',
      'timeout',
      'dependency_missing',
      'syntax_error',
      'runtime_error',
      'workflow_error',
      'unknown',
    ]

    const result = diagnostics.diagnose('error')
    expect(validTypes).toContain(result.errorType)
  })
})
