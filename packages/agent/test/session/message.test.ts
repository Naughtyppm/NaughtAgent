import { describe, it, expect } from 'vitest'
import {
  generateMessageId,
  createUserMessage,
  createAssistantMessage,
  createToolResult,
  getMessageText,
  getToolCalls,
  hasToolCalls,
  type Message,
  type TextBlock,
  type ToolUseBlock,
} from '../../src/session/message'

describe('Message', () => {
  describe('generateMessageId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateMessageId()
      const id2 = generateMessageId()

      expect(id1).not.toBe(id2)
    })

    it('should generate IDs with correct prefix', () => {
      const id = generateMessageId()

      expect(id).toMatch(/^msg_\d+_[a-z0-9]+$/)
    })
  })

  describe('createUserMessage', () => {
    it('should create a user message with text content', () => {
      const message = createUserMessage('Hello, world!')

      expect(message.role).toBe('user')
      expect(message.content).toHaveLength(1)
      expect(message.content[0]).toEqual({ type: 'text', text: 'Hello, world!' })
      expect(message.id).toMatch(/^msg_/)
      expect(message.timestamp).toBeGreaterThan(0)
    })
  })

  describe('createAssistantMessage', () => {
    it('should create an assistant message with content blocks', () => {
      const content: (TextBlock | ToolUseBlock)[] = [
        { type: 'text', text: 'Let me help you.' },
        { type: 'tool_use', id: 'call-1', name: 'read', input: { filePath: '/test' } },
      ]

      const message = createAssistantMessage(content)

      expect(message.role).toBe('assistant')
      expect(message.content).toHaveLength(2)
      expect(message.content[0].type).toBe('text')
      expect(message.content[1].type).toBe('tool_use')
    })
  })

  describe('createToolResult', () => {
    it('should create a tool result block', () => {
      const result = createToolResult('call-1', 'File content here')

      expect(result.type).toBe('tool_result')
      expect(result.tool_use_id).toBe('call-1')
      expect(result.content).toBe('File content here')
      expect(result.is_error).toBeUndefined()
    })

    it('should create an error tool result', () => {
      const result = createToolResult('call-1', 'Error: File not found', true)

      expect(result.is_error).toBe(true)
    })
  })

  describe('getMessageText', () => {
    it('should extract text from message', () => {
      const message: Message = {
        id: 'msg-1',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'tool_use', id: 'call-1', name: 'read', input: {} },
          { type: 'text', text: 'World' },
        ],
        timestamp: Date.now(),
      }

      const text = getMessageText(message)

      expect(text).toBe('Hello World')
    })

    it('should return empty string for message without text', () => {
      const message: Message = {
        id: 'msg-1',
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call-1', name: 'read', input: {} },
        ],
        timestamp: Date.now(),
      }

      const text = getMessageText(message)

      expect(text).toBe('')
    })
  })

  describe('getToolCalls', () => {
    it('should extract tool calls from message', () => {
      const message: Message = {
        id: 'msg-1',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me read that file.' },
          { type: 'tool_use', id: 'call-1', name: 'read', input: { filePath: '/a' } },
          { type: 'tool_use', id: 'call-2', name: 'write', input: { filePath: '/b' } },
        ],
        timestamp: Date.now(),
      }

      const toolCalls = getToolCalls(message)

      expect(toolCalls).toHaveLength(2)
      expect(toolCalls[0].name).toBe('read')
      expect(toolCalls[1].name).toBe('write')
    })

    it('should return empty array for message without tool calls', () => {
      const message = createUserMessage('Hello')

      const toolCalls = getToolCalls(message)

      expect(toolCalls).toHaveLength(0)
    })
  })

  describe('hasToolCalls', () => {
    it('should return true when message has tool calls', () => {
      const message: Message = {
        id: 'msg-1',
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call-1', name: 'read', input: {} },
        ],
        timestamp: Date.now(),
      }

      expect(hasToolCalls(message)).toBe(true)
    })

    it('should return false when message has no tool calls', () => {
      const message = createUserMessage('Hello')

      expect(hasToolCalls(message)).toBe(false)
    })
  })
})
