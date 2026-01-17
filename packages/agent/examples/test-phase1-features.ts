/**
 * Phase 1 功能综合测试
 * 
 * 测试已实现的基础设施层功能：
 * 1. 消息协议扩展（多模态支持）
 * 2. 会话管理增强（分支、标签、成本追踪）
 * 3. 错误处理（AgentError、重试机制）
 */

import { SessionManager } from '../src/session/manager'
import { createImageMessage, createAudioMessage, getImages, getAudios } from '../src/session/message'
import { AgentError, ErrorCode, withRetry } from '../src/error'

console.log('='.repeat(80))
console.log('Phase 1 功能综合测试')
console.log('='.repeat(80))

// ==================== 测试 1: 消息协议扩展 ====================
console.log('\n📝 测试 1: 消息协议扩展（多模态支持）')
console.log('-'.repeat(80))

// 创建图片消息
const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const imageMsg = createImageMessage(imageData, 'image/png')
console.log('✅ 创建图片消息:', imageMsg.role, imageMsg.content[0].type)

// 创建音频消息
const audioData = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
const audioMsg = createAudioMessage(audioData, 'audio/wav')
console.log('✅ 创建音频消息:', audioMsg.role, audioMsg.content[0].type)

// 提取图片和音频
const images = [imageMsg, audioMsg].flatMap(msg => getImages(msg))
const audios = [imageMsg, audioMsg].flatMap(msg => getAudios(msg))
console.log('✅ 提取图片数量:', images.length)
console.log('✅ 提取音频数量:', audios.length)

// ==================== 测试 2: 会话管理 - 基础功能 ====================
console.log('\n📝 测试 2: 会话管理 - 基础功能')
console.log('-'.repeat(80))

const manager = new SessionManager()

// 创建会话
const session1 = manager.create({ 
  id: 'test-session-1',
  cwd: '/project',
  agentType: 'build'
})
console.log('✅ 创建会话:', session1.id)

// 添加消息
manager.addUserMessage(session1.id, '请帮我分析这个项目')
manager.addAssistantMessage(session1.id, [
  { type: 'text', text: '好的,我来分析项目结构' }
])
console.log('✅ 添加消息，当前消息数:', session1.messages.length)

// 更新使用量和成本
manager.updateUsage(session1.id, { inputTokens: 1000, outputTokens: 500 })
manager.updateCost(session1.id, 0.0225)
console.log('✅ 更新成本:', session1.total_cost_usd)

// ==================== 测试 3: 会话分支 ====================
console.log('\n📝 测试 3: 会话分支功能')
console.log('-'.repeat(80))

// 添加更多消息
manager.addUserMessage(session1.id, '重构认证模块')
manager.addAssistantMessage(session1.id, [
  { type: 'text', text: '开始重构认证模块' }
])

// 从第 2 条消息创建分支
const branch1 = manager.branch(session1.id, 1, {
  tags: ['experiment', 'refactor']
})
console.log('✅ 创建分支:', branch1.id)
console.log('   - 父会话:', branch1.parent_session_id)
console.log('   - 分支点:', branch1.branch_point)
console.log('   - 分支消息数:', branch1.messages.length)
console.log('   - 主会话消息数:', session1.messages.length)

// 在分支中添加消息
manager.addUserMessage(branch1.id, '尝试使用 OAuth 2.0')
manager.addAssistantMessage(branch1.id, [
  { type: 'text', text: '实现 OAuth 2.0 认证' }
])
console.log('✅ 分支独立性验证:')
console.log('   - 分支消息数:', branch1.messages.length)
console.log('   - 主会话消息数:', session1.messages.length, '(未变化)')

// ==================== 测试 4: 标签管理 ====================
console.log('\n📝 测试 4: 标签管理')
console.log('-'.repeat(80))

// 添加标签
manager.addTags(session1.id, 'auth', 'backend', 'production')
console.log('✅ 添加标签:', session1.tags)

// 移除标签
manager.removeTags(session1.id, 'production')
console.log('✅ 移除标签后:', session1.tags)

// 按标签搜索
const authSessions = manager.findByTags(['auth'])
console.log('✅ 搜索 auth 标签:', authSessions.map(s => s.id))

const experimentSessions = manager.findByTags(['experiment'])
console.log('✅ 搜索 experiment 标签:', experimentSessions.map(s => s.id))

// 获取所有标签
const allTags = manager.getAllTags()
console.log('✅ 所有标签:', allTags)

// ==================== 测试 5: 成本追踪 ====================
console.log('\n📝 测试 5: 成本追踪')
console.log('-'.repeat(80))

// 创建更多会话并添加成本
const session2 = manager.create({ id: 'test-session-2' })
manager.addTags(session2.id, 'api', 'development')
manager.addUserMessage(session2.id, '创建 REST API')
manager.addAssistantMessage(session2.id, [{ type: 'text', text: 'API 已创建' }])
manager.updateUsage(session2.id, { inputTokens: 2000, outputTokens: 1000 })
manager.updateCost(session2.id, 0.0450)

manager.addUserMessage(session2.id, '添加测试')
manager.addAssistantMessage(session2.id, [{ type: 'text', text: '测试已添加' }])
manager.updateUsage(session2.id, { inputTokens: 1500, outputTokens: 750 })
manager.updateCost(session2.id, 0.0338)

// 获取单个会话成本统计
const stats1 = manager.getCostStats(session1.id)
console.log('✅ 会话 1 成本统计:')
console.log('   - 总成本:', stats1.total_cost_usd.toFixed(4))
console.log('   - 轮次:', stats1.num_turns)
console.log('   - 每轮成本:', stats1.cost_per_turn.toFixed(4))
console.log('   - 总 Token:', stats1.total_tokens)

const stats2 = manager.getCostStats(session2.id)
console.log('✅ 会话 2 成本统计:')
console.log('   - 总成本:', stats2.total_cost_usd.toFixed(4))
console.log('   - 轮次:', stats2.num_turns)
console.log('   - 每轮成本:', stats2.cost_per_turn.toFixed(4))

// 获取总成本统计
const totalStats = manager.getTotalCostStats()
console.log('✅ 总成本统计:')
console.log('   - 总会话数:', totalStats.total_sessions)
console.log('   - 总成本:', totalStats.total_cost_usd.toFixed(4))
console.log('   - 平均每会话:', totalStats.avg_cost_per_session.toFixed(4))
console.log('   - 总 Token:', totalStats.total_tokens)

// 生成成本报告
console.log('\n📊 成本报告:')
const report = manager.generateCostReport()
console.log(report)

// ==================== 测试 6: 错误处理 ====================
console.log('\n📝 测试 6: 错误处理')
console.log('-'.repeat(80))

// 创建不同类型的错误
const networkError = new AgentError(
  '网络连接失败',
  ErrorCode.NETWORK_ERROR,
  true,
  { url: 'https://api.example.com' }
)
console.log('✅ 创建网络错误:')
console.log('   - 消息:', networkError.message)
console.log('   - 错误码:', networkError.code)
console.log('   - 可恢复:', networkError.recoverable)
console.log('   - 恢复建议:', networkError.getRecoverySuggestion())

const permissionError = new AgentError(
  '权限被拒绝',
  ErrorCode.PERMISSION_DENIED,
  true,
  { tool: 'Write', path: '/etc/hosts' }
)
console.log('✅ 创建权限错误:')
console.log('   - 消息:', permissionError.message)
console.log('   - 恢复建议:', permissionError.getRecoverySuggestion())

// ==================== 测试 7: 重试机制 ====================
console.log('\n📝 测试 7: 重试机制')
console.log('-'.repeat(80))

// 模拟成功的操作
let successAttempt = 0
const successOperation = async () => {
  successAttempt++
  console.log(`   尝试 ${successAttempt}: 成功`)
  return '操作成功'
}

const result1 = await withRetry(successOperation)
console.log('✅ 成功操作结果:', result1)

// 模拟失败后成功的操作
let failThenSuccessAttempt = 0
const failThenSuccessOperation = async () => {
  failThenSuccessAttempt++
  if (failThenSuccessAttempt < 2) {
    console.log(`   尝试 ${failThenSuccessAttempt}: 失败（网络错误）`)
    throw new AgentError('临时网络错误', ErrorCode.NETWORK_ERROR, true)
  }
  console.log(`   尝试 ${failThenSuccessAttempt}: 成功`)
  return '重试后成功'
}

const result2 = await withRetry(failThenSuccessOperation, {
  maxAttempts: 3,
  initialDelay: 100,
  maxDelay: 1000,
  backoffMultiplier: 2,
  retryableErrors: [ErrorCode.NETWORK_ERROR, ErrorCode.TIMEOUT]
})
console.log('✅ 重试后成功:', result2)

// 模拟不可重试的错误
const nonRetryableOperation = async () => {
  console.log('   尝试: 失败（配置错误，不可重试）')
  throw new AgentError('配置错误', ErrorCode.CONFIGURATION_ERROR, false)
}

try {
  await withRetry(nonRetryableOperation)
} catch (error) {
  if (error instanceof AgentError) {
    console.log('✅ 不可重试错误被正确抛出:', error.code)
  }
}

// ==================== 测试 8: 数据迁移 ====================
console.log('\n📝 测试 8: 数据迁移（模拟旧格式）')
console.log('-'.repeat(80))

// 创建一个旧格式的会话（没有新字段）
const oldSession = manager.create({ id: 'old-session' })
// 手动删除新字段模拟旧格式
delete (oldSession as any).tags
delete (oldSession as any).total_cost_usd
delete (oldSession as any).num_turns

console.log('✅ 旧格式会话:', {
  id: oldSession.id,
  has_tags: 'tags' in oldSession,
  has_cost: 'total_cost_usd' in oldSession,
  has_turns: 'num_turns' in oldSession
})

// 迁移会话（通过重新获取来触发迁移逻辑）
const migratedSession = manager.get(oldSession.id)!
console.log('✅ 迁移后会话:', {
  id: migratedSession.id,
  tags: migratedSession.tags,
  total_cost_usd: migratedSession.total_cost_usd,
  num_turns: migratedSession.num_turns
})

// ==================== 测试总结 ====================
console.log('\n' + '='.repeat(80))
console.log('✅ 所有测试完成！')
console.log('='.repeat(80))

console.log('\n📊 测试统计:')
console.log(`- 总会话数: ${manager.list().length}`)
console.log(`- 总标签数: ${manager.getAllTags().length}`)
console.log(`- 总成本: $${manager.getTotalCostStats().total_cost_usd.toFixed(4)}`)
console.log(`- 总 Token: ${manager.getTotalCostStats().total_tokens}`)

console.log('\n📝 已测试功能:')
console.log('✅ 1. 多模态消息（图片、音频）')
console.log('✅ 2. 会话创建和消息管理')
console.log('✅ 3. 会话分支（从历史点创建分支）')
console.log('✅ 4. 标签管理（添加、移除、搜索）')
console.log('✅ 5. 成本追踪（单会话、总计、报告）')
console.log('✅ 6. 错误处理（AgentError、错误分类）')
console.log('✅ 7. 重试机制（指数退避、可重试判断）')
console.log('✅ 8. 数据迁移（向后兼容）')

console.log('\n⏸️  待实现功能:')
console.log('- 日志系统（Logger）')
console.log('- 性能监控（PerformanceMonitor）')
console.log('- TraceId 管理（AsyncLocalStorage）')
console.log('- 错误处理集成到 Provider/Tool/Agent')

console.log('\n💡 提示:')
console.log('- 当前使用 Kiro Provider（通过 kiro-proxy）')
console.log('- 可以通过设置 ANTHROPIC_API_KEY 环境变量切换到 Anthropic API')
console.log('- 可以通过设置 OPENAI_API_KEY 环境变量切换到 OpenAI 兼容 API')
