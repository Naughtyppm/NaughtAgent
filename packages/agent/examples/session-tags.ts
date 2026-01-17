/**
 * 会话标签管理示例
 * 
 * 演示如何使用标签来组织和搜索会话
 */

import { SessionManager } from '../src/session/manager'

// 创建会话管理器
const manager = new SessionManager()

// 创建几个会话
const session1 = manager.create({ id: 'refactor-auth' })
const session2 = manager.create({ id: 'add-api' })
const session3 = manager.create({ id: 'fix-bug' })

console.log('=== 添加标签 ===')

// 为会话添加标签
manager.addTags('refactor-auth', 'refactor', 'auth', 'backend')
console.log('会话 1 标签:', session1.tags)

manager.addTags('add-api', 'feature', 'api', 'backend')
console.log('会话 2 标签:', session2.tags)

manager.addTags('fix-bug', 'bugfix', 'frontend')
console.log('会话 3 标签:', session3.tags)

console.log('\n=== 搜索会话 ===')

// 按标签搜索
const backendSessions = manager.findByTags(['backend'])
console.log('后端相关会话:', backendSessions.map(s => s.id))

const refactorSessions = manager.findByTags(['refactor'])
console.log('重构相关会话:', refactorSessions.map(s => s.id))

const authBackendSessions = manager.findByTags(['auth', 'backend'])
console.log('认证+后端会话:', authBackendSessions.map(s => s.id))

console.log('\n=== 获取所有标签 ===')

const allTags = manager.getAllTags()
console.log('所有使用过的标签:', allTags)

console.log('\n=== 移除标签 ===')

// 移除标签
manager.removeTags('refactor-auth', 'backend')
console.log('移除 backend 后，会话 1 标签:', session1.tags)

// 再次搜索
const backendSessionsAfter = manager.findByTags(['backend'])
console.log('后端相关会话（移除后）:', backendSessionsAfter.map(s => s.id))

console.log('\n=== 批量操作 ===')

// 批量添加标签
manager.addTags('fix-bug', 'urgent', 'high-priority')
console.log('会话 3 标签（批量添加后）:', session3.tags)

// 批量移除标签
manager.removeTags('fix-bug', 'urgent', 'high-priority')
console.log('会话 3 标签（批量移除后）:', session3.tags)

console.log('\n=== 标签自动补全场景 ===')

// 获取所有标签用于自动补全
const availableTags = manager.getAllTags()
console.log('可用标签（用于自动补全）:', availableTags)

// 模拟用户输入 "ba"，过滤匹配的标签
const userInput = 'ba'
const suggestions = availableTags.filter(tag => tag.startsWith(userInput))
console.log(`输入 "${userInput}" 的建议:`, suggestions)

console.log('\n=== 会话分支与标签 ===')

// 添加一些消息
manager.addUserMessage('refactor-auth', '重构认证模块')
manager.addAssistantMessage('refactor-auth', [{ type: 'text', text: '好的，开始重构' }])
manager.addUserMessage('refactor-auth', '添加 OAuth 支持')

// 创建分支，自动添加 'branch' 标签
const branch = manager.branch('refactor-auth', 1, { 
  tags: ['experiment', 'oauth'] 
})
console.log('分支会话标签:', branch.tags)

// 搜索实验性会话
const experimentSessions = manager.findByTags(['experiment'])
console.log('实验性会话:', experimentSessions.map(s => s.id))

console.log('\n=== 完成 ===')
