import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAgentLoop } from '../../src/agent/loop'
import { getAgentDefinition } from '../../src/agent/agent'
import { createSession } from '../../src/session/session'
import { ToolRegistry } from '../../src/tool/registry'
import { Tool } from '../../src/tool/tool'
import { z } from 'zod'

// Mock provider
function createMockProvider(responses: Array<{
  text?: string
  toolCalls?: Array<{ id: string; name: string; args: unknown }>
  usage?: { inputTokens: number; outputTokens: number }
}>) {
  let callIndex = 0

  return {
    chat: vi.fn(async () => {
      const response = responses[callIndex] || responses[responses.length - 1]
      callIndex++
      return {
        text: response.text || '',
        toolCalls: response.toolCalls || [],
        usage: response.usage || { inputTokens: 10, outputTokens: 20 },
      }
    }),
    stream: vi.fn(),
  }
}

describe('AgentLoop', () => {
  beforeEach(() => {
    ToolRegistry.clear()

    // Register a simple test tool
    const testTool = Tool.define({
      id: 'test_tool',
      description: 'A test tool',
      parameters: z.object({
        message: z.string(),
      }),
      async execute(params) {
        return {
          title: 'Test Result',
          output: `Received: ${params.message}`,
        }
      },
    })
    ToolRegistry.register(testTool)
  })

  describe('createAgentLoop', () => {
    it('should create an agent loop', () => {
      const definition = getAgentDefinition('build')
      definition.tools = ['test_tool']

      const session = createSession({ cwd: '/test' })
      const provider = createMockProvider([{ text: 'Hello!' }])

      const loop = createAgentLoop({
        definition,
        session,
        provider,
        runConfig: {
          sessionId: session.id,
          cwd: '/test',
        },
      })

      expect(loop).toBeDefined()
      expect(loop.run).toBeTypeOf('function')
      expect(loop.abort).toBeTypeOf('function')
    })
  })

  describe('run', () => {
    it('should yield text events for simple response', async () => {
      const definition = getAgentDefinition('build')
      definition.tools = ['test_tool']

      const session = createSession({ cwd: '/test' })
      const provider = createMockProvider([{ text: 'Hello, I am here to help!' }])

      const loop = createAgentLoop({
        definition,
        session,
        provider,
        runConfig: {
          sessionId: session.id,
          cwd: '/test',
        },
      })

      const events = []
      for await (const event of loop.run('Hi there')) {
        events.push(event)
      }

      expect(events.some(e => e.type === 'text')).toBe(true)
      expect(events.some(e => e.type === 'done')).toBe(true)

      const textEvent = events.find(e => e.type === 'text')
      expect(textEvent?.content).toBe('Hello, I am here to help!')
    })

    it('should execute tool calls and continue loop', async () => {
      const definition = getAgentDefinition('build')
      definition.tools = ['test_tool']

      const session = createSession({ cwd: '/test' })
      const provider = createMockProvider([
        // First response: tool call
        {
          text: 'Let me use the tool',
          toolCalls: [{ id: 'call-1', name: 'test_tool', args: { message: 'hello' } }],
        },
        // Second response: final answer
        {
          text: 'Done!',
          toolCalls: [],
        },
      ])

      const loop = createAgentLoop({
        definition,
        session,
        provider,
        runConfig: {
          sessionId: session.id,
          cwd: '/test',
        },
      })

      const events = []
      for await (const event of loop.run('Use the tool')) {
        events.push(event)
      }

      // Should have tool_start and tool_end events
      expect(events.some(e => e.type === 'tool_start')).toBe(true)
      expect(events.some(e => e.type === 'tool_end')).toBe(true)

      const toolStart = events.find(e => e.type === 'tool_start')
      expect(toolStart?.name).toBe('test_tool')

      const toolEnd = events.find(e => e.type === 'tool_end')
      expect(toolEnd?.result.output).toContain('Received: hello')
    })

    it('should handle tool errors gracefully', async () => {
      // Register a tool that throws
      const errorTool = Tool.define({
        id: 'error_tool',
        description: 'A tool that errors',
        parameters: z.object({}),
        async execute() {
          throw new Error('Tool failed!')
        },
      })
      ToolRegistry.register(errorTool)

      const definition = getAgentDefinition('build')
      definition.tools = ['error_tool']

      const session = createSession({ cwd: '/test' })
      const provider = createMockProvider([
        {
          toolCalls: [{ id: 'call-1', name: 'error_tool', args: {} }],
        },
        { text: 'I see there was an error' },
      ])

      const loop = createAgentLoop({
        definition,
        session,
        provider,
        runConfig: {
          sessionId: session.id,
          cwd: '/test',
        },
      })

      const events = []
      for await (const event of loop.run('Use error tool')) {
        events.push(event)
      }

      const toolEnd = events.find(e => e.type === 'tool_end')
      expect(toolEnd?.isError).toBe(true)
      expect(toolEnd?.result.output).toContain('Tool failed!')
    })

    it('should update session messages', async () => {
      const definition = getAgentDefinition('build')
      definition.tools = ['test_tool']

      const session = createSession({ cwd: '/test' })
      const provider = createMockProvider([{ text: 'Response' }])

      const loop = createAgentLoop({
        definition,
        session,
        provider,
        runConfig: {
          sessionId: session.id,
          cwd: '/test',
        },
      })

      for await (const _ of loop.run('Hello')) {
        // consume events
      }

      // Session should have user message and assistant message
      expect(session.messages.length).toBeGreaterThanOrEqual(2)
      expect(session.messages[0].role).toBe('user')
      expect(session.messages[1].role).toBe('assistant')
    })

    it('should track token usage', async () => {
      const definition = getAgentDefinition('build')
      definition.tools = []

      const session = createSession({ cwd: '/test' })
      const provider = createMockProvider([
        { text: 'Response', usage: { inputTokens: 100, outputTokens: 50 } },
      ])

      const loop = createAgentLoop({
        definition,
        session,
        provider,
        runConfig: {
          sessionId: session.id,
          cwd: '/test',
        },
      })

      const events = []
      for await (const event of loop.run('Hello')) {
        events.push(event)
      }

      const doneEvent = events.find(e => e.type === 'done')
      expect(doneEvent?.usage.inputTokens).toBe(100)
      expect(doneEvent?.usage.outputTokens).toBe(50)
    })

    it('should respect maxSteps limit', async () => {
      const definition = getAgentDefinition('build')
      definition.tools = ['test_tool']
      definition.maxSteps = 2

      const session = createSession({ cwd: '/test' })
      // Provider always returns tool calls, creating infinite loop
      const provider = createMockProvider([
        { toolCalls: [{ id: 'call-1', name: 'test_tool', args: { message: 'loop' } }] },
      ])

      const loop = createAgentLoop({
        definition,
        session,
        provider,
        runConfig: {
          sessionId: session.id,
          cwd: '/test',
        },
      })

      const events = []
      for await (const event of loop.run('Loop forever')) {
        events.push(event)
      }

      // Should have error about max steps
      const errorEvent = events.find(e => e.type === 'error')
      expect(errorEvent?.error.message).toContain('maximum steps')
    })
  })

  describe('abort', () => {
    it('should have abort method', () => {
      const definition = getAgentDefinition('build')
      definition.tools = []

      const session = createSession({ cwd: '/test' })
      const provider = createMockProvider([{ text: 'Response' }])

      const loop = createAgentLoop({
        definition,
        session,
        provider,
        runConfig: {
          sessionId: session.id,
          cwd: '/test',
        },
      })

      expect(loop.abort).toBeTypeOf('function')
      // Calling abort should not throw
      expect(() => loop.abort()).not.toThrow()
    })
  })
})
