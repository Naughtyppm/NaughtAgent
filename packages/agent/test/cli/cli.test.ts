import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseArgs, createOutputHandlers } from '../../src/cli/cli'

describe('CLI', () => {
  describe('parseArgs', () => {
    it('should parse simple message', () => {
      const args = parseArgs(['hello', 'world'])

      expect(args.message).toBe('hello world')
      expect(args.agent).toBe('build')
      expect(args.autoConfirm).toBe(false)
    })

    it('should parse --help flag', () => {
      const args = parseArgs(['--help'])

      expect(args.help).toBe(true)
    })

    it('should parse -h flag', () => {
      const args = parseArgs(['-h'])

      expect(args.help).toBe(true)
    })

    it('should parse --version flag', () => {
      const args = parseArgs(['--version'])

      expect(args.version).toBe(true)
    })

    it('should parse -v flag', () => {
      const args = parseArgs(['-v'])

      expect(args.version).toBe(true)
    })

    it('should parse --agent option', () => {
      const args = parseArgs(['--agent', 'plan', 'analyze', 'code'])

      expect(args.agent).toBe('plan')
      expect(args.message).toBe('analyze code')
    })

    it('should parse -a option', () => {
      const args = parseArgs(['-a', 'explore', 'find', 'files'])

      expect(args.agent).toBe('explore')
      expect(args.message).toBe('find files')
    })

    it('should parse --cwd option', () => {
      const args = parseArgs(['--cwd', '/custom/path', 'hello'])

      expect(args.cwd).toBe('/custom/path')
    })

    it('should parse -d option', () => {
      const args = parseArgs(['-d', '/another/path', 'hello'])

      expect(args.cwd).toBe('/another/path')
    })

    it('should parse --yes flag', () => {
      const args = parseArgs(['--yes', 'do', 'something'])

      expect(args.autoConfirm).toBe(true)
      expect(args.message).toBe('do something')
    })

    it('should parse -y flag', () => {
      const args = parseArgs(['-y', 'do', 'something'])

      expect(args.autoConfirm).toBe(true)
    })

    it('should handle mixed options and message', () => {
      const args = parseArgs(['-a', 'build', '-y', 'create', 'a', 'file'])

      expect(args.agent).toBe('build')
      expect(args.autoConfirm).toBe(true)
      expect(args.message).toBe('create a file')
    })

    it('should ignore invalid agent type', () => {
      const args = parseArgs(['--agent', 'invalid', 'hello'])

      expect(args.agent).toBe('build') // default
    })

    it('should handle empty args', () => {
      const args = parseArgs([])

      expect(args.message).toBe('')
      expect(args.agent).toBe('build')
    })

    it('should use default cwd when -d has no value', () => {
      const args = parseArgs(['-d'])

      expect(args.cwd).toBe(process.cwd())
    })
  })

  describe('createOutputHandlers', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })

    it('should create handlers object', () => {
      const handlers = createOutputHandlers()

      expect(handlers.onText).toBeTypeOf('function')
      expect(handlers.onToolStart).toBeTypeOf('function')
      expect(handlers.onToolEnd).toBeTypeOf('function')
      expect(handlers.onError).toBeTypeOf('function')
      expect(handlers.onDone).toBeTypeOf('function')
      expect(handlers.onPermissionRequest).toBeTypeOf('function')
    })

    it('onText should log content', () => {
      const handlers = createOutputHandlers()

      handlers.onText!('Hello world')

      expect(consoleSpy).toHaveBeenCalledWith('\nHello world')
    })

    it('onToolStart should log tool name and input', () => {
      const handlers = createOutputHandlers()

      handlers.onToolStart!('tool-1', 'read', { filePath: '/test.txt' })

      expect(consoleSpy).toHaveBeenCalled()
      const call = consoleSpy.mock.calls[0][0]
      expect(call).toContain('[read]')
    })

    it('onToolStart should handle string input', () => {
      const handlers = createOutputHandlers()

      handlers.onToolStart!('tool-1', 'bash', 'ls -la')

      expect(consoleSpy).toHaveBeenCalled()
      const call = consoleSpy.mock.calls[0][0]
      expect(call).toContain('[bash]')
      expect(call).toContain('ls -la')
    })

    it('onToolEnd should log success result', () => {
      const handlers = createOutputHandlers()

      handlers.onToolEnd!('tool-1', 'File content here', false)

      expect(consoleSpy).toHaveBeenCalled()
      const call = consoleSpy.mock.calls[0][0]
      expect(call).toContain('✅')
      expect(call).toContain('File content here')
    })

    it('onToolEnd should log error result', () => {
      const handlers = createOutputHandlers()

      handlers.onToolEnd!('tool-1', 'File not found', true)

      expect(consoleSpy).toHaveBeenCalled()
      const call = consoleSpy.mock.calls[0][0]
      expect(call).toContain('❌')
      expect(call).toContain('File not found')
    })

    it('onToolEnd should truncate long output', () => {
      const handlers = createOutputHandlers()
      const longOutput = 'x'.repeat(300)

      handlers.onToolEnd!('tool-1', longOutput, false)

      expect(consoleSpy).toHaveBeenCalled()
      const call = consoleSpy.mock.calls[0][0]
      expect(call).toContain('...')
    })

    it('onError should log error message', () => {
      const handlers = createOutputHandlers()

      handlers.onError!(new Error('Something went wrong'))

      expect(consoleErrorSpy).toHaveBeenCalled()
      const call = consoleErrorSpy.mock.calls[0][0]
      expect(call).toContain('Something went wrong')
    })

    it('onDone should log token usage', () => {
      const handlers = createOutputHandlers()

      handlers.onDone!({ inputTokens: 100, outputTokens: 50 })

      expect(consoleSpy).toHaveBeenCalled()
      const call = consoleSpy.mock.calls[0][0]
      expect(call).toContain('100')
      expect(call).toContain('50')
    })

    it('onPermissionRequest should not throw', () => {
      const handlers = createOutputHandlers()

      expect(() => {
        handlers.onPermissionRequest!({
          type: 'read',
          resource: '/test.txt',
          description: 'Read file',
        })
      }).not.toThrow()
    })
  })
})
