import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import {
  migrateAllSessions,
  migrateSingleSession,
  type MigrationResult,
} from '../../src/session/migrate'
import { createSession, addMessage } from '../../src/session/session'
import { saveSession, loadSession } from '../../src/session/storage'
import { createTempDir, cleanupTempDir } from '../helpers/context'

describe('Migration', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  describe('migrateSingleSession', () => {
    it('should migrate old format session to new format', async () => {
      // 创建旧格式会话（不包含新字段）
      const sessionId = 'old-session'
      const sessionDir = path.join(tempDir, '.naught', 'sessions', sessionId)
      await fs.mkdir(sessionDir, { recursive: true })

      const oldMeta = {
        id: sessionId,
        status: 'idle',
        cwd: tempDir,
        agentType: 'build',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usage: { inputTokens: 100, outputTokens: 50 },
      }

      await fs.writeFile(
        path.join(sessionDir, 'session.json'),
        JSON.stringify(oldMeta, null, 2)
      )
      await fs.writeFile(
        path.join(sessionDir, 'messages.jsonl'),
        '{"id":"msg1","role":"user","content":[{"type":"text","text":"Hello"}],"timestamp":1234567890}\n' +
        '{"id":"msg2","role":"assistant","content":[{"type":"text","text":"Hi"}],"timestamp":1234567891}\n'
      )

      // 迁移
      await migrateSingleSession(sessionId, tempDir)

      // 验证
      const migrated = await loadSession(sessionId, tempDir)
      expect(migrated.tags).toEqual([])
      expect(migrated.total_cost_usd).toBe(0)
      expect(migrated.num_turns).toBe(1) // 2 messages / 2 = 1 turn
      expect(migrated.parent_session_id).toBeUndefined()
      expect(migrated.branch_point).toBeUndefined()
    })

    it('should create backup when migrating', async () => {
      const session = createSession({ id: 'backup-test', cwd: tempDir })
      // 移除新字段以模拟旧格式
      delete (session as any).tags
      delete (session as any).total_cost_usd
      delete (session as any).num_turns

      await saveSession(session, tempDir)

      // 迁移（带备份）
      await migrateSingleSession('backup-test', tempDir, { backup: true })

      // 验证备份存在
      const backupDir = path.join(tempDir, '.naught', 'sessions', 'backup-test.backup')
      await expect(fs.access(backupDir)).resolves.toBeUndefined()
    })

    it('should skip migration if session already has new fields', async () => {
      const session = createSession({ id: 'new-format', cwd: tempDir })
      session.tags = ['test']
      session.total_cost_usd = 0.1
      session.num_turns = 5

      await saveSession(session, tempDir)

      // 迁移（不强制）
      await migrateSingleSession('new-format', tempDir, { force: false })

      // 验证字段未改变
      const loaded = await loadSession('new-format', tempDir)
      expect(loaded.tags).toEqual(['test'])
      expect(loaded.total_cost_usd).toBe(0.1)
      expect(loaded.num_turns).toBe(5)
    })

    it('should force migration when force option is true', async () => {
      const session = createSession({ id: 'force-test', cwd: tempDir })
      session.tags = ['old-tag']
      session.total_cost_usd = 0.1
      session.num_turns = 5
      addMessage(session, 'user', [{ type: 'text', text: 'Hello' }])
      addMessage(session, 'assistant', [{ type: 'text', text: 'Hi' }])

      await saveSession(session, tempDir)

      // 强制迁移
      await migrateSingleSession('force-test', tempDir, { force: true })

      // 验证 num_turns 被重新计算
      const loaded = await loadSession('force-test', tempDir)
      expect(loaded.num_turns).toBe(1) // 重新计算为 2 messages / 2 = 1
    })

    it('should not create backup when backup option is false', async () => {
      const session = createSession({ id: 'no-backup', cwd: tempDir })
      delete (session as any).tags

      await saveSession(session, tempDir)

      // 迁移（不备份）
      await migrateSingleSession('no-backup', tempDir, { backup: false })

      // 验证备份不存在
      const backupDir = path.join(tempDir, '.naught', 'sessions', 'no-backup.backup')
      await expect(fs.access(backupDir)).rejects.toThrow()
    })
  })

  describe('migrateAllSessions', () => {
    it('should migrate all sessions', async () => {
      // 创建多个旧格式会话
      for (let i = 1; i <= 3; i++) {
        const session = createSession({ id: `session-${i}`, cwd: tempDir })
        delete (session as any).tags
        delete (session as any).total_cost_usd
        delete (session as any).num_turns
        await saveSession(session, tempDir)
      }

      // 迁移所有会话
      const result = await migrateAllSessions({
        baseDir: tempDir,
        backup: false,
        verbose: false,
      })

      expect(result.total).toBe(3)
      expect(result.migrated).toBe(3)
      expect(result.skipped).toBe(0)
      expect(result.failed).toBe(0)

      // 验证所有会话都已迁移
      for (let i = 1; i <= 3; i++) {
        const loaded = await loadSession(`session-${i}`, tempDir)
        expect(loaded.tags).toEqual([])
        expect(loaded.total_cost_usd).toBe(0)
        expect(loaded.num_turns).toBe(0)
      }
    })

    it('should skip sessions that already have new fields', async () => {
      // 创建混合格式的会话
      const oldSession = createSession({ id: 'old', cwd: tempDir })
      delete (oldSession as any).tags
      await saveSession(oldSession, tempDir)

      const newSession = createSession({ id: 'new', cwd: tempDir })
      newSession.tags = ['test']
      newSession.total_cost_usd = 0.1
      newSession.num_turns = 5
      await saveSession(newSession, tempDir)

      // 迁移
      const result = await migrateAllSessions({
        baseDir: tempDir,
        backup: false,
      })

      expect(result.total).toBe(2)
      expect(result.migrated).toBe(1) // 只迁移 old
      expect(result.skipped).toBe(1) // 跳过 new
      expect(result.failed).toBe(0)
    })

    it('should handle empty session list', async () => {
      const result = await migrateAllSessions({
        baseDir: tempDir,
        backup: false,
      })

      expect(result.total).toBe(0)
      expect(result.migrated).toBe(0)
      expect(result.skipped).toBe(0)
      expect(result.failed).toBe(0)
    })

    it('should record errors for failed migrations', async () => {
      // 创建一个损坏的会话文件
      const sessionDir = path.join(tempDir, '.naught', 'sessions', 'broken')
      await fs.mkdir(sessionDir, { recursive: true })
      await fs.writeFile(
        path.join(sessionDir, 'session.json'),
        'invalid json'
      )

      const result = await migrateAllSessions({
        baseDir: tempDir,
        backup: false,
      })

      expect(result.total).toBe(1)
      expect(result.migrated).toBe(0)
      expect(result.skipped).toBe(0)
      expect(result.failed).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].sessionId).toBe('broken')
    })

    it('should create backups when backup option is true', async () => {
      const session = createSession({ id: 'backup-all', cwd: tempDir })
      delete (session as any).tags
      await saveSession(session, tempDir)

      await migrateAllSessions({
        baseDir: tempDir,
        backup: true,
      })

      // 验证备份存在
      const backupDir = path.join(tempDir, '.naught', 'sessions', 'backup-all.backup')
      await expect(fs.access(backupDir)).resolves.toBeUndefined()
    })

    it('should force migrate all sessions when force is true', async () => {
      // 创建已有新字段的会话
      const session = createSession({ id: 'force-all', cwd: tempDir })
      session.tags = ['old']
      session.total_cost_usd = 0.1
      session.num_turns = 10
      addMessage(session, 'user', [{ type: 'text', text: 'Hello' }])
      addMessage(session, 'assistant', [{ type: 'text', text: 'Hi' }])
      await saveSession(session, tempDir)

      const result = await migrateAllSessions({
        baseDir: tempDir,
        backup: false,
        force: true,
      })

      expect(result.total).toBe(1)
      expect(result.migrated).toBe(1) // 强制迁移
      expect(result.skipped).toBe(0)

      // 验证 num_turns 被重新计算
      const loaded = await loadSession('force-all', tempDir)
      expect(loaded.num_turns).toBe(1) // 重新计算
    })
  })

  describe('backward compatibility', () => {
    it('should handle sessions with partial new fields', async () => {
      const sessionId = 'partial'
      const sessionDir = path.join(tempDir, '.naught', 'sessions', sessionId)
      await fs.mkdir(sessionDir, { recursive: true })

      // 只有部分新字段
      const partialMeta = {
        id: sessionId,
        status: 'idle',
        cwd: tempDir,
        agentType: 'build',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usage: { inputTokens: 0, outputTokens: 0 },
        tags: ['test'], // 有这个
        // 缺少 total_cost_usd 和 num_turns
      }

      await fs.writeFile(
        path.join(sessionDir, 'session.json'),
        JSON.stringify(partialMeta, null, 2)
      )
      await fs.writeFile(path.join(sessionDir, 'messages.jsonl'), '')

      // 迁移
      await migrateSingleSession(sessionId, tempDir)

      // 验证
      const migrated = await loadSession(sessionId, tempDir)
      expect(migrated.tags).toEqual(['test']) // 保留原有
      expect(migrated.total_cost_usd).toBe(0) // 添加默认值
      expect(migrated.num_turns).toBe(0) // 添加默认值
    })

    it('should preserve branch information if present', async () => {
      const session = createSession({ id: 'branch', cwd: tempDir })
      delete (session as any).tags
      session.parent_session_id = 'parent-123'
      session.branch_point = 5

      await saveSession(session, tempDir)
      await migrateSingleSession('branch', tempDir)

      const migrated = await loadSession('branch', tempDir)
      expect(migrated.parent_session_id).toBe('parent-123')
      expect(migrated.branch_point).toBe(5)
    })
  })
})
