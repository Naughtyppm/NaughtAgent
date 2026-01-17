import { describe, it, expect } from 'vitest'
import {
  generateSessionId,
  createSession,
  addMessage,
  updateStatus,
  updateUsage,
  getLastMessage,
  getLastAssistantMessage,
  clearMessages,
  canAcceptInput,
  isRunning,
  isEnded,
  type Session,
} from '../../src/session/session'

describe('Session', () => {
  describe('generateSessionId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateSessionId()
      const id2 = generateSessionId()

      expect(id1).not.toBe(id2)
    })

    it('should generate IDs with correct prefix', () => {
      const id = generateSessionId()

      expect(id).toMatch(/^session_\d+_[a-z0-9]+$/)
    })
  })

  describe('createSession', () => {
    it('should create session with defaults', () => {
      const session = createSession()

      expect(session.id).toMatch(/^session_/)
      expect(session.status).toBe('idle')
      expect(session.cwd).toBe(process.cwd())
      expect(session.messages).toEqual([])
      expect(session.agentType).toBe('build')
      expect(session.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
    })

    it('should create session with custom options', () => {
      const session = createSession({
        id: 'custom-id',
        cwd: '/custom/path',
        agentType: 'plan',
      })

      expect(session.id).toBe('custom-id')
      expect(session.cwd).toBe('/custom/path')
      expect(session.agentType).toBe('plan')
    })

    it('should initialize new fields with default values', () => {
      const session = createSession()

      expect(session.tags).toEqual([])
      expect(session.total_cost_usd).toBe(0)
      expect(session.num_turns).toBe(0)
      expect(session.parent_session_id).toBeUndefined()
      expect(session.branch_point).toBeUndefined()
    })
  })

  describe('addMessage', () => {
    it('should add user message to session', () => {
      const session = createSession()
      const message = addMessage(session, 'user', [{ type: 'text', text: 'Hello' }])

      expect(session.messages).toHaveLength(1)
      expect(message.role).toBe('user')
      expect(message.content[0]).toEqual({ type: 'text', text: 'Hello' })
    })

    it('should add assistant message to session', () => {
      const session = createSession()
      const message = addMessage(session, 'assistant', [
        { type: 'text', text: 'Hi there' },
        { type: 'tool_use', id: 'call-1', name: 'read', input: {} },
      ])

      expect(session.messages).toHaveLength(1)
      expect(message.role).toBe('assistant')
      expect(message.content).toHaveLength(2)
    })

    it('should update session updatedAt', () => {
      const session = createSession()
      const originalUpdatedAt = session.updatedAt

      // Small delay to ensure timestamp difference
      addMessage(session, 'user', [{ type: 'text', text: 'Hello' }])

      expect(session.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt)
    })
  })

  describe('updateStatus', () => {
    it('should update session status', () => {
      const session = createSession()

      updateStatus(session, 'running')
      expect(session.status).toBe('running')

      updateStatus(session, 'completed')
      expect(session.status).toBe('completed')
    })
  })

  describe('updateUsage', () => {
    it('should accumulate token usage', () => {
      const session = createSession()

      updateUsage(session, { inputTokens: 100, outputTokens: 50 })
      expect(session.usage).toEqual({ inputTokens: 100, outputTokens: 50 })

      updateUsage(session, { inputTokens: 200, outputTokens: 100 })
      expect(session.usage).toEqual({ inputTokens: 300, outputTokens: 150 })
    })

    it('should handle partial updates', () => {
      const session = createSession()

      updateUsage(session, { inputTokens: 100 })
      expect(session.usage).toEqual({ inputTokens: 100, outputTokens: 0 })

      updateUsage(session, { outputTokens: 50 })
      expect(session.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
    })
  })

  describe('getLastMessage', () => {
    it('should return last message', () => {
      const session = createSession()
      addMessage(session, 'user', [{ type: 'text', text: 'First' }])
      addMessage(session, 'assistant', [{ type: 'text', text: 'Second' }])

      const last = getLastMessage(session)

      expect(last?.role).toBe('assistant')
    })

    it('should return undefined for empty session', () => {
      const session = createSession()

      expect(getLastMessage(session)).toBeUndefined()
    })
  })

  describe('getLastAssistantMessage', () => {
    it('should return last assistant message', () => {
      const session = createSession()
      addMessage(session, 'user', [{ type: 'text', text: 'User 1' }])
      addMessage(session, 'assistant', [{ type: 'text', text: 'Assistant 1' }])
      addMessage(session, 'user', [{ type: 'text', text: 'User 2' }])

      const last = getLastAssistantMessage(session)

      expect(last?.content[0]).toEqual({ type: 'text', text: 'Assistant 1' })
    })

    it('should return undefined when no assistant messages', () => {
      const session = createSession()
      addMessage(session, 'user', [{ type: 'text', text: 'Hello' }])

      expect(getLastAssistantMessage(session)).toBeUndefined()
    })
  })

  describe('clearMessages', () => {
    it('should clear all messages', () => {
      const session = createSession()
      addMessage(session, 'user', [{ type: 'text', text: 'Hello' }])
      addMessage(session, 'assistant', [{ type: 'text', text: 'Hi' }])

      clearMessages(session)

      expect(session.messages).toEqual([])
    })
  })

  describe('status helpers', () => {
    it('canAcceptInput should return true for idle/paused', () => {
      const session = createSession()

      expect(canAcceptInput(session)).toBe(true)

      updateStatus(session, 'paused')
      expect(canAcceptInput(session)).toBe(true)

      updateStatus(session, 'running')
      expect(canAcceptInput(session)).toBe(false)
    })

    it('isRunning should return true only for running status', () => {
      const session = createSession()

      expect(isRunning(session)).toBe(false)

      updateStatus(session, 'running')
      expect(isRunning(session)).toBe(true)
    })

    it('isEnded should return true for completed/error', () => {
      const session = createSession()

      expect(isEnded(session)).toBe(false)

      updateStatus(session, 'completed')
      expect(isEnded(session)).toBe(true)

      updateStatus(session, 'error')
      expect(isEnded(session)).toBe(true)
    })
  })

  describe('new fields', () => {
    it('should support tags field', () => {
      const session = createSession()

      expect(session.tags).toEqual([])

      // 可以直接操作 tags 数组
      session.tags?.push('refactor', 'auth')
      expect(session.tags).toEqual(['refactor', 'auth'])
    })

    it('should support total_cost_usd field', () => {
      const session = createSession()

      expect(session.total_cost_usd).toBe(0)

      // 可以累加成本
      session.total_cost_usd = (session.total_cost_usd || 0) + 0.05
      expect(session.total_cost_usd).toBe(0.05)

      session.total_cost_usd = (session.total_cost_usd || 0) + 0.03
      expect(session.total_cost_usd).toBe(0.08)
    })

    it('should support num_turns field', () => {
      const session = createSession()

      expect(session.num_turns).toBe(0)

      // 可以增加轮次
      session.num_turns = (session.num_turns || 0) + 1
      expect(session.num_turns).toBe(1)
    })

    it('should support parent_session_id and branch_point fields', () => {
      const session = createSession()

      expect(session.parent_session_id).toBeUndefined()
      expect(session.branch_point).toBeUndefined()

      // 可以设置分支信息
      session.parent_session_id = 'session_parent_123'
      session.branch_point = 5

      expect(session.parent_session_id).toBe('session_parent_123')
      expect(session.branch_point).toBe(5)
    })

    it('should maintain backward compatibility with optional fields', () => {
      // 模拟旧格式的会话（没有新字段）
      const oldSession: Session = {
        id: 'old-session',
        status: 'idle',
        cwd: '/path',
        messages: [],
        agentType: 'build',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usage: { inputTokens: 0, outputTokens: 0 },
      }

      // 应该可以正常使用
      expect(oldSession.tags).toBeUndefined()
      expect(oldSession.total_cost_usd).toBeUndefined()
      expect(oldSession.num_turns).toBeUndefined()
      expect(oldSession.parent_session_id).toBeUndefined()
      expect(oldSession.branch_point).toBeUndefined()
    })
  })
})
