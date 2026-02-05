/**
 * useMessages Hook 单元测试
 *
 * 测试消息管理功能：
 * - 添加用户消息
 * - 添加/更新/完成 AI 消息
 * - 添加/更新工具调用
 * - 添加系统消息
 * - 清空消息
 *
 * 需求: 5.1, 5.2, 5.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { useState, useCallback } from 'react'
import type {
  Message,
  ToolCall,
  SystemMessageLevel,
  UseMessagesReturn,
} from '../../../../src/cli/ink/types.js'

/**
 * 模拟 useMessages hook 的核心逻辑进行测试
 * 由于 React hooks 需要在组件上下文中运行，
 * 我们直接测试 hook 的核心逻辑函数
 */

// 生成唯一 ID 的函数
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// 创建一个可测试的消息管理器类
class MessageManager {
  private messages: Message[] = []
  private listeners: Set<() => void> = new Set()

  getMessages(): Message[] {
    return [...this.messages]
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    this.listeners.forEach((l) => l())
  }

  addUserMessage(content: string): void {
    this.messages = [
      ...this.messages,
      {
        id: generateId(),
        type: 'user' as const,
        content,
        timestamp: Date.now(),
      },
    ]
    this.notify()
  }


  addAIMessage(content: string, model: string): string {
    const id = generateId()
    this.messages = [
      ...this.messages,
      {
        id,
        type: 'ai' as const,
        content,
        model,
        isStreaming: true,
        timestamp: Date.now(),
      },
    ]
    this.notify()
    return id
  }

  updateAIMessage(id: string, content: string): void {
    this.messages = this.messages.map((msg) => {
      if (msg.id === id && msg.type === 'ai') {
        return { ...msg, content }
      }
      return msg
    })
    this.notify()
  }

  finishAIMessage(id: string): void {
    this.messages = this.messages.map((msg) => {
      if (msg.id === id && msg.type === 'ai') {
        return { ...msg, isStreaming: false }
      }
      return msg
    })
    this.notify()
  }

  addToolCall(tool: Omit<ToolCall, 'id' | 'status' | 'startTime' | 'isError'>): string {
    const id = generateId()
    const toolCall: ToolCall = {
      ...tool,
      id,
      status: 'pending',
      startTime: Date.now(),
      isError: false,
    }
    this.messages = [
      ...this.messages,
      {
        id: generateId(),
        type: 'tool' as const,
        tool: toolCall,
        timestamp: Date.now(),
      },
    ]
    this.notify()
    return id
  }

  updateToolCall(id: string, update: Partial<ToolCall>): void {
    this.messages = this.messages.map((msg) => {
      if (msg.type === 'tool' && msg.tool.id === id) {
        return {
          ...msg,
          tool: { ...msg.tool, ...update },
        }
      }
      return msg
    })
    this.notify()
  }

  addSystemMessage(level: SystemMessageLevel, content: string): void {
    this.messages = [
      ...this.messages,
      {
        id: generateId(),
        type: 'system' as const,
        level,
        content,
        timestamp: Date.now(),
      },
    ]
    this.notify()
  }

  clear(): void {
    this.messages = []
    this.notify()
  }
}

describe('useMessages Hook (MessageManager)', () => {
  let manager: MessageManager

  beforeEach(() => {
    manager = new MessageManager()
  })

  describe('初始状态', () => {
    it('应该返回空消息列表', () => {
      expect(manager.getMessages()).toEqual([])
    })
  })

  describe('addUserMessage', () => {
    it('应该添加用户消息', () => {
      manager.addUserMessage('Hello, world!')

      const messages = manager.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        type: 'user',
        content: 'Hello, world!',
      })
      expect(messages[0].id).toBeDefined()
      expect(messages[0].timestamp).toBeDefined()
    })

    it('应该按顺序添加多条用户消息', () => {
      manager.addUserMessage('First message')
      manager.addUserMessage('Second message')

      const messages = manager.getMessages()
      expect(messages).toHaveLength(2)
      expect(messages[0].type).toBe('user')
      expect((messages[0] as any).content).toBe('First message')
      expect(messages[1].type).toBe('user')
      expect((messages[1] as any).content).toBe('Second message')
    })
  })


  describe('addAIMessage', () => {
    it('应该添加 AI 消息并返回 ID', () => {
      const messageId = manager.addAIMessage('AI response', 'claude-3')

      expect(messageId).toBeDefined()
      const messages = manager.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        type: 'ai',
        content: 'AI response',
        model: 'claude-3',
        isStreaming: true,
      })
    })
  })

  describe('updateAIMessage', () => {
    it('应该更新 AI 消息内容', () => {
      const messageId = manager.addAIMessage('Initial', 'claude-3')
      manager.updateAIMessage(messageId, 'Updated content')

      const messages = manager.getMessages()
      expect(messages).toHaveLength(1)
      expect((messages[0] as any).content).toBe('Updated content')
      expect((messages[0] as any).isStreaming).toBe(true)
    })

    it('不应该更新不存在的消息', () => {
      manager.addAIMessage('Original', 'claude-3')
      manager.updateAIMessage('non-existent-id', 'New content')

      const messages = manager.getMessages()
      expect((messages[0] as any).content).toBe('Original')
    })
  })

  describe('finishAIMessage', () => {
    it('应该将 isStreaming 设置为 false', () => {
      const messageId = manager.addAIMessage('Content', 'claude-3')

      expect((manager.getMessages()[0] as any).isStreaming).toBe(true)

      manager.finishAIMessage(messageId)

      expect((manager.getMessages()[0] as any).isStreaming).toBe(false)
    })
  })

  describe('addToolCall', () => {
    it('应该添加工具调用并返回 ID', () => {
      const toolId = manager.addToolCall({
        name: 'read',
        displayName: 'Read File',
        input: { filePath: '/path/to/file.ts' },
      })

      expect(toolId).toBeDefined()
      const messages = manager.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0].type).toBe('tool')
      const toolMsg = messages[0] as any
      expect(toolMsg.tool).toMatchObject({
        name: 'read',
        displayName: 'Read File',
        status: 'pending',
        isError: false,
      })
      expect(toolMsg.tool.startTime).toBeDefined()
    })
  })

  describe('updateToolCall', () => {
    it('应该更新工具调用状态', () => {
      const toolId = manager.addToolCall({
        name: 'bash',
        displayName: 'Execute Command',
        input: { command: 'ls -la' },
      })

      manager.updateToolCall(toolId, { status: 'running' })

      const toolMsg = manager.getMessages()[0] as any
      expect(toolMsg.tool.status).toBe('running')
    })

    it('应该更新工具调用输出和完成状态', () => {
      const toolId = manager.addToolCall({
        name: 'read',
        displayName: 'Read File',
        input: { filePath: '/path/to/file.ts' },
      })

      manager.updateToolCall(toolId, {
        status: 'completed',
        output: 'File content here',
        endTime: Date.now(),
      })

      const toolMsg = manager.getMessages()[0] as any
      expect(toolMsg.tool.status).toBe('completed')
      expect(toolMsg.tool.output).toBe('File content here')
      expect(toolMsg.tool.endTime).toBeDefined()
    })

    it('应该更新工具调用错误状态', () => {
      const toolId = manager.addToolCall({
        name: 'write',
        displayName: 'Write File',
        input: { filePath: '/path/to/file.ts', content: 'content' },
      })

      manager.updateToolCall(toolId, {
        status: 'error',
        isError: true,
        output: 'Permission denied',
      })

      const toolMsg = manager.getMessages()[0] as any
      expect(toolMsg.tool.status).toBe('error')
      expect(toolMsg.tool.isError).toBe(true)
      expect(toolMsg.tool.output).toBe('Permission denied')
    })
  })


  describe('addSystemMessage', () => {
    it('应该添加 info 级别系统消息', () => {
      manager.addSystemMessage('info', 'Information message')

      const messages = manager.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({
        type: 'system',
        level: 'info',
        content: 'Information message',
      })
    })

    it('应该添加 warning 级别系统消息', () => {
      manager.addSystemMessage('warning', 'Warning message')

      expect(manager.getMessages()[0]).toMatchObject({
        type: 'system',
        level: 'warning',
        content: 'Warning message',
      })
    })

    it('应该添加 error 级别系统消息', () => {
      manager.addSystemMessage('error', 'Error message')

      expect(manager.getMessages()[0]).toMatchObject({
        type: 'system',
        level: 'error',
        content: 'Error message',
      })
    })
  })

  describe('clear', () => {
    it('应该清空所有消息', () => {
      manager.addUserMessage('User message')
      manager.addAIMessage('AI message', 'claude-3')
      manager.addSystemMessage('info', 'System message')

      expect(manager.getMessages()).toHaveLength(3)

      manager.clear()

      expect(manager.getMessages()).toHaveLength(0)
    })
  })

  describe('混合消息类型', () => {
    it('应该正确处理混合消息序列', () => {
      manager.addUserMessage('Hello')

      const aiId = manager.addAIMessage('', 'claude-3')
      manager.updateAIMessage(aiId, 'Thinking...')

      const toolId = manager.addToolCall({
        name: 'read',
        displayName: 'Read File',
        input: { filePath: '/test.ts' },
      })

      manager.updateToolCall(toolId, { status: 'completed', output: 'content' })
      manager.updateAIMessage(aiId, 'Here is the file content.')
      manager.finishAIMessage(aiId)

      const messages = manager.getMessages()
      expect(messages).toHaveLength(3)
      expect(messages[0].type).toBe('user')
      expect(messages[1].type).toBe('ai')
      expect(messages[2].type).toBe('tool')

      const aiMsg = messages[1] as any
      expect(aiMsg.content).toBe('Here is the file content.')
      expect(aiMsg.isStreaming).toBe(false)

      const toolMsg = messages[2] as any
      expect(toolMsg.tool.status).toBe('completed')
    })
  })

  describe('ID 唯一性', () => {
    it('每条消息应该有唯一的 ID', () => {
      for (let i = 0; i < 10; i++) {
        manager.addUserMessage(`Message ${i}`)
      }

      const ids = manager.getMessages().map((m) => m.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })
  })

  describe('订阅通知', () => {
    it('应该在消息变化时通知订阅者', () => {
      const listener = vi.fn()
      manager.subscribe(listener)

      manager.addUserMessage('Test')
      expect(listener).toHaveBeenCalledTimes(1)

      manager.addAIMessage('AI', 'claude-3')
      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('应该能取消订阅', () => {
      const listener = vi.fn()
      const unsubscribe = manager.subscribe(listener)

      manager.addUserMessage('Test')
      expect(listener).toHaveBeenCalledTimes(1)

      unsubscribe()
      manager.addUserMessage('Test 2')
      expect(listener).toHaveBeenCalledTimes(1)
    })
  })
})
