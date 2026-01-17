/**
 * 会话分支功能示例
 * 
 * 演示如何使用 SessionManager 的分支功能
 */

import { SessionManager } from '../src/session/manager'

// 创建会话管理器
const manager = new SessionManager()

// 创建主会话
const mainSession = manager.create({
  id: 'main-session',
  cwd: '/project',
  agentType: 'build'
})

console.log('创建主会话:', mainSession.id)

// 添加一些消息
manager.addUserMessage(mainSession.id, '请帮我重构这个函数')
manager.addAssistantMessage(mainSession.id, [
  { type: 'text', text: '好的，我来帮你重构' }
])
manager.addUserMessage(mainSession.id, '使用函数式编程风格')
manager.addAssistantMessage(mainSession.id, [
  { type: 'text', text: '这是函数式版本...' }
])

console.log('主会话消息数:', mainSession.messages.length)

// 从第 2 条消息创建分支（尝试不同的重构方案）
const branchedSession = manager.branch(mainSession.id, 1, {
  tags: ['experiment', 'functional-style']
})

console.log('\n创建分支会话:', branchedSession.id)
console.log('分支点:', branchedSession.branch_point)
console.log('父会话:', branchedSession.parent_session_id)
console.log('分支消息数:', branchedSession.messages.length)
console.log('分支标签:', branchedSession.tags)

// 在分支中尝试不同的方案
manager.addUserMessage(branchedSession.id, '改用面向对象风格')
manager.addAssistantMessage(branchedSession.id, [
  { type: 'text', text: '这是面向对象版本...' }
])

console.log('\n添加新消息后:')
console.log('主会话消息数:', mainSession.messages.length) // 仍然是 4
console.log('分支消息数:', branchedSession.messages.length) // 现在是 4

// 按标签搜索会话
const experimentSessions = manager.findByTags(['experiment'])
console.log('\n实验性会话数:', experimentSessions.length)

// 更新成本
manager.updateCost(mainSession.id, 0.05)
manager.updateCost(branchedSession.id, 0.03)

console.log('\n成本统计:')
console.log('主会话成本:', mainSession.total_cost_usd)
console.log('分支成本:', branchedSession.total_cost_usd)

// 列出所有会话
console.log('\n所有会话:')
manager.list().forEach(session => {
  console.log(`- ${session.id}: ${session.messages.length} 条消息, 标签: ${session.tags?.join(', ')}`)
})
