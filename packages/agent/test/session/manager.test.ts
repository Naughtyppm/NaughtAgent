import { describe, it, expect, beforeEach } from 'vitest'
import { SessionManager } from '../../src/session/manager'
import { createSession } from '../../src/session/session'

describe('SessionManager', () => {
  let manager: SessionManager

  beforeEach(() => {
    manager = new SessionManager()
  })

  describe('create', () => {
    it('should create a new session', () => {
      const session = manager.create()

      expect(session.id).toMatch(/^session_/)
      expect(manager.size).toBe(1)
    })

    it('should create session with custom options', () => {
      const session = manager.create({
        id: 'custom-id',
        cwd: '/custom/path',
        agentType: 'plan',
      })

      expect(session.id).toBe('custom-id')
      expect(session.cwd).toBe('/custom/path')
      expect(session.agentType).toBe('plan')
    })

    it('should throw when creating duplicate session', () => {
      manager.create({ id: 'duplicate' })

      expect(() => manager.create({ id: 'duplicate' })).toThrow('Session already exists')
    })
  })

  describe('get / getOrThrow', () => {
    it('should get existing session', () => {
      const created = manager.create({ id: 'test-session' })
      const retrieved = manager.get('test-session')

      expect(retrieved).toBe(created)
    })

    it('should return undefined for non-existent session', () => {
      expect(manager.get('non-existent')).toBeUndefined()
    })

    it('should throw for non-existent session with getOrThrow', () => {
      expect(() => manager.getOrThrow('non-existent')).toThrow('Session not found')
    })
  })

  describe('list / listIds', () => {
    it('should list all sessions', () => {
      manager.create({ id: 'session-1' })
      manager.create({ id: 'session-2' })

      const sessions = manager.list()
      const ids = manager.listIds()

      expect(sessions).toHaveLength(2)
      expect(ids).toContain('session-1')
      expect(ids).toContain('session-2')
    })
  })

  describe('delete / clear', () => {
    it('should delete a session', () => {
      manager.create({ id: 'to-delete' })

      const deleted = manager.delete('to-delete')

      expect(deleted).toBe(true)
      expect(manager.get('to-delete')).toBeUndefined()
    })

    it('should return false when deleting non-existent session', () => {
      expect(manager.delete('non-existent')).toBe(false)
    })

    it('should clear all sessions', () => {
      manager.create({ id: 'session-1' })
      manager.create({ id: 'session-2' })

      manager.clear()

      expect(manager.size).toBe(0)
    })
  })

  describe('addMessage / addUserMessage / addAssistantMessage', () => {
    it('should add user message', () => {
      manager.create({ id: 'test' })

      const message = manager.addUserMessage('test', 'Hello')

      expect(message.role).toBe('user')
      expect(message.content[0]).toEqual({ type: 'text', text: 'Hello' })
    })

    it('should add assistant message', () => {
      manager.create({ id: 'test' })

      const message = manager.addAssistantMessage('test', [
        { type: 'text', text: 'Hi there' },
      ])

      expect(message.role).toBe('assistant')
    })

    it('should throw when adding message to non-existent session', () => {
      expect(() => manager.addUserMessage('non-existent', 'Hello')).toThrow('Session not found')
    })
  })

  describe('updateStatus', () => {
    it('should update session status', () => {
      manager.create({ id: 'test' })

      manager.updateStatus('test', 'running')

      expect(manager.get('test')?.status).toBe('running')
    })
  })

  describe('updateUsage', () => {
    it('should accumulate token usage', () => {
      manager.create({ id: 'test' })

      manager.updateUsage('test', { inputTokens: 100, outputTokens: 50 })
      manager.updateUsage('test', { inputTokens: 200 })

      const session = manager.get('test')
      expect(session?.usage).toEqual({ inputTokens: 300, outputTokens: 50 })
    })
  })

  describe('getActive', () => {
    it('should return most recently updated active session', () => {
      manager.create({ id: 'session-1' })
      manager.create({ id: 'session-2' })

      // Update session-1 to make it more recent
      manager.addUserMessage('session-1', 'Hello')

      const active = manager.getActive()

      expect(active?.id).toBe('session-1')
    })

    it('should not return completed sessions', () => {
      manager.create({ id: 'completed' })
      manager.updateStatus('completed', 'completed')

      expect(manager.getActive()).toBeUndefined()
    })

    it('should return running session', () => {
      manager.create({ id: 'running' })
      manager.updateStatus('running', 'running')

      expect(manager.getActive()?.id).toBe('running')
    })
  })

  describe('register', () => {
    it('should register an existing session', () => {
      const session = createSession({ id: 'external' })

      manager.register(session)

      expect(manager.get('external')).toBe(session)
    })

    it('should throw when registering duplicate session', () => {
      manager.create({ id: 'existing' })
      const session = createSession({ id: 'existing' })

      expect(() => manager.register(session)).toThrow('Session already exists')
    })
  })
})
