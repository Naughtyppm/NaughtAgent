import { describe, it, expect, vi } from 'vitest'
import { Provider } from '../../src/provider/provider'

// Mock the AI SDK modules
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn(() => 'mocked-model')),
}))

vi.mock('ai', () => ({
  streamText: vi.fn(),
  generateText: vi.fn(),
}))

describe('Provider', () => {
  describe('ModelConfig', () => {
    it('should have DEFAULT_MODEL with correct values', () => {
      expect(Provider.DEFAULT_MODEL).toEqual({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        temperature: 0,
        maxTokens: 8192,
      })
    })

    it('should have FAST_MODEL with correct values', () => {
      expect(Provider.FAST_MODEL).toEqual({
        provider: 'anthropic',
        model: 'claude-haiku-4-20250514',
        temperature: 0,
        maxTokens: 4096,
      })
    })
  })

  describe('createAnthropicProvider', () => {
    it('should create a provider with required config', () => {
      const provider = Provider.createAnthropicProvider({
        apiKey: 'test-api-key',
      })

      expect(provider).toBeDefined()
      expect(provider.chat).toBeTypeOf('function')
      expect(provider.stream).toBeTypeOf('function')
    })

    it('should create a provider with optional baseURL', () => {
      const provider = Provider.createAnthropicProvider({
        apiKey: 'test-api-key',
        baseURL: 'https://custom.api.com',
      })

      expect(provider).toBeDefined()
    })
  })

  describe('Type definitions', () => {
    it('should define TokenUsage interface correctly', () => {
      const usage: Provider.TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
      }

      expect(usage.inputTokens).toBe(100)
      expect(usage.outputTokens).toBe(50)
    })

    it('should define Message interface correctly', () => {
      const userMessage: Provider.Message = {
        role: 'user',
        content: 'Hello',
      }

      const assistantMessage: Provider.Message = {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi there' }],
      }

      expect(userMessage.role).toBe('user')
      expect(assistantMessage.role).toBe('assistant')
    })

    it('should define ChatResult interface correctly', () => {
      const result: Provider.ChatResult = {
        text: 'Response text',
        toolCalls: [
          { id: 'call-1', name: 'read', args: { filePath: '/test' } },
        ],
        usage: { inputTokens: 10, outputTokens: 20 },
      }

      expect(result.text).toBe('Response text')
      expect(result.toolCalls).toHaveLength(1)
      expect(result.usage.inputTokens).toBe(10)
    })

    it('should define StreamEvent types correctly', () => {
      const textEvent: Provider.StreamEvent = { type: 'text', text: 'Hello' }
      const toolCallEvent: Provider.StreamEvent = {
        type: 'tool_call',
        id: 'call-1',
        name: 'read',
        args: {},
      }
      const endEvent: Provider.StreamEvent = {
        type: 'message_end',
        usage: { inputTokens: 10, outputTokens: 20 },
      }
      const errorEvent: Provider.StreamEvent = {
        type: 'error',
        error: new Error('test'),
      }

      expect(textEvent.type).toBe('text')
      expect(toolCallEvent.type).toBe('tool_call')
      expect(endEvent.type).toBe('message_end')
      expect(errorEvent.type).toBe('error')
    })
  })
})
