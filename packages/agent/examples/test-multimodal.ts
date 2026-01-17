/**
 * 多模态功能测试
 * 
 * 测试图片识别功能
 */

import { SessionManager } from '../src/session/manager'
import { createImageMessage } from '../src/session/message'
import { createAgentLoop } from '../src/agent/loop'
import { createAnthropicProvider } from '../src/provider/anthropic'
import type { AgentDefinition } from '../src/agent/agent'

console.log('='.repeat(80))
console.log('多模态功能测试')
console.log('='.repeat(80))

// 检查环境变量
const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('❌ 错误: 需要设置 ANTHROPIC_API_KEY 环境变量')
  console.log('提示: export ANTHROPIC_API_KEY=your-api-key')
  process.exit(1)
}

// 创建会话管理器
const manager = new SessionManager()
const session = manager.create({
  id: 'multimodal-test',
  cwd: process.cwd(),
  agentType: 'build'
})

console.log('\n✅ 创建会话:', session.id)

// 创建一个简单的红色像素图片（1x1 PNG）
const redPixelBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

// 添加图片消息
const imageMsg = createImageMessage(redPixelBase64, 'image/png')
session.messages.push(imageMsg)
console.log('✅ 添加图片消息')

// 添加文本提问
manager.addUserMessage(session.id, '这张图片是什么颜色的？')
console.log('✅ 添加文本消息')

// 创建 Provider
const provider = createAnthropicProvider({
  apiKey,
})
console.log('✅ 创建 Anthropic Provider')

// 创建 Agent 定义
const agentDef: AgentDefinition = {
  id: 'multimodal-agent',
  name: '多模态测试 Agent',
  description: '测试图片识别',
  instructions: '你是一个图片分析助手，请仔细观察图片并回答问题。',
  tools: [],
  model: {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7,
    maxTokens: 1000,
  },
}

// 创建 Agent Loop
const loop = createAgentLoop({
  definition: agentDef,
  session,
  provider,
  runConfig: {
    sessionId: session.id,
    cwd: process.cwd(),
  },
})

console.log('\n📝 开始对话...')
console.log('-'.repeat(80))

// 运行 Agent
try {
  for await (const event of loop.run('请分析图片')) {
    switch (event.type) {
      case 'text':
        console.log('🤖 Agent:', event.content)
        break
      case 'error':
        console.error('❌ 错误:', event.error.message)
        break
      case 'done':
        console.log('\n✅ 完成')
        console.log('Token 使用:', event.usage)
        break
    }
  }
} catch (error) {
  console.error('❌ 执行错误:', error)
}

console.log('\n' + '='.repeat(80))
console.log('测试完成')
console.log('='.repeat(80))
