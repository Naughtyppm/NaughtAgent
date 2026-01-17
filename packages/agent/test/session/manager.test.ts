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

  describe('branch', () => {
    it('should create a branch from a session', () => {
      // 创建父会话并添加消息
      const parent = manager.create({ id: 'parent' })
      manager.addUserMessage('parent', 'Message 1')
      manager.addAssistantMessage('parent', [{ type: 'text', text: 'Response 1' }])
      manager.addUserMessage('parent', 'Message 2')
      manager.addAssistantMessage('parent', [{ type: 'text', text: 'Response 2' }])

      // 从索引 1 创建分支（包含前 2 条消息）
      const branched = manager.branch('parent', 1)

      // 验证分支会话
      expect(branched.id).toMatch(/^session_/)
      expect(branched.id).not.toBe('parent')
      expect(branched.messages).toHaveLength(2)
      expect(branched.messages[0].content[0]).toEqual({ type: 'text', text: 'Message 1' })
      expect(branched.messages[1].content[0]).toEqual({ type: 'text', text: 'Response 1' })
      expect(branched.parent_session_id).toBe('parent')
      expect(branched.branch_point).toBe(1)
      expect(branched.tags).toContain('branch')
    })

    it('should inherit parent session metadata', () => {
      const parent = manager.create({ 
        id: 'parent',
        cwd: '/custom/path',
        agentType: 'plan'
      })
      manager.addUserMessage('parent', 'Message 1')

      const branched = manager.branch('parent', 0)

      expect(branched.cwd).toBe('/custom/path')
      expect(branched.agentType).toBe('plan')
    })

    it('should allow custom tags for branched session', () => {
      const parent = manager.create({ id: 'parent' })
      parent.tags = ['original', 'test']
      manager.addUserMessage('parent', 'Message 1')

      const branched = manager.branch('parent', 0, { tags: ['custom', 'experiment'] })

      expect(branched.tags).toEqual(['custom', 'experiment'])
    })

    it('should register branched session in memory', () => {
      const parent = manager.create({ id: 'parent' })
      manager.addUserMessage('parent', 'Message 1')

      const branched = manager.branch('parent', 0)

      expect(manager.get(branched.id)).toBe(branched)
      expect(manager.size).toBe(2) // parent + branched
    })

    it('should throw when branching from non-existent session', () => {
      expect(() => manager.branch('non-existent', 0)).toThrow('Session not found')
    })

    it('should throw when branch point is negative', () => {
      const parent = manager.create({ id: 'parent' })
      manager.addUserMessage('parent', 'Message 1')

      expect(() => manager.branch('parent', -1)).toThrow('Invalid branch point')
    })

    it('should throw when branch point is out of bounds', () => {
      const parent = manager.create({ id: 'parent' })
      manager.addUserMessage('parent', 'Message 1')

      expect(() => manager.branch('parent', 5)).toThrow('Invalid branch point')
    })

    it('should copy messages correctly with slice', () => {
      const parent = manager.create({ id: 'parent' })
      manager.addUserMessage('parent', 'Message 1')
      manager.addUserMessage('parent', 'Message 2')
      manager.addUserMessage('parent', 'Message 3')

      const branched = manager.branch('parent', 1)

      // 验证分支包含前 2 条消息
      expect(branched.messages).toHaveLength(2)
      
      // 验证消息是复制的，不是引用
      expect(branched.messages).not.toBe(parent.messages)
      
      // 修改分支不应影响父会话
      manager.addUserMessage(branched.id, 'Branch message')
      expect(parent.messages).toHaveLength(3)
      expect(branched.messages).toHaveLength(3)
    })
  })

  describe('findByTags', () => {
    it('should find sessions by single tag', () => {
      manager.create({ id: 'session-1' })
      manager.create({ id: 'session-2' })
      manager.create({ id: 'session-3' })

      const session1 = manager.get('session-1')!
      const session2 = manager.get('session-2')!
      session1.tags = ['refactor', 'auth']
      session2.tags = ['refactor', 'api']

      const results = manager.findByTags(['refactor'])

      expect(results).toHaveLength(2)
      expect(results.map(s => s.id)).toContain('session-1')
      expect(results.map(s => s.id)).toContain('session-2')
    })

    it('should find sessions by multiple tags (AND logic)', () => {
      manager.create({ id: 'session-1' })
      manager.create({ id: 'session-2' })
      manager.create({ id: 'session-3' })

      const session1 = manager.get('session-1')!
      const session2 = manager.get('session-2')!
      const session3 = manager.get('session-3')!
      session1.tags = ['refactor', 'auth']
      session2.tags = ['refactor', 'api']
      session3.tags = ['auth', 'api']

      const results = manager.findByTags(['refactor', 'auth'])

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('session-1')
    })

    it('should return empty array when no sessions match', () => {
      manager.create({ id: 'session-1' })
      const session1 = manager.get('session-1')!
      session1.tags = ['refactor']

      const results = manager.findByTags(['nonexistent'])

      expect(results).toHaveLength(0)
    })

    it('should handle sessions without tags', () => {
      manager.create({ id: 'session-1' })
      manager.create({ id: 'session-2' })
      
      const session2 = manager.get('session-2')!
      session2.tags = ['test']

      const results = manager.findByTags(['test'])

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('session-2')
    })
  })

  describe('updateCost', () => {
    it('should update session cost', () => {
      manager.create({ id: 'test' })

      manager.updateCost('test', 0.05)

      const session = manager.get('test')
      expect(session?.total_cost_usd).toBe(0.05)
    })

    it('should accumulate costs', () => {
      manager.create({ id: 'test' })

      manager.updateCost('test', 0.05)
      manager.updateCost('test', 0.03)
      manager.updateCost('test', 0.02)

      const session = manager.get('test')
      expect(session?.total_cost_usd).toBeCloseTo(0.10, 2)
    })

    it('should update timestamp when updating cost', () => {
      manager.create({ id: 'test' })
      const initialTime = manager.get('test')!.updatedAt

      // 等待一小段时间确保时间戳不同
      const delay = () => new Promise(resolve => setTimeout(resolve, 10))
      return delay().then(() => {
        manager.updateCost('test', 0.05)
        const updatedTime = manager.get('test')!.updatedAt
        expect(updatedTime).toBeGreaterThan(initialTime)
      })
    })

    it('should throw when updating cost for non-existent session', () => {
      expect(() => manager.updateCost('non-existent', 0.05)).toThrow('Session not found')
    })
  })

  describe('addTags', () => {
    it('should add a single tag to session', () => {
      manager.create({ id: 'test' })

      manager.addTags('test', 'refactor')

      const session = manager.get('test')
      expect(session?.tags).toContain('refactor')
    })

    it('should add multiple tags to session', () => {
      manager.create({ id: 'test' })

      manager.addTags('test', 'refactor', 'auth', 'api')

      const session = manager.get('test')
      expect(session?.tags).toEqual(['refactor', 'auth', 'api'])
    })

    it('should not add duplicate tags', () => {
      manager.create({ id: 'test' })

      manager.addTags('test', 'refactor')
      manager.addTags('test', 'refactor')
      manager.addTags('test', 'auth')

      const session = manager.get('test')
      expect(session?.tags).toEqual(['refactor', 'auth'])
    })

    it('should initialize tags array if not exists', () => {
      manager.create({ id: 'test' })
      const session = manager.get('test')!
      session.tags = undefined

      manager.addTags('test', 'new-tag')

      expect(session.tags).toEqual(['new-tag'])
    })

    it('should update timestamp when adding tags', () => {
      manager.create({ id: 'test' })
      const initialTime = manager.get('test')!.updatedAt

      const delay = () => new Promise(resolve => setTimeout(resolve, 10))
      return delay().then(() => {
        manager.addTags('test', 'tag1')
        const updatedTime = manager.get('test')!.updatedAt
        expect(updatedTime).toBeGreaterThan(initialTime)
      })
    })

    it('should throw when adding tags to non-existent session', () => {
      expect(() => manager.addTags('non-existent', 'tag')).toThrow('Session not found')
    })
  })

  describe('removeTags', () => {
    it('should remove a single tag from session', () => {
      manager.create({ id: 'test' })
      manager.addTags('test', 'refactor', 'auth', 'api')

      manager.removeTags('test', 'auth')

      const session = manager.get('test')
      expect(session?.tags).toEqual(['refactor', 'api'])
    })

    it('should remove multiple tags from session', () => {
      manager.create({ id: 'test' })
      manager.addTags('test', 'refactor', 'auth', 'api', 'test')

      manager.removeTags('test', 'auth', 'test')

      const session = manager.get('test')
      expect(session?.tags).toEqual(['refactor', 'api'])
    })

    it('should handle removing non-existent tags', () => {
      manager.create({ id: 'test' })
      manager.addTags('test', 'refactor')

      manager.removeTags('test', 'non-existent')

      const session = manager.get('test')
      expect(session?.tags).toEqual(['refactor'])
    })

    it('should handle session without tags', () => {
      manager.create({ id: 'test' })
      const session = manager.get('test')!
      session.tags = undefined

      manager.removeTags('test', 'any-tag')

      expect(session.tags).toBeUndefined()
    })

    it('should update timestamp when removing tags', () => {
      manager.create({ id: 'test' })
      manager.addTags('test', 'tag1', 'tag2')
      const initialTime = manager.get('test')!.updatedAt

      const delay = () => new Promise(resolve => setTimeout(resolve, 10))
      return delay().then(() => {
        manager.removeTags('test', 'tag1')
        const updatedTime = manager.get('test')!.updatedAt
        expect(updatedTime).toBeGreaterThan(initialTime)
      })
    })

    it('should throw when removing tags from non-existent session', () => {
      expect(() => manager.removeTags('non-existent', 'tag')).toThrow('Session not found')
    })
  })

  describe('getAllTags', () => {
    it('should return all unique tags across sessions', () => {
      manager.create({ id: 'session-1' })
      manager.create({ id: 'session-2' })
      manager.create({ id: 'session-3' })

      manager.addTags('session-1', 'refactor', 'auth')
      manager.addTags('session-2', 'api', 'refactor')
      manager.addTags('session-3', 'test', 'auth')

      const allTags = manager.getAllTags()

      expect(allTags).toEqual(['api', 'auth', 'refactor', 'test'])
    })

    it('should return empty array when no sessions have tags', () => {
      manager.create({ id: 'session-1' })
      manager.create({ id: 'session-2' })

      const allTags = manager.getAllTags()

      expect(allTags).toEqual([])
    })

    it('should return sorted tags', () => {
      manager.create({ id: 'session-1' })
      manager.addTags('session-1', 'zebra', 'apple', 'banana')

      const allTags = manager.getAllTags()

      expect(allTags).toEqual(['apple', 'banana', 'zebra'])
    })

    it('should handle sessions with undefined tags', () => {
      manager.create({ id: 'session-1' })
      manager.create({ id: 'session-2' })
      
      const session1 = manager.get('session-1')!
      session1.tags = undefined
      
      manager.addTags('session-2', 'test')

      const allTags = manager.getAllTags()

      expect(allTags).toEqual(['test'])
    })
  })

  describe('getCostStats', () => {
    it('should return cost statistics for a session', () => {
      manager.create({ id: 'test' })
      manager.updateCost('test', 0.05)
      manager.updateCost('test', 0.03)
      manager.updateUsage('test', { inputTokens: 1000, outputTokens: 500 })
      
      // 添加消息来模拟轮次
      manager.addUserMessage('test', 'Message 1')
      manager.addAssistantMessage('test', [{ type: 'text', text: 'Response 1' }])
      manager.addUserMessage('test', 'Message 2')
      manager.addAssistantMessage('test', [{ type: 'text', text: 'Response 2' }])

      const stats = manager.getCostStats('test')

      expect(stats.total_cost_usd).toBeCloseTo(0.08, 2)
      expect(stats.num_turns).toBe(2)
      expect(stats.cost_per_turn).toBeCloseTo(0.04, 2)
      expect(stats.input_tokens).toBe(1000)
      expect(stats.output_tokens).toBe(500)
      expect(stats.total_tokens).toBe(1500)
    })

    it('should handle session with no cost', () => {
      manager.create({ id: 'test' })

      const stats = manager.getCostStats('test')

      expect(stats.total_cost_usd).toBe(0)
      expect(stats.num_turns).toBe(0)
      expect(stats.cost_per_turn).toBe(0)
    })

    it('should calculate turns from messages when num_turns not set', () => {
      manager.create({ id: 'test' })
      manager.addUserMessage('test', 'Message 1')
      manager.addAssistantMessage('test', [{ type: 'text', text: 'Response 1' }])
      manager.addUserMessage('test', 'Message 2')
      manager.addAssistantMessage('test', [{ type: 'text', text: 'Response 2' }])
      manager.addUserMessage('test', 'Message 3')

      const stats = manager.getCostStats('test')

      expect(stats.num_turns).toBe(2) // floor(5 / 2)
    })

    it('should throw when getting stats for non-existent session', () => {
      expect(() => manager.getCostStats('non-existent')).toThrow('Session not found')
    })
  })

  describe('getTotalCostStats', () => {
    it('should return total cost statistics across all sessions', () => {
      // 创建多个会话
      manager.create({ id: 'session-1' })
      manager.create({ id: 'session-2' })
      manager.create({ id: 'session-3' })

      // 添加成本和使用数据
      manager.updateCost('session-1', 0.05)
      manager.updateUsage('session-1', { inputTokens: 1000, outputTokens: 500 })
      manager.addUserMessage('session-1', 'Message 1')
      manager.addAssistantMessage('session-1', [{ type: 'text', text: 'Response 1' }])

      manager.updateCost('session-2', 0.03)
      manager.updateUsage('session-2', { inputTokens: 800, outputTokens: 400 })
      manager.addUserMessage('session-2', 'Message 1')
      manager.addAssistantMessage('session-2', [{ type: 'text', text: 'Response 1' }])

      manager.updateCost('session-3', 0.02)
      manager.updateUsage('session-3', { inputTokens: 600, outputTokens: 300 })

      const stats = manager.getTotalCostStats()

      expect(stats.total_sessions).toBe(3)
      expect(stats.total_cost_usd).toBeCloseTo(0.10, 2)
      expect(stats.total_turns).toBe(2)
      expect(stats.avg_cost_per_session).toBeCloseTo(0.0333, 4)
      expect(stats.avg_cost_per_turn).toBeCloseTo(0.05, 2)
      expect(stats.total_input_tokens).toBe(2400)
      expect(stats.total_output_tokens).toBe(1200)
      expect(stats.total_tokens).toBe(3600)
    })

    it('should handle empty session list', () => {
      const stats = manager.getTotalCostStats()

      expect(stats.total_sessions).toBe(0)
      expect(stats.total_cost_usd).toBe(0)
      expect(stats.total_turns).toBe(0)
      expect(stats.avg_cost_per_session).toBe(0)
      expect(stats.avg_cost_per_turn).toBe(0)
      expect(stats.total_tokens).toBe(0)
    })

    it('should handle sessions with no cost', () => {
      manager.create({ id: 'session-1' })
      manager.create({ id: 'session-2' })

      const stats = manager.getTotalCostStats()

      expect(stats.total_sessions).toBe(2)
      expect(stats.total_cost_usd).toBe(0)
      expect(stats.avg_cost_per_session).toBe(0)
    })
  })

  describe('generateCostReport', () => {
    beforeEach(() => {
      // 创建测试会话
      manager.create({ id: 'session-1' })
      manager.addTags('session-1', 'refactor', 'auth')
      manager.updateCost('session-1', 0.05)
      manager.updateUsage('session-1', { inputTokens: 1000, outputTokens: 500 })
      manager.addUserMessage('session-1', 'Message 1')
      manager.addAssistantMessage('session-1', [{ type: 'text', text: 'Response 1' }])

      manager.create({ id: 'session-2' })
      manager.addTags('session-2', 'api')
      manager.updateCost('session-2', 0.03)
      manager.updateUsage('session-2', { inputTokens: 800, outputTokens: 400 })
      manager.addUserMessage('session-2', 'Message 1')
      manager.addAssistantMessage('session-2', [{ type: 'text', text: 'Response 1' }])

      manager.create({ id: 'session-3' })
      manager.addTags('session-3', 'refactor')
      manager.updateCost('session-3', 0.02)
      manager.updateUsage('session-3', { inputTokens: 600, outputTokens: 300 })
    })

    it('should generate text format report by default', () => {
      const report = manager.generateCostReport()

      expect(report).toContain('成本报告')
      expect(report).toContain('总会话数: 3')
      expect(report).toContain('总成本: $0.1000')
      expect(report).toContain('会话详情')
      expect(report).toContain('session-1')
      expect(report).toContain('session-2')
      expect(report).toContain('session-3')
    })

    it('should generate JSON format report', () => {
      const report = manager.generateCostReport({ format: 'json' })
      const data = JSON.parse(report)

      expect(data.total_sessions).toBe(3)
      expect(data.total_cost_usd).toBeCloseTo(0.10, 2)
      expect(data.sessions).toHaveLength(3)
      expect(data.sessions[0]).toHaveProperty('id')
      expect(data.sessions[0]).toHaveProperty('cost_usd')
      expect(data.sessions[0]).toHaveProperty('turns')
      expect(data.sessions[0]).toHaveProperty('tokens')
    })

    it('should filter by session IDs', () => {
      const report = manager.generateCostReport({ 
        sessionIds: ['session-1', 'session-2'],
        format: 'json'
      })
      const data = JSON.parse(report)

      expect(data.total_sessions).toBe(2)
      expect(data.sessions).toHaveLength(2)
      expect(data.sessions.map((s: any) => s.id)).toContain('session-1')
      expect(data.sessions.map((s: any) => s.id)).toContain('session-2')
      expect(data.sessions.map((s: any) => s.id)).not.toContain('session-3')
    })

    it('should filter by tags', () => {
      const report = manager.generateCostReport({ 
        tags: ['refactor'],
        format: 'json'
      })
      const data = JSON.parse(report)

      expect(data.total_sessions).toBe(2)
      expect(data.sessions).toHaveLength(2)
      expect(data.sessions.map((s: any) => s.id)).toContain('session-1')
      expect(data.sessions.map((s: any) => s.id)).toContain('session-3')
      expect(data.sessions.map((s: any) => s.id)).not.toContain('session-2')
    })

    it('should sort sessions by cost in descending order', () => {
      const report = manager.generateCostReport({ format: 'json' })
      const data = JSON.parse(report)

      expect(data.sessions[0].id).toBe('session-1') // $0.05
      expect(data.sessions[1].id).toBe('session-2') // $0.03
      expect(data.sessions[2].id).toBe('session-3') // $0.02
    })

    it('should include tags in report', () => {
      const report = manager.generateCostReport()

      expect(report).toContain('refactor, auth')
      expect(report).toContain('api')
    })

    it('should handle empty session list', () => {
      manager.clear()
      const report = manager.generateCostReport()

      expect(report).toContain('总会话数: 0')
      expect(report).toContain('总成本: $0.0000')
    })

    it('should calculate averages correctly', () => {
      const report = manager.generateCostReport()

      expect(report).toContain('平均每会话成本: $0.0333')
      // 总轮次是 2（session-1 有 1 轮，session-2 有 1 轮，session-3 有 0 轮）
      // 平均每轮成本 = 0.10 / 2 = 0.05
      expect(report).toContain('平均每轮成本: $0.0500')
    })
  })
})
