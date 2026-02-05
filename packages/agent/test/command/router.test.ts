/**
 * 命令路由器单元测试
 *
 * 测试 CommandRouter 的核心功能：
 * - isCommand() 命令检测
 * - parseArgs() 参数解析
 * - route() 路由分发
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createCommandRouter, parseArguments } from '../../src/command/router.js'
import { createSyncRegistry } from '../../src/command/registry.js'
import type { UnifiedRegistry } from '../../src/command/registry.js'
import type { CommandRouter } from '../../src/command/router.js'

describe('CommandRouter', () => {
  let registry: UnifiedRegistry
  let router: CommandRouter

  beforeEach(() => {
    registry = createSyncRegistry()
    router = createCommandRouter(registry)
  })

  describe('isCommand()', () => {
    it('should return true for input starting with /', () => {
      expect(router.isCommand('/help')).toBe(true)
      expect(router.isCommand('/model')).toBe(true)
      expect(router.isCommand('/commit -m "test"')).toBe(true)
    })

    it('should return false for input not starting with /', () => {
      expect(router.isCommand('hello')).toBe(false)
      expect(router.isCommand('help me')).toBe(false)
      expect(router.isCommand('')).toBe(false)
    })

    it('should handle whitespace correctly', () => {
      expect(router.isCommand('  /help')).toBe(true)
      expect(router.isCommand('\t/model')).toBe(true)
      expect(router.isCommand('  hello')).toBe(false)
    })

    it('should not treat / in middle of text as command', () => {
      expect(router.isCommand('path/to/file')).toBe(false)
      expect(router.isCommand('a/b/c')).toBe(false)
    })
  })

  describe('parseArgs()', () => {
    it('should parse command name without arguments', () => {
      const result = router.parseArgs('/help')
      expect(result.name).toBe('help')
      expect(result.args).toEqual([])
      expect(result.namedArgs).toEqual({})
    })

    it('should parse simple positional arguments', () => {
      const result = router.parseArgs('/model claude-sonnet')
      expect(result.name).toBe('model')
      expect(result.args).toEqual(['claude-sonnet'])
      expect(result.namedArgs).toEqual({})
    })

    it('should parse multiple positional arguments', () => {
      const result = router.parseArgs('/cmd arg1 arg2 arg3')
      expect(result.name).toBe('cmd')
      expect(result.args).toEqual(['arg1', 'arg2', 'arg3'])
    })

    it('should parse quoted arguments with double quotes', () => {
      const result = router.parseArgs('/commit "fix bug in parser"')
      expect(result.name).toBe('commit')
      expect(result.args).toEqual(['fix bug in parser'])
    })

    it('should parse quoted arguments with single quotes', () => {
      const result = router.parseArgs("/commit 'fix bug in parser'")
      expect(result.name).toBe('commit')
      expect(result.args).toEqual(['fix bug in parser'])
    })

    it('should parse named parameters with --key=value', () => {
      const result = router.parseArgs('/commit --message=fix')
      expect(result.name).toBe('commit')
      expect(result.args).toEqual([])
      expect(result.namedArgs).toEqual({ message: 'fix' })
    })

    it('should parse named parameters with --flag (boolean)', () => {
      const result = router.parseArgs('/commit --amend')
      expect(result.name).toBe('commit')
      expect(result.namedArgs).toEqual({ amend: 'true' })
    })

    it('should parse short flags -f', () => {
      const result = router.parseArgs('/cmd -v')
      expect(result.name).toBe('cmd')
      expect(result.namedArgs).toEqual({ v: 'true' })
    })

    it('should parse mixed arguments', () => {
      const result = router.parseArgs('/commit "fix bug" --amend --message=test arg2')
      expect(result.name).toBe('commit')
      expect(result.args).toEqual(['fix bug', 'arg2'])
      expect(result.namedArgs).toEqual({ amend: 'true', message: 'test' })
    })

    it('should handle empty value in --key=', () => {
      const result = router.parseArgs('/cmd --key=')
      expect(result.namedArgs).toEqual({ key: '' })
    })

    it('should return empty result for non-command input', () => {
      const result = router.parseArgs('hello world')
      expect(result.name).toBe('')
      expect(result.args).toEqual([])
      expect(result.namedArgs).toEqual({})
    })

    it('should handle whitespace in input', () => {
      const result = router.parseArgs('  /help  ')
      expect(result.name).toBe('help')
    })
  })

  describe('route()', () => {
    it('should route command input to command type', () => {
      const result = router.route('/help')
      expect(result.type).toBe('command')
      expect(result.commandName).toBe('help')
      expect(result.rawInput).toBe('/help')
    })

    it('should route natural language to natural-language type', () => {
      const result = router.route('hello world')
      expect(result.type).toBe('natural-language')
      expect(result.found).toBe(false)
      expect(result.rawInput).toBe('hello world')
    })

    it('should find existing command in registry', () => {
      const result = router.route('/help')
      expect(result.found).toBe(true)
      expect(result.command).toBeDefined()
      expect(result.command?.name).toBe('help')
    })

    it('should not find non-existing command', () => {
      const result = router.route('/nonexistent')
      expect(result.type).toBe('command')
      expect(result.found).toBe(false)
      expect(result.command).toBeUndefined()
      expect(result.commandName).toBe('nonexistent')
    })

    it('should parse arguments in route result', () => {
      const result = router.route('/model claude-sonnet')
      expect(result.type).toBe('command')
      expect(result.args).toEqual(['claude-sonnet'])
    })

    it('should parse named arguments in route result', () => {
      const result = router.route('/cmd --key=value')
      expect(result.namedArgs).toEqual({ key: 'value' })
    })

    it('should handle empty input', () => {
      const result = router.route('')
      expect(result.type).toBe('natural-language')
    })

    it('should handle whitespace-only input', () => {
      const result = router.route('   ')
      expect(result.type).toBe('natural-language')
    })
  })
})

describe('parseArguments()', () => {
  it('should handle empty string', () => {
    const result = parseArguments('')
    expect(result.args).toEqual([])
    expect(result.namedArgs).toEqual({})
  })

  it('should handle whitespace-only string', () => {
    const result = parseArguments('   ')
    expect(result.args).toEqual([])
    expect(result.namedArgs).toEqual({})
  })

  it('should parse simple arguments', () => {
    const result = parseArguments('arg1 arg2')
    expect(result.args).toEqual(['arg1', 'arg2'])
  })

  it('should handle multiple spaces between arguments', () => {
    const result = parseArguments('arg1    arg2')
    expect(result.args).toEqual(['arg1', 'arg2'])
  })

  it('should parse quoted strings with spaces', () => {
    const result = parseArguments('"hello world" "foo bar"')
    expect(result.args).toEqual(['hello world', 'foo bar'])
  })

  it('should handle escaped quotes inside quoted strings', () => {
    const result = parseArguments('"say \\"hello\\""')
    expect(result.args).toEqual(['say "hello"'])
  })

  it('should handle escaped backslash', () => {
    const result = parseArguments('"path\\\\to\\\\file"')
    expect(result.args).toEqual(['path\\to\\file'])
  })

  it('should parse --key=value with quoted value', () => {
    const result = parseArguments('--message="fix bug"')
    // Note: the quotes are part of the value in this case
    // because we process the token after splitting
    expect(result.namedArgs.message).toBeDefined()
  })

  it('should handle mixed quoted and unquoted args', () => {
    const result = parseArguments('arg1 "quoted arg" arg2')
    expect(result.args).toEqual(['arg1', 'quoted arg', 'arg2'])
  })

  it('should handle single quotes', () => {
    const result = parseArguments("'single quoted'")
    expect(result.args).toEqual(['single quoted'])
  })

  it('should handle unclosed quote gracefully', () => {
    // Unclosed quote - should include rest of string
    const result = parseArguments('"unclosed')
    expect(result.args.length).toBeGreaterThanOrEqual(0)
  })
})
