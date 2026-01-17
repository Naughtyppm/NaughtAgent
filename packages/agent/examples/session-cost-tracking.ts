/**
 * 会话成本追踪示例
 * 
 * 演示如何使用 SessionManager 的成本追踪功能
 */

import { SessionManager } from '../src/session/manager'

// 创建会话管理器
const manager = new SessionManager()

// 创建几个会话并模拟使用
console.log('创建会话并模拟使用...\n')

// 会话 1: 重构任务
const session1 = manager.create({ id: 'refactor-auth' })
manager.addTags('refactor-auth', 'refactor', 'auth')
manager.addUserMessage('refactor-auth', '请帮我重构认证模块')
manager.addAssistantMessage('refactor-auth', [{ type: 'text', text: '好的，我来帮你重构' }])
manager.updateUsage('refactor-auth', { inputTokens: 1500, outputTokens: 800 })
manager.updateCost('refactor-auth', 0.0345) // 第一轮成本

manager.addUserMessage('refactor-auth', '继续优化性能')
manager.addAssistantMessage('refactor-auth', [{ type: 'text', text: '已优化性能' }])
manager.updateUsage('refactor-auth', { inputTokens: 1200, outputTokens: 600 })
manager.updateCost('refactor-auth', 0.0270) // 第二轮成本

// 会话 2: API 开发
const session2 = manager.create({ id: 'api-development' })
manager.addTags('api-development', 'api', 'development')
manager.addUserMessage('api-development', '创建用户 API')
manager.addAssistantMessage('api-development', [{ type: 'text', text: 'API 已创建' }])
manager.updateUsage('api-development', { inputTokens: 2000, outputTokens: 1000 })
manager.updateCost('api-development', 0.0450)

manager.addUserMessage('api-development', '添加测试')
manager.addAssistantMessage('api-development', [{ type: 'text', text: '测试已添加' }])
manager.updateUsage('api-development', { inputTokens: 1800, outputTokens: 900 })
manager.updateCost('api-development', 0.0405)

manager.addUserMessage('api-development', '优化错误处理')
manager.addAssistantMessage('api-development', [{ type: 'text', text: '错误处理已优化' }])
manager.updateUsage('api-development', { inputTokens: 1500, outputTokens: 750 })
manager.updateCost('api-development', 0.0338)

// 会话 3: 文档编写
const session3 = manager.create({ id: 'documentation' })
manager.addTags('documentation', 'docs', 'refactor')
manager.addUserMessage('documentation', '编写 API 文档')
manager.addAssistantMessage('documentation', [{ type: 'text', text: '文档已完成' }])
manager.updateUsage('documentation', { inputTokens: 1000, outputTokens: 500 })
manager.updateCost('documentation', 0.0225)

// 1. 获取单个会话的成本统计
console.log('='.repeat(60))
console.log('单个会话成本统计')
console.log('='.repeat(60))

const stats1 = manager.getCostStats('refactor-auth')
console.log('\n会话: refactor-auth')
console.log(`总成本: $${stats1.total_cost_usd.toFixed(4)}`)
console.log(`轮次: ${stats1.num_turns}`)
console.log(`每轮成本: $${stats1.cost_per_turn.toFixed(4)}`)
console.log(`输入 Token: ${stats1.input_tokens}`)
console.log(`输出 Token: ${stats1.output_tokens}`)
console.log(`总 Token: ${stats1.total_tokens}`)

const stats2 = manager.getCostStats('api-development')
console.log('\n会话: api-development')
console.log(`总成本: $${stats2.total_cost_usd.toFixed(4)}`)
console.log(`轮次: ${stats2.num_turns}`)
console.log(`每轮成本: $${stats2.cost_per_turn.toFixed(4)}`)
console.log(`总 Token: ${stats2.total_tokens}`)

// 2. 获取所有会话的总成本统计
console.log('\n' + '='.repeat(60))
console.log('总成本统计')
console.log('='.repeat(60))

const totalStats = manager.getTotalCostStats()
console.log(`\n总会话数: ${totalStats.total_sessions}`)
console.log(`总成本: $${totalStats.total_cost_usd.toFixed(4)}`)
console.log(`总轮次: ${totalStats.total_turns}`)
console.log(`平均每会话成本: $${totalStats.avg_cost_per_session.toFixed(4)}`)
console.log(`平均每轮成本: $${totalStats.avg_cost_per_turn.toFixed(4)}`)
console.log(`总输入 Token: ${totalStats.total_input_tokens}`)
console.log(`总输出 Token: ${totalStats.total_output_tokens}`)
console.log(`总 Token: ${totalStats.total_tokens}`)

// 3. 生成文本格式的成本报告
console.log('\n')
const textReport = manager.generateCostReport()
console.log(textReport)

// 4. 生成 JSON 格式的成本报告
console.log('\n' + '='.repeat(60))
console.log('JSON 格式报告')
console.log('='.repeat(60))
const jsonReport = manager.generateCostReport({ format: 'json' })
console.log(jsonReport)

// 5. 按标签筛选的成本报告
console.log('\n' + '='.repeat(60))
console.log('按标签筛选（refactor）')
console.log('='.repeat(60))
const refactorReport = manager.generateCostReport({ tags: ['refactor'] })
console.log(refactorReport)

// 6. 按会话 ID 筛选的成本报告
console.log('\n' + '='.repeat(60))
console.log('按会话 ID 筛选')
console.log('='.repeat(60))
const selectedReport = manager.generateCostReport({ 
  sessionIds: ['refactor-auth', 'api-development'] 
})
console.log(selectedReport)

// 7. 实际使用场景：监控成本
console.log('\n' + '='.repeat(60))
console.log('成本监控示例')
console.log('='.repeat(60))

// 检查是否超过预算
const BUDGET_LIMIT = 0.15 // $0.15 预算
const currentCost = manager.getTotalCostStats().total_cost_usd

console.log(`\n当前总成本: $${currentCost.toFixed(4)}`)
console.log(`预算限制: $${BUDGET_LIMIT.toFixed(4)}`)

if (currentCost > BUDGET_LIMIT) {
  console.log('⚠️  警告：已超出预算！')
  console.log(`超出金额: $${(currentCost - BUDGET_LIMIT).toFixed(4)}`)
} else {
  console.log('✅ 成本在预算范围内')
  console.log(`剩余预算: $${(BUDGET_LIMIT - currentCost).toFixed(4)}`)
}

// 找出成本最高的会话
const allSessions = manager.list()
const sortedByCost = allSessions
  .map(s => ({
    id: s.id,
    cost: s.total_cost_usd || 0,
    tags: s.tags
  }))
  .sort((a, b) => b.cost - a.cost)

console.log('\n成本最高的会话:')
sortedByCost.slice(0, 3).forEach((s, i) => {
  console.log(`${i + 1}. ${s.id}: $${s.cost.toFixed(4)} (${s.tags?.join(', ') || '无标签'})`)
})
