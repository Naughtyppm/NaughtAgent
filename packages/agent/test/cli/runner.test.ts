import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRunner, type RunnerEventHandlers } from '../../src/cli/runner'
import { ToolRegistry } from '../../src/tool/registry'

// Mock the agent loop to emit various events
let mockEvents: Array<{ type: string; [key: string]: unknown }> = []

vi.mock('../../src/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/agent')>()
  return {
    ...actual,
    createAgentLoop: vi.fn(() => ({
      run: async function* () {
        for (const event of mockEvents) {
          yield event
        }
      },
    })),
  }
})

// Mock the provider module
vi.mock('../../src/provider', () => ({
  Provider: {
    createAnthropicProvider: vi.fn(() => ({
      chat: vi.fn(async () => ({
        text: 'Hello! I am here to help.',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 20 },
      })),
      stream: vi.fn(),
    })),
    DEFAULT_MODEL: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      temperature: 0,
      maxTokens: 8192,
    },
  },
}))

describe('Runner', () => {
  beforeEach(() => {
    ToolRegistry.clear()
  })

  describe('createRunner', () => {
    it('should create a runner with default config', () => {
      const runner = createRunner({
        apiKey: 'test-key',
      })

      expect(runner).toBeDefined()
      expect(runner.run).toBeTypeOf('function')
      expect(runner.getSession).toBeTypeOf('function')
      expect(runner.resetSession).toBeTypeOf('function')
      expect(runner.getPermissions).toBeTypeOf('function')
    })

    it('should create runner with custom agent type', () => {
      const runner = createRunner({
        apiKey: 'test-key',
        agentType: 'plan',
      })

      const permissions = runner.getPermissions()
      expect(permissions.default).toBe('deny') // plan agent default
    })

    it('should create runner with custom cwd', () => {
      const runner = createRunner({
        apiKey: 'test-key',
        cwd: '/custom/path',
      })

      expect(runner).toBeDefined()
    })

    it('should register builtin tools', () => {
      createRunner({
        apiKey: 'test-key',
      })

      // Check that tools are registered
      expect(ToolRegistry.get('read')).toBeDefined()
      expect(ToolRegistry.get('write')).toBeDefined()
      expect(ToolRegistry.get('edit')).toBeDefined()
      expect(ToolRegistry.get('bash')).toBeDefined()
      expect(ToolRegistry.get('glob')).toBeDefined()
      expect(ToolRegistry.get('grep')).toBeDefined()
    })
  })

  describe('getPermissions', () => {
    it('should return build permissions by default', () => {
      const runner = createRunner({
        apiKey: 'test-key',
      })

      const permissions = runner.getPermissions()
      expect(permissions.default).toBe('ask')
    })

    it('should return plan permissions for plan agent', () => {
      const runner = createRunner({
        apiKey: 'test-key',
        agentType: 'plan',
      })

      const permissions = runner.getPermissions()
      expect(permissions.default).toBe('deny')
    })

    it('should return explore permissions for explore agent', () => {
      const runner = createRunner({
        apiKey: 'test-key',
        agentType: 'explore',
      })

      const permissions = runner.getPermissions()
      expect(permissions.default).toBe('deny')
    })
  })

  describe('session management', () => {
    it('should return null session initially', () => {
      const runner = createRunner({
        apiKey: 'test-key',
      })

      expect(runner.getSession()).toBeNull()
    })

    it('should reset session', () => {
      const runner = createRunner({
        apiKey: 'test-key',
      })

      // Reset should not throw even if no session
      expect(() => runner.resetSession()).not.toThrow()
    })
  })

  describe('run', () => {
    beforeEach(() => {
      mockEvents = [
        { type: 'text', content: 'Hello! I am here to help.' },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
      ]
    })

    it('should call event handlers', async () => {
      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
      })

      const textHandler = vi.fn()
      const doneHandler = vi.fn()

      await runner.run('Hello', {
        onText: textHandler,
        onDone: doneHandler,
      })

      expect(textHandler).toHaveBeenCalledWith('Hello! I am here to help.')
      expect(doneHandler).toHaveBeenCalledWith({ inputTokens: 10, outputTokens: 20 })
    })

    it('should create session on first run', async () => {
      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
      })

      expect(runner.getSession()).toBeNull()

      await runner.run('Hello', {})

      expect(runner.getSession()).not.toBeNull()
    })

    it('should reuse session on subsequent runs', async () => {
      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
      })

      await runner.run('First message', {})
      const session1 = runner.getSession()

      await runner.run('Second message', {})
      const session2 = runner.getSession()

      expect(session1?.id).toBe(session2?.id)
    })

    it('should create new session after reset', async () => {
      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
      })

      await runner.run('First message', {})
      const session1 = runner.getSession()

      runner.resetSession()
      expect(runner.getSession()).toBeNull()

      await runner.run('Second message', {})
      const session2 = runner.getSession()

      expect(session1?.id).not.toBe(session2?.id)
    })
  })

  describe('event handling', () => {
    beforeEach(() => {
      mockEvents = []
    })

    it('should handle text event', async () => {
      mockEvents = [
        { type: 'text', content: 'Hello from agent' },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
      ]

      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
      })

      const textHandler = vi.fn()
      await runner.run('Hello', { onText: textHandler })

      expect(textHandler).toHaveBeenCalledWith('Hello from agent')
    })

    it('should handle tool_start event for read tool', async () => {
      mockEvents = [
        { type: 'tool_start', id: 'tool-1', name: 'read', input: { filePath: '/test.txt' } },
        { type: 'tool_end', id: 'tool-1', result: { output: 'file content' }, isError: false },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
      ]

      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
      })

      const toolStartHandler = vi.fn()
      const permissionHandler = vi.fn()
      await runner.run('Read file', {
        onToolStart: toolStartHandler,
        onPermissionRequest: permissionHandler,
      })

      expect(toolStartHandler).toHaveBeenCalledWith('tool-1', 'read', { filePath: '/test.txt' })
    })

    it('should handle tool_start event for write tool', async () => {
      mockEvents = [
        { type: 'tool_start', id: 'tool-1', name: 'write', input: { file_path: '/output.txt', content: 'data' } },
        { type: 'tool_end', id: 'tool-1', result: { output: 'written' }, isError: false },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
      ]

      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
      })

      const toolStartHandler = vi.fn()
      await runner.run('Write file', { onToolStart: toolStartHandler })

      expect(toolStartHandler).toHaveBeenCalledWith('tool-1', 'write', { file_path: '/output.txt', content: 'data' })
    })

    it('should handle tool_start event for edit tool', async () => {
      mockEvents = [
        { type: 'tool_start', id: 'tool-1', name: 'edit', input: { filePath: '/edit.txt' } },
        { type: 'tool_end', id: 'tool-1', result: { output: 'edited' }, isError: false },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
      ]

      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
      })

      const toolStartHandler = vi.fn()
      await runner.run('Edit file', { onToolStart: toolStartHandler })

      expect(toolStartHandler).toHaveBeenCalledWith('tool-1', 'edit', { filePath: '/edit.txt' })
    })

    it('should handle tool_start event for bash tool', async () => {
      mockEvents = [
        { type: 'tool_start', id: 'tool-1', name: 'bash', input: { command: 'ls -la' } },
        { type: 'tool_end', id: 'tool-1', result: { output: 'file list' }, isError: false },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
      ]

      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
      })

      const toolStartHandler = vi.fn()
      await runner.run('Run command', { onToolStart: toolStartHandler })

      expect(toolStartHandler).toHaveBeenCalledWith('tool-1', 'bash', { command: 'ls -la' })
    })

    it('should handle tool_start event for glob tool', async () => {
      mockEvents = [
        { type: 'tool_start', id: 'tool-1', name: 'glob', input: { pattern: '**/*.ts' } },
        { type: 'tool_end', id: 'tool-1', result: { output: 'files' }, isError: false },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
      ]

      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
      })

      const toolStartHandler = vi.fn()
      await runner.run('Find files', { onToolStart: toolStartHandler })

      expect(toolStartHandler).toHaveBeenCalledWith('tool-1', 'glob', { pattern: '**/*.ts' })
    })

    it('should handle tool_start event for grep tool', async () => {
      mockEvents = [
        { type: 'tool_start', id: 'tool-1', name: 'grep', input: { pattern: 'TODO' } },
        { type: 'tool_end', id: 'tool-1', result: { output: 'matches' }, isError: false },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
      ]

      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
      })

      const toolStartHandler = vi.fn()
      await runner.run('Search', { onToolStart: toolStartHandler })

      expect(toolStartHandler).toHaveBeenCalledWith('tool-1', 'grep', { pattern: 'TODO' })
    })

    it('should handle tool_start event for unknown tool', async () => {
      mockEvents = [
        { type: 'tool_start', id: 'tool-1', name: 'unknown_tool', input: { foo: 'bar' } },
        { type: 'tool_end', id: 'tool-1', result: { output: 'result' }, isError: false },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
      ]

      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
      })

      const toolStartHandler = vi.fn()
      await runner.run('Unknown', { onToolStart: toolStartHandler })

      expect(toolStartHandler).toHaveBeenCalledWith('tool-1', 'unknown_tool', { foo: 'bar' })
    })

    it('should handle tool_end event', async () => {
      mockEvents = [
        { type: 'tool_start', id: 'tool-1', name: 'read', input: { filePath: '/test.txt' } },
        { type: 'tool_end', id: 'tool-1', result: { output: 'file content' }, isError: false },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
      ]

      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
      })

      const toolEndHandler = vi.fn()
      await runner.run('Read', { onToolEnd: toolEndHandler })

      expect(toolEndHandler).toHaveBeenCalledWith('tool-1', 'file content', false)
    })

    it('should handle tool_end event with error', async () => {
      mockEvents = [
        { type: 'tool_start', id: 'tool-1', name: 'read', input: { filePath: '/missing.txt' } },
        { type: 'tool_end', id: 'tool-1', result: { output: 'File not found' }, isError: true },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
      ]

      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
      })

      const toolEndHandler = vi.fn()
      await runner.run('Read', { onToolEnd: toolEndHandler })

      expect(toolEndHandler).toHaveBeenCalledWith('tool-1', 'File not found', true)
    })

    it('should handle error event', async () => {
      const testError = new Error('Something went wrong')
      mockEvents = [
        { type: 'error', error: testError },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
      ]

      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
      })

      const errorHandler = vi.fn()
      await runner.run('Fail', { onError: errorHandler })

      expect(errorHandler).toHaveBeenCalledWith(testError)
    })

    it('should handle done event', async () => {
      mockEvents = [
        { type: 'done', usage: { inputTokens: 100, outputTokens: 50 } },
      ]

      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
      })

      const doneHandler = vi.fn()
      await runner.run('Done', { onDone: doneHandler })

      expect(doneHandler).toHaveBeenCalledWith({ inputTokens: 100, outputTokens: 50 })
    })

    it('should call onConfirm when permission requires confirmation', async () => {
      mockEvents = [
        { type: 'tool_start', id: 'tool-1', name: 'write', input: { filePath: '/test.txt' } },
        { type: 'tool_end', id: 'tool-1', result: { output: 'written' }, isError: false },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
      ]

      const onConfirm = vi.fn().mockResolvedValue(true)
      const runner = createRunner({
        apiKey: 'test-key',
        onConfirm,
      })

      await runner.run('Write', {})

      expect(onConfirm).toHaveBeenCalled()
    })

    it('should not call onConfirm when autoConfirm is true', async () => {
      mockEvents = [
        { type: 'tool_start', id: 'tool-1', name: 'write', input: { filePath: '/test.txt' } },
        { type: 'tool_end', id: 'tool-1', result: { output: 'written' }, isError: false },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
      ]

      const onConfirm = vi.fn().mockResolvedValue(true)
      const runner = createRunner({
        apiKey: 'test-key',
        autoConfirm: true,
        onConfirm,
      })

      await runner.run('Write', {})

      expect(onConfirm).not.toHaveBeenCalled()
    })

    it('should deny by default when no onConfirm provided', async () => {
      mockEvents = [
        { type: 'tool_start', id: 'tool-1', name: 'write', input: { filePath: '/test.txt' } },
        { type: 'tool_end', id: 'tool-1', result: { output: 'written' }, isError: false },
        { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } },
      ]

      const runner = createRunner({
        apiKey: 'test-key',
        // no onConfirm, no autoConfirm
      })

      // Should not throw
      await expect(runner.run('Write', {})).resolves.not.toThrow()
    })
  })

  describe('custom permissions', () => {
    beforeEach(() => {
      mockEvents = []
    })

    it('should merge custom permissions with defaults', () => {
      const runner = createRunner({
        apiKey: 'test-key',
        permissions: {
          rules: [
            { type: 'read', action: 'deny', pattern: '**/secret/**' },
          ],
        },
      })

      const permissions = runner.getPermissions()
      // Custom rule should be first
      expect(permissions.rules[0]).toEqual({ type: 'read', action: 'deny', pattern: '**/secret/**' })
    })

    it('should use custom default action', () => {
      const runner = createRunner({
        apiKey: 'test-key',
        permissions: {
          default: 'deny',
        },
      })

      const permissions = runner.getPermissions()
      expect(permissions.default).toBe('deny')
    })
  })
})
