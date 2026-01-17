import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import {
  saveSession,
  loadSession,
  deleteSessionStorage,
  listSavedSessions,
  isSessionSaved,
  appendMessage,
} from '../../src/session/storage'
import { createSession, addMessage } from '../../src/session/session'
import { createUserMessage } from '../../src/session/message'
import { createTempDir, cleanupTempDir } from '../helpers/context'

describe('Storage', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  describe('saveSession / loadSession', () => {
    it('should save and load a session', async () => {
      const session = createSession({ id: 'test-session', cwd: tempDir })
      addMessage(session, 'user', [{ type: 'text', text: 'Hello' }])
      addMessage(session, 'assistant', [{ type: 'text', text: 'Hi there' }])

      await saveSession(session, tempDir)
      const loaded = await loadSession('test-session', tempDir)

      expect(loaded.id).toBe('test-session')
      expect(loaded.status).toBe(session.status)
      expect(loaded.agentType).toBe(session.agentType)
      expect(loaded.messages).toHaveLength(2)
      expect(loaded.messages[0].content[0]).toEqual({ type: 'text', text: 'Hello' })
    })

    it('should save session to correct directory structure', async () => {
      const session = createSession({ id: 'dir-test', cwd: tempDir })

      await saveSession(session, tempDir)

      const metaPath = path.join(tempDir, '.naught', 'sessions', 'dir-test', 'session.json')
      const messagesPath = path.join(tempDir, '.naught', 'sessions', 'dir-test', 'messages.jsonl')

      await expect(fs.access(metaPath)).resolves.toBeUndefined()
      await expect(fs.access(messagesPath)).resolves.toBeUndefined()
    })

    it('should preserve token usage', async () => {
      const session = createSession({ id: 'usage-test', cwd: tempDir })
      session.usage = { inputTokens: 100, outputTokens: 50 }

      await saveSession(session, tempDir)
      const loaded = await loadSession('usage-test', tempDir)

      expect(loaded.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
    })

    it('should handle empty messages', async () => {
      const session = createSession({ id: 'empty-messages', cwd: tempDir })

      await saveSession(session, tempDir)
      const loaded = await loadSession('empty-messages', tempDir)

      expect(loaded.messages).toEqual([])
    })

    it('should save and load new fields (tags, cost, turns, branch info)', async () => {
      const session = createSession({ id: 'new-fields-test', cwd: tempDir })
      
      // 设置新字段
      session.tags = ['refactor', 'auth']
      session.total_cost_usd = 0.15
      session.num_turns = 5
      session.parent_session_id = 'parent-session-123'
      session.branch_point = 3

      await saveSession(session, tempDir)
      const loaded = await loadSession('new-fields-test', tempDir)

      expect(loaded.tags).toEqual(['refactor', 'auth'])
      expect(loaded.total_cost_usd).toBe(0.15)
      expect(loaded.num_turns).toBe(5)
      expect(loaded.parent_session_id).toBe('parent-session-123')
      expect(loaded.branch_point).toBe(3)
    })

    it('should maintain backward compatibility when loading old sessions', async () => {
      // 模拟旧格式的会话文件（没有新字段）
      const session = createSession({ id: 'old-format', cwd: tempDir })
      const sessionDir = path.join(tempDir, '.naught', 'sessions', 'old-format')
      await fs.mkdir(sessionDir, { recursive: true })

      // 写入旧格式的元数据（不包含新字段）
      const oldMeta = {
        id: 'old-format',
        status: 'idle',
        cwd: tempDir,
        agentType: 'build',
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        usage: { inputTokens: 0, outputTokens: 0 }
      }
      await fs.writeFile(
        path.join(sessionDir, 'session.json'),
        JSON.stringify(oldMeta, null, 2)
      )
      await fs.writeFile(path.join(sessionDir, 'messages.jsonl'), '')

      // 加载应该成功，新字段为 undefined
      const loaded = await loadSession('old-format', tempDir)
      expect(loaded.id).toBe('old-format')
      expect(loaded.tags).toBeUndefined()
      expect(loaded.total_cost_usd).toBeUndefined()
      expect(loaded.num_turns).toBeUndefined()
      expect(loaded.parent_session_id).toBeUndefined()
      expect(loaded.branch_point).toBeUndefined()
    })
  })

  describe('deleteSessionStorage', () => {
    it('should delete session storage', async () => {
      const session = createSession({ id: 'to-delete', cwd: tempDir })
      await saveSession(session, tempDir)

      await deleteSessionStorage('to-delete', tempDir)

      const exists = await isSessionSaved('to-delete', tempDir)
      expect(exists).toBe(false)
    })

    it('should not throw when deleting non-existent session', async () => {
      await expect(deleteSessionStorage('non-existent', tempDir)).resolves.toBeUndefined()
    })
  })

  describe('listSavedSessions', () => {
    it('should list all saved sessions', async () => {
      await saveSession(createSession({ id: 'session-1', cwd: tempDir }), tempDir)
      await saveSession(createSession({ id: 'session-2', cwd: tempDir }), tempDir)
      await saveSession(createSession({ id: 'session-3', cwd: tempDir }), tempDir)

      const sessions = await listSavedSessions(tempDir)

      expect(sessions).toHaveLength(3)
      expect(sessions).toContain('session-1')
      expect(sessions).toContain('session-2')
      expect(sessions).toContain('session-3')
    })

    it('should return empty array when no sessions exist', async () => {
      const sessions = await listSavedSessions(tempDir)

      expect(sessions).toEqual([])
    })
  })

  describe('isSessionSaved', () => {
    it('should return true for saved session', async () => {
      const session = createSession({ id: 'saved', cwd: tempDir })
      await saveSession(session, tempDir)

      const exists = await isSessionSaved('saved', tempDir)

      expect(exists).toBe(true)
    })

    it('should return false for non-existent session', async () => {
      const exists = await isSessionSaved('non-existent', tempDir)

      expect(exists).toBe(false)
    })
  })

  describe('appendMessage', () => {
    it('should append message to saved session', async () => {
      const session = createSession({ id: 'append-test', cwd: tempDir })
      await saveSession(session, tempDir)

      const message = createUserMessage('Appended message')
      await appendMessage('append-test', message, tempDir)

      const loaded = await loadSession('append-test', tempDir)
      expect(loaded.messages).toHaveLength(1)
      expect(loaded.messages[0].content[0]).toEqual({ type: 'text', text: 'Appended message' })
    })

    it('should update session updatedAt when appending', async () => {
      const session = createSession({ id: 'update-time', cwd: tempDir })
      const originalUpdatedAt = session.updatedAt
      await saveSession(session, tempDir)

      const message = createUserMessage('New message')
      message.timestamp = originalUpdatedAt + 1000
      await appendMessage('update-time', message, tempDir)

      const loaded = await loadSession('update-time', tempDir)
      expect(loaded.updatedAt).toBe(message.timestamp)
    })

    it('should append multiple messages', async () => {
      const session = createSession({ id: 'multi-append', cwd: tempDir })
      await saveSession(session, tempDir)

      await appendMessage('multi-append', createUserMessage('Message 1'), tempDir)
      await appendMessage('multi-append', createUserMessage('Message 2'), tempDir)
      await appendMessage('multi-append', createUserMessage('Message 3'), tempDir)

      const loaded = await loadSession('multi-append', tempDir)
      expect(loaded.messages).toHaveLength(3)
    })
  })
})
