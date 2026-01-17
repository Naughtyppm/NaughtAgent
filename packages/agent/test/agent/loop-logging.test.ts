/**
 * Agent Loop 日志集成测试
 * 
 * 验证日志和监控在 Agent Loop 中的集成
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAgentLoop } from '../../src/agent/loop'
import type { AgentDefinition, AgentRunConfig } from '../../src/agent/agent'
import type { Session } from '../../src/session/session'
import type { LLMProvider, ChatResult } from '../../src/provider/types'
import { Logger } from '../../src/logging'

describe('Agent Loop 日志集成', () => {
  let mockProvider: LLMProvider
  let mockSession: Session
  let definition: AgentDefinition
  let runConfig: AgentRunConfig

  beforeEach(() => {
    // Mock Provider
    mockProvider = {
      type: 'anthropic',
      async *stream() {
        yield { type: 'text', text: 'test' }
        yield { type: 'message_end', usage: { inputTokens: 10, outputTokens: 5 } }
      },
      async chat(): Promise<ChatResult> {
        return {
          text: 'Hello',
          toolCalls: [],
          usage: { inputTokens: 10, outputTokens: 5 }
        }
      }
    }

    // Mock Session
    mockSession = {
      id: 'test-session',
      status: 'idle',
      cwd: '/test',
      messages: [],
      agentType: 'build',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usage: { inputTokens: 0, outputTokens: 0 }
    }

    // Agent Definition
    definition = {
      type: 'build',
      mode: 'primary',
      name: 'Test Agent',
      description: 'Test',
      systemPrompt: 'You are a test agent',
      tools: [],
      maxSteps: 10
    }

    // Run Config
    runConfig = {
      sessionId: 'test-session',
      cwd: '/test'
    }
  })

  it('应该在 Agent Loop 开始时记录日志', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'info')
    
    const loop = createAgentLoop({
      definition,
      session: mockSession,
      provider: mockProvider,
      runConfig
    })

    const events = []
    for await (const event of loop.run('test input')) {
      events.push(event)
    }

    // 验证日志被调用
    expect(logSpy).toHaveBeenCalled()
    const calls = logSpy.mock.calls
    const startLog = calls.find(call => call[0].includes('Agent Loop 开始'))
    expect(startLog).toBeDefined()
    
    logSpy.mockRestore()
  })

  it('应该在工具执行时记录日志', async () => {
    const debugSpy = vi.spyOn(Logger.prototype, 'debug')
    
    // Mock provider 返回工具调用
    mockProvider.chat = async (): Promise<ChatResult> => {
      return {
        text: '',
        toolCalls: [{
          id: 'tool-1',
          name: 'read',
          args: { filePath: 'test.txt' }
        }],
        usage: { inputTokens: 10, outputTokens: 5 }
      }
    }

    const loop = createAgentLoop({
      definition: { ...definition, tools: ['read'] },
      session: mockSession,
      provider: mockProvider,
      runConfig
    })

    const events = []
    for await (const event of loop.run('test input')) {
      events.push(event)
      // 只执行一轮
      if (event.type === 'tool_end') break
    }

    // 验证工具执行日志
    expect(debugSpy).toHaveBeenCalled()
    
    debugSpy.mockRestore()
  })

  it('应该在 LLM 调用时记录性能指标', async () => {
    const debugSpy = vi.spyOn(Logger.prototype, 'debug')
    
    const loop = createAgentLoop({
      definition,
      session: mockSession,
      provider: mockProvider,
      runConfig
    })

    const events = []
    for await (const event of loop.run('test input')) {
      events.push(event)
    }

    // 验证 LLM 调用日志
    const calls = debugSpy.mock.calls
    const llmLog = calls.find(call => call[0].includes('调用 LLM'))
    expect(llmLog).toBeDefined()
    
    debugSpy.mockRestore()
  })

  it('应该在错误时记录错误日志', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error')
    
    // Mock provider 抛出错误
    mockProvider.chat = async () => {
      throw new Error('Test error')
    }

    const loop = createAgentLoop({
      definition,
      session: mockSession,
      provider: mockProvider,
      runConfig
    })

    const events = []
    for await (const event of loop.run('test input')) {
      events.push(event)
    }

    // 验证错误日志
    expect(errorSpy).toHaveBeenCalled()
    
    errorSpy.mockRestore()
  })
})
