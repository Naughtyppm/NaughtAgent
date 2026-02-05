/**
 * useMessages Hook 属性测试
 *
 * 使用 fast-check 进行属性测试，验证消息管理的核心属性：
 * - 属性 7: 流式消息累积
 *
 * 测试框架：fast-check
 *
 * 功能: ink-terminal-ui, 属性 7: 流式消息累积
 * 验证: 需求 5.5
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import type { Message, AIMessage } from '../../../../src/cli/ink/types.js'

// ============================================================================
// 测试用消息管理器（与单元测试中的 MessageManager 一致）
// ============================================================================

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 消息管理器类
 * 模拟 useMessages hook 的核心逻辑
 */
class MessageManager {
  private messages: Message[] = []

  getMessages(): Message[] {
    return [...this.messages]
  }

  addAIMessage(content: string, model: string): string {
    const id = generateId()
    this.messages = [
      ...this.messages,
      {
        id,
        type: 'ai' as const,
        content,
        model,
        isStreaming: true,
        timestamp: Date.now(),
      },
    ]
    return id
  }

  updateAIMessage(id: string, content: string): void {
    this.messages = this.messages.map((msg) => {
      if (msg.id === id && msg.type === 'ai') {
        return { ...msg, content }
      }
      return msg
    })
  }

  finishAIMessage(id: string): void {
    this.messages = this.messages.map((msg) => {
      if (msg.id === id && msg.type === 'ai') {
        return { ...msg, isStreaming: false }
      }
      return msg
    })
  }

  clear(): void {
    this.messages = []
  }
}

// ============================================================================
// Arbitraries (数据生成器)
// ============================================================================

/**
 * 文本块生成器
 * 生成任意非空字符串作为流式文本块
 */
const textChunkArb: fc.Arbitrary<string> = fc.string({ minLength: 0, maxLength: 200 })

/**
 * 非空文本块生成器
 */
const nonEmptyTextChunkArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 200 })

/**
 * 文本块序列生成器
 * 生成 1-50 个文本块的序列
 */
const textChunkSequenceArb: fc.Arbitrary<string[]> = fc.array(textChunkArb, {
  minLength: 1,
  maxLength: 50,
})

/**
 * 非空文本块序列生成器
 */
const nonEmptyTextChunkSequenceArb: fc.Arbitrary<string[]> = fc.array(nonEmptyTextChunkArb, {
  minLength: 1,
  maxLength: 50,
})

/**
 * 模型名称生成器
 */
const modelNameArb: fc.Arbitrary<string> = fc.constantFrom(
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
  'gpt-4',
  'gpt-4-turbo'
)

/**
 * 包含特殊字符的文本块生成器
 */
const specialCharTextChunkArb: fc.Arbitrary<string> = fc.oneof(
  fc.string({ minLength: 0, maxLength: 100 }),
  fc.constant(''),
  fc.constant('\n'),
  fc.constant('\t'),
  fc.constant('  '),
  fc.constant('```typescript\nconst x = 1;\n```'),
  fc.constant('**bold** and *italic*'),
  fc.constant('中文文本'),
  fc.constant('emoji: 🎉🚀✨'),
  fc.constant('special: <>&"\''),
  fc.unicodeString({ minLength: 0, maxLength: 50 })
)

/**
 * 包含特殊字符的文本块序列生成器
 */
const specialCharSequenceArb: fc.Arbitrary<string[]> = fc.array(specialCharTextChunkArb, {
  minLength: 1,
  maxLength: 30,
})

// ============================================================================
// 属性 7: 流式消息累积
// ============================================================================

describe('useMessages 属性测试', () => {
  let manager: MessageManager

  beforeEach(() => {
    manager = new MessageManager()
  })

  // 功能: ink-terminal-ui, 属性 7: 流式消息累积
  // 验证: 需求 5.5
  describe('属性 7: 流式消息累积', () => {
    /**
     * **Validates: Requirements 5.5**
     *
     * 对于任何流式 AI 消息的文本块序列，累积的内容必须等于所有块按顺序的连接，
     * 且组件必须处理部分更新而不丢失内容。
     */
    it('累积内容应等于所有文本块的顺序连接', () => {
      fc.assert(
        fc.property(
          textChunkSequenceArb,
          modelNameArb,
          (chunks, model) => {
            // 创建 AI 消息
            const messageId = manager.addAIMessage('', model)

            // 模拟流式累积：每次更新都是之前所有块的连接
            let accumulated = ''
            for (const chunk of chunks) {
              accumulated += chunk
              manager.updateAIMessage(messageId, accumulated)
            }

            // 获取最终消息
            const messages = manager.getMessages()
            const aiMessage = messages.find((m) => m.id === messageId) as AIMessage

            // 断言：最终内容应等于所有块的连接
            const expectedContent = chunks.join('')
            expect(aiMessage.content).toBe(expectedContent)
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 5.5**
     *
     * 流式更新过程中，每次更新后的内容应该是之前所有块的累积。
     */
    it('每次更新后内容应为之前所有块的累积', () => {
      fc.assert(
        fc.property(
          nonEmptyTextChunkSequenceArb,
          modelNameArb,
          (chunks, model) => {
            const messageId = manager.addAIMessage('', model)

            let accumulated = ''
            for (let i = 0; i < chunks.length; i++) {
              accumulated += chunks[i]
              manager.updateAIMessage(messageId, accumulated)

              // 验证每次更新后的内容
              const messages = manager.getMessages()
              const aiMessage = messages.find((m) => m.id === messageId) as AIMessage
              const expectedContent = chunks.slice(0, i + 1).join('')
              expect(aiMessage.content).toBe(expectedContent)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 5.5**
     *
     * 空文本块不应影响累积结果。
     */
    it('空文本块不应影响累积结果', () => {
      fc.assert(
        fc.property(
          fc.array(fc.oneof(fc.string({ minLength: 0, maxLength: 50 }), fc.constant('')), {
            minLength: 1,
            maxLength: 30,
          }),
          modelNameArb,
          (chunks, model) => {
            const messageId = manager.addAIMessage('', model)

            let accumulated = ''
            for (const chunk of chunks) {
              accumulated += chunk
              manager.updateAIMessage(messageId, accumulated)
            }

            const messages = manager.getMessages()
            const aiMessage = messages.find((m) => m.id === messageId) as AIMessage

            // 断言：最终内容应等于所有块的连接（包括空块）
            expect(aiMessage.content).toBe(chunks.join(''))
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 5.5**
     *
     * 特殊字符（Unicode、换行、Markdown 等）应正确累积。
     */
    it('特殊字符应正确累积', () => {
      fc.assert(
        fc.property(
          specialCharSequenceArb,
          modelNameArb,
          (chunks, model) => {
            const messageId = manager.addAIMessage('', model)

            let accumulated = ''
            for (const chunk of chunks) {
              accumulated += chunk
              manager.updateAIMessage(messageId, accumulated)
            }

            const messages = manager.getMessages()
            const aiMessage = messages.find((m) => m.id === messageId) as AIMessage

            // 断言：特殊字符应正确保留
            expect(aiMessage.content).toBe(chunks.join(''))
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 5.5**
     *
     * 流式更新不应丢失任何内容。
     */
    it('流式更新不应丢失任何内容', () => {
      fc.assert(
        fc.property(
          textChunkSequenceArb,
          modelNameArb,
          (chunks, model) => {
            const messageId = manager.addAIMessage('', model)

            // 累积所有块
            let accumulated = ''
            for (const chunk of chunks) {
              accumulated += chunk
              manager.updateAIMessage(messageId, accumulated)
            }

            const messages = manager.getMessages()
            const aiMessage = messages.find((m) => m.id === messageId) as AIMessage

            // 验证每个块的内容都存在于最终结果中
            let position = 0
            for (const chunk of chunks) {
              const foundIndex = aiMessage.content.indexOf(chunk, position)
              // 如果块不为空，应该能在正确位置找到
              if (chunk.length > 0) {
                expect(foundIndex).toBe(position)
              }
              position += chunk.length
            }

            // 验证总长度
            expect(aiMessage.content.length).toBe(chunks.join('').length)
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 5.5**
     *
     * 多个 AI 消息的流式更新应相互独立。
     */
    it('多个 AI 消息的流式更新应相互独立', () => {
      fc.assert(
        fc.property(
          textChunkSequenceArb,
          textChunkSequenceArb,
          modelNameArb,
          (chunks1, chunks2, model) => {
            // 创建两个 AI 消息
            const messageId1 = manager.addAIMessage('', model)
            const messageId2 = manager.addAIMessage('', model)

            // 交替更新两个消息
            let accumulated1 = ''
            let accumulated2 = ''
            const maxLen = Math.max(chunks1.length, chunks2.length)

            for (let i = 0; i < maxLen; i++) {
              if (i < chunks1.length) {
                accumulated1 += chunks1[i]
                manager.updateAIMessage(messageId1, accumulated1)
              }
              if (i < chunks2.length) {
                accumulated2 += chunks2[i]
                manager.updateAIMessage(messageId2, accumulated2)
              }
            }

            const messages = manager.getMessages()
            const aiMessage1 = messages.find((m) => m.id === messageId1) as AIMessage
            const aiMessage2 = messages.find((m) => m.id === messageId2) as AIMessage

            // 断言：两个消息的内容应该独立
            expect(aiMessage1.content).toBe(chunks1.join(''))
            expect(aiMessage2.content).toBe(chunks2.join(''))
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 5.5**
     *
     * 完成流式消息后，内容应保持不变。
     */
    it('完成流式消息后内容应保持不变', () => {
      fc.assert(
        fc.property(
          textChunkSequenceArb,
          modelNameArb,
          (chunks, model) => {
            const messageId = manager.addAIMessage('', model)

            // 累积所有块
            let accumulated = ''
            for (const chunk of chunks) {
              accumulated += chunk
              manager.updateAIMessage(messageId, accumulated)
            }

            // 完成流式消息
            manager.finishAIMessage(messageId)

            const messages = manager.getMessages()
            const aiMessage = messages.find((m) => m.id === messageId) as AIMessage

            // 断言：内容应保持不变
            expect(aiMessage.content).toBe(chunks.join(''))
            // 断言：isStreaming 应为 false
            expect(aiMessage.isStreaming).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 5.5**
     *
     * 初始内容不为空时，流式更新应正确处理。
     */
    it('初始内容不为空时流式更新应正确处理', () => {
      fc.assert(
        fc.property(
          nonEmptyTextChunkArb,
          textChunkSequenceArb,
          modelNameArb,
          (initialContent, chunks, model) => {
            // 创建带有初始内容的 AI 消息
            const messageId = manager.addAIMessage(initialContent, model)

            // 累积更多内容
            let accumulated = initialContent
            for (const chunk of chunks) {
              accumulated += chunk
              manager.updateAIMessage(messageId, accumulated)
            }

            const messages = manager.getMessages()
            const aiMessage = messages.find((m) => m.id === messageId) as AIMessage

            // 断言：最终内容应为初始内容 + 所有块
            expect(aiMessage.content).toBe(initialContent + chunks.join(''))
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 5.5**
     *
     * 大量文本块的累积应正确处理。
     */
    it('大量文本块的累积应正确处理', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 50,
            maxLength: 100,
          }),
          modelNameArb,
          (chunks, model) => {
            const messageId = manager.addAIMessage('', model)

            let accumulated = ''
            for (const chunk of chunks) {
              accumulated += chunk
              manager.updateAIMessage(messageId, accumulated)
            }

            const messages = manager.getMessages()
            const aiMessage = messages.find((m) => m.id === messageId) as AIMessage

            // 断言：大量块的累积应正确
            expect(aiMessage.content).toBe(chunks.join(''))
            expect(aiMessage.content.length).toBe(chunks.reduce((sum, c) => sum + c.length, 0))
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
