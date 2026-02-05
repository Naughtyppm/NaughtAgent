/**
 * useRunner Hook 属性测试
 *
 * 使用 fast-check 进行属性测试，验证 Runner 事件处理的核心属性：
 * - 属性 14: Runner 事件处理器兼容性
 *
 * 功能: ink-terminal-ui, 属性 14: Runner 事件处理器兼容性
 * 验证: 需求 8.2
 */

import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import type { RunnerEvent, RunnerEventType } from '../../../../src/cli/ink/types.js'

// ============================================================================
// 模拟 Runner 事件处理
// ============================================================================

/**
 * 事件处理器类型
 */
type EventHandler = (event: RunnerEvent) => void

/**
 * 模拟 UI 状态
 */
interface UIState {
  messages: Array<{ type: string; content: unknown }>
  isRunning: boolean
  currentTool: string | null
  error: Error | null
}

/**
 * 创建事件处理器
 * 模拟 Ink UI 对 Runner 事件的处理
 */
function createEventHandler(state: UIState): EventHandler {
  return (event: RunnerEvent) => {
    switch (event.type) {
      case 'text':
        state.messages.push({ type: 'ai', content: event.data })
        break
      case 'tool_start':
        state.currentTool = (event.data as { name?: string })?.name ?? 'unknown'
        state.messages.push({ type: 'tool_start', content: event.data })
        break
      case 'tool_end':
        state.currentTool = null
        state.messages.push({ type: 'tool_end', content: event.data })
        break
      case 'error':
        state.error = (event.data as { error?: Error })?.error ?? new Error('Unknown error')
        state.messages.push({ type: 'error', content: event.data })
        break
      case 'done':
        state.isRunning = false
        state.messages.push({ type: 'done', content: event.data })
        break
    }
  }
}

// ============================================================================
// Arbitraries
// ============================================================================

/**
 * 事件类型生成器
 */
const eventTypeArb: fc.Arbitrary<RunnerEventType> = fc.constantFrom(
  'text',
  'tool_start',
  'tool_end',
  'error',
  'done'
)

/**
 * 文本事件数据生成器
 */
const textEventDataArb: fc.Arbitrary<{ content: string }> = fc.record({
  content: fc.string({ minLength: 0, maxLength: 500 }),
})

/**
 * 工具开始事件数据生成器
 */
const toolStartEventDataArb: fc.Arbitrary<{ name: string; input: unknown }> = fc.record({
  name: fc.constantFrom('read', 'write', 'edit', 'bash', 'glob', 'grep'),
  input: fc.oneof(
    fc.record({ filePath: fc.string() }),
    fc.record({ command: fc.string() }),
    fc.record({ pattern: fc.string() })
  ),
})

/**
 * 工具结束事件数据生成器
 */
const toolEndEventDataArb: fc.Arbitrary<{ output: string; isError: boolean }> = fc.record({
  output: fc.string({ minLength: 0, maxLength: 1000 }),
  isError: fc.boolean(),
})

/**
 * 错误事件数据生成器
 */
const errorEventDataArb: fc.Arbitrary<{ error: Error }> = fc.record({
  error: fc.string().map((msg) => new Error(msg)),
})

/**
 * 完成事件数据生成器
 */
const doneEventDataArb: fc.Arbitrary<Record<string, never>> = fc.constant({})

/**
 * 根据事件类型生成对应的数据
 */
function generateEventData(type: RunnerEventType): fc.Arbitrary<unknown> {
  switch (type) {
    case 'text':
      return textEventDataArb
    case 'tool_start':
      return toolStartEventDataArb
    case 'tool_end':
      return toolEndEventDataArb
    case 'error':
      return errorEventDataArb
    case 'done':
      return doneEventDataArb
  }
}

/**
 * Runner 事件生成器
 */
const runnerEventArb: fc.Arbitrary<RunnerEvent> = eventTypeArb.chain((type) =>
  generateEventData(type).map((data) => ({ type, data }))
)

/**
 * 事件序列生成器
 */
const eventSequenceArb: fc.Arbitrary<RunnerEvent[]> = fc.array(runnerEventArb, {
  minLength: 1,
  maxLength: 50,
})

/**
 * 有效事件序列生成器（以 done 结尾）
 */
const validEventSequenceArb: fc.Arbitrary<RunnerEvent[]> = fc
  .array(runnerEventArb, { minLength: 0, maxLength: 49 })
  .map((events) => [...events, { type: 'done' as const, data: {} }])

// ============================================================================
// 属性测试
// ============================================================================

describe('useRunner 属性测试', () => {
  // 功能: ink-terminal-ui, 属性 14: Runner 事件处理器兼容性
  // 验证: 需求 8.2
  describe('属性 14: Runner 事件处理器兼容性', () => {
    /**
     * **Validates: Requirements 8.2**
     *
     * 对于任何 Runner 发出的事件（text、tool_start、tool_end、error、done），
     * Ink UI 事件处理器必须处理该事件并相应更新 UI 状态，不抛出错误。
     */
    it('事件处理器应处理所有事件类型而不抛出错误', () => {
      fc.assert(
        fc.property(eventSequenceArb, (events) => {
          const state: UIState = {
            messages: [],
            isRunning: true,
            currentTool: null,
            error: null,
          }
          const handler = createEventHandler(state)

          // 处理所有事件不应抛出错误
          expect(() => {
            for (const event of events) {
              handler(event)
            }
          }).not.toThrow()
        }),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 8.2**
     *
     * text 事件应该添加 AI 消息到状态。
     */
    it('text 事件应添加 AI 消息', () => {
      fc.assert(
        fc.property(textEventDataArb, (data) => {
          const state: UIState = {
            messages: [],
            isRunning: true,
            currentTool: null,
            error: null,
          }
          const handler = createEventHandler(state)

          handler({ type: 'text', data })

          expect(state.messages).toHaveLength(1)
          expect(state.messages[0].type).toBe('ai')
          expect(state.messages[0].content).toEqual(data)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 8.2**
     *
     * tool_start 事件应该设置当前工具。
     */
    it('tool_start 事件应设置当前工具', () => {
      fc.assert(
        fc.property(toolStartEventDataArb, (data) => {
          const state: UIState = {
            messages: [],
            isRunning: true,
            currentTool: null,
            error: null,
          }
          const handler = createEventHandler(state)

          handler({ type: 'tool_start', data })

          expect(state.currentTool).toBe(data.name)
          expect(state.messages).toHaveLength(1)
          expect(state.messages[0].type).toBe('tool_start')
        }),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 8.2**
     *
     * tool_end 事件应该清除当前工具。
     */
    it('tool_end 事件应清除当前工具', () => {
      fc.assert(
        fc.property(toolStartEventDataArb, toolEndEventDataArb, (startData, endData) => {
          const state: UIState = {
            messages: [],
            isRunning: true,
            currentTool: null,
            error: null,
          }
          const handler = createEventHandler(state)

          // 先开始工具
          handler({ type: 'tool_start', data: startData })
          expect(state.currentTool).toBe(startData.name)

          // 然后结束工具
          handler({ type: 'tool_end', data: endData })
          expect(state.currentTool).toBeNull()
        }),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 8.2**
     *
     * error 事件应该设置错误状态。
     */
    it('error 事件应设置错误状态', () => {
      fc.assert(
        fc.property(errorEventDataArb, (data) => {
          const state: UIState = {
            messages: [],
            isRunning: true,
            currentTool: null,
            error: null,
          }
          const handler = createEventHandler(state)

          handler({ type: 'error', data })

          expect(state.error).not.toBeNull()
          expect(state.messages).toHaveLength(1)
          expect(state.messages[0].type).toBe('error')
        }),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 8.2**
     *
     * done 事件应该设置 isRunning 为 false。
     */
    it('done 事件应设置 isRunning 为 false', () => {
      fc.assert(
        fc.property(doneEventDataArb, (data) => {
          const state: UIState = {
            messages: [],
            isRunning: true,
            currentTool: null,
            error: null,
          }
          const handler = createEventHandler(state)

          expect(state.isRunning).toBe(true)
          handler({ type: 'done', data })
          expect(state.isRunning).toBe(false)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 8.2**
     *
     * 有效事件序列应该正确更新状态。
     */
    it('有效事件序列应正确更新状态', () => {
      fc.assert(
        fc.property(validEventSequenceArb, (events) => {
          const state: UIState = {
            messages: [],
            isRunning: true,
            currentTool: null,
            error: null,
          }
          const handler = createEventHandler(state)

          for (const event of events) {
            handler(event)
          }

          // 序列以 done 结尾，所以 isRunning 应该为 false
          expect(state.isRunning).toBe(false)
          // 消息数量应该等于事件数量
          expect(state.messages).toHaveLength(events.length)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 8.2**
     *
     * 事件处理顺序应该保持一致。
     */
    it('事件处理顺序应保持一致', () => {
      fc.assert(
        fc.property(eventSequenceArb, (events) => {
          const state: UIState = {
            messages: [],
            isRunning: true,
            currentTool: null,
            error: null,
          }
          const handler = createEventHandler(state)

          for (const event of events) {
            handler(event)
          }

          // 消息顺序应该与事件顺序一致
          for (let i = 0; i < events.length; i++) {
            const event = events[i]
            const message = state.messages[i]

            // 验证消息类型与事件类型对应
            if (event.type === 'text') {
              expect(message.type).toBe('ai')
            } else {
              expect(message.type).toBe(event.type)
            }
          }
        }),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 8.2**
     *
     * 空数据的事件也应该被正确处理。
     */
    it('空数据的事件应被正确处理', () => {
      fc.assert(
        fc.property(eventTypeArb, (type) => {
          const state: UIState = {
            messages: [],
            isRunning: true,
            currentTool: null,
            error: null,
          }
          const handler = createEventHandler(state)

          // 使用空对象作为数据
          expect(() => {
            handler({ type, data: {} })
          }).not.toThrow()
        }),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 8.2**
     *
     * 多次 done 事件不应导致问题。
     */
    it('多次 done 事件不应导致问题', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10 }), (count) => {
          const state: UIState = {
            messages: [],
            isRunning: true,
            currentTool: null,
            error: null,
          }
          const handler = createEventHandler(state)

          expect(() => {
            for (let i = 0; i < count; i++) {
              handler({ type: 'done', data: {} })
            }
          }).not.toThrow()

          expect(state.isRunning).toBe(false)
          expect(state.messages).toHaveLength(count)
        }),
        { numRuns: 100 }
      )
    })
  })
})
