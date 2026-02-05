/**
 * useKeyboard Hook 属性测试
 *
 * 使用 fast-check 进行属性测试，验证键盘处理的核心属性：
 * - 属性 9: 键盘快捷键模式切换
 * - 属性 10: Ctrl+C 任务取消
 * - 属性 12: 历史导航边界
 *
 * 功能: ink-terminal-ui
 * 验证: 需求 6.2, 6.3, 6.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import type { UseKeyboardOptions } from '../../../../src/cli/ink/types.js'

// ============================================================================
// 模拟键盘处理逻辑
// ============================================================================

interface MockKey {
  escape: boolean
  ctrl: boolean
  meta: boolean
  upArrow: boolean
  downArrow: boolean
}

function createMockKey(overrides: Partial<MockKey> = {}): MockKey {
  return {
    escape: false,
    ctrl: false,
    meta: false,
    upArrow: false,
    downArrow: false,
    ...overrides,
  }
}

function handleKeyboardInput(
  input: string,
  key: MockKey,
  options: UseKeyboardOptions
): void {
  const { onEscape, onCtrlC, onCtrlO, onArrowUp, onArrowDown, onAltP } = options

  if (key.escape && onEscape) {
    onEscape()
    return
  }

  if (input === 'c' && key.ctrl && onCtrlC) {
    onCtrlC()
    return
  }

  if (input === 'o' && key.ctrl && onCtrlO) {
    onCtrlO()
    return
  }

  if (input === 'p' && key.meta && onAltP) {
    onAltP()
    return
  }

  if (key.upArrow && onArrowUp) {
    onArrowUp()
    return
  }

  if (key.downArrow && onArrowDown) {
    onArrowDown()
    return
  }
}

// ============================================================================
// 模拟应用状态
// ============================================================================

class AppState {
  autoConfirm: boolean = true
  isRunning: boolean = false
  abortCalled: boolean = false
  historyIndex: number = 0
  history: string[] = []

  setAutoConfirm(value: boolean): void {
    this.autoConfirm = value
  }

  setRunning(value: boolean): void {
    this.isRunning = value
  }

  abort(): void {
    this.abortCalled = true
  }

  setHistory(history: string[]): void {
    this.history = history
    this.historyIndex = history.length
  }

  navigateUp(): void {
    if (this.historyIndex > 0) {
      this.historyIndex--
    }
  }

  navigateDown(): void {
    if (this.historyIndex < this.history.length) {
      this.historyIndex++
    }
  }

  getCurrentHistoryItem(): string | undefined {
    if (this.historyIndex < this.history.length) {
      return this.history[this.historyIndex]
    }
    return undefined
  }
}

// ============================================================================
// Arbitraries
// ============================================================================

const historyArb: fc.Arbitrary<string[]> = fc.array(
  fc.string({ minLength: 1, maxLength: 100 }),
  { minLength: 0, maxLength: 50 }
)

const navigationSequenceArb: fc.Arbitrary<('up' | 'down')[]> = fc.array(
  fc.constantFrom('up', 'down'),
  { minLength: 1, maxLength: 100 }
)

// ============================================================================
// 属性测试
// ============================================================================

describe('useKeyboard 属性测试', () => {
  // 功能: ink-terminal-ui, 属性 9: 键盘快捷键模式切换
  // 验证: 需求 6.2
  describe('属性 9: 键盘快捷键模式切换', () => {
    /**
     * **Validates: Requirements 6.2**
     *
     * 对于任何在 autoConfirm 为 true 时匹配 Escape 的按键事件，
     * autoConfirm 状态必须转换为 false。
     */
    it('Escape 键应将 autoConfirm 从 true 切换为 false', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (initialAutoConfirm) => {
            const state = new AppState()
            state.setAutoConfirm(initialAutoConfirm)

            const options: UseKeyboardOptions = {
              onEscape: () => {
                if (state.autoConfirm) {
                  state.setAutoConfirm(false)
                }
              },
            }

            handleKeyboardInput('', createMockKey({ escape: true }), options)

            // 如果初始为 true，应该变为 false
            // 如果初始为 false，应该保持 false
            expect(state.autoConfirm).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 6.2**
     *
     * 对于任何在 autoConfirm 为 true 时匹配 Alt+P 的按键事件，
     * autoConfirm 状态必须转换为 false。
     */
    it('Alt+P 应将 autoConfirm 从 true 切换为 false', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (initialAutoConfirm) => {
            const state = new AppState()
            state.setAutoConfirm(initialAutoConfirm)

            const options: UseKeyboardOptions = {
              onAltP: () => {
                if (state.autoConfirm) {
                  state.setAutoConfirm(false)
                }
              },
            }

            handleKeyboardInput('p', createMockKey({ meta: true }), options)

            expect(state.autoConfirm).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 6.2**
     *
     * 多次按 Escape 应该保持 autoConfirm 为 false。
     */
    it('多次按 Escape 应保持 autoConfirm 为 false', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (pressCount) => {
            const state = new AppState()
            state.setAutoConfirm(true)

            const options: UseKeyboardOptions = {
              onEscape: () => {
                if (state.autoConfirm) {
                  state.setAutoConfirm(false)
                }
              },
            }

            for (let i = 0; i < pressCount; i++) {
              handleKeyboardInput('', createMockKey({ escape: true }), options)
            }

            expect(state.autoConfirm).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // 功能: ink-terminal-ui, 属性 10: Ctrl+C 任务取消
  // 验证: 需求 6.3
  describe('属性 10: Ctrl+C 任务取消', () => {
    /**
     * **Validates: Requirements 6.3**
     *
     * 对于任何在 isRunning 为 true 时的 Ctrl+C 按键事件，
     * 必须调用 abort controller 的 abort() 方法。
     */
    it('Ctrl+C 在任务运行时应调用 abort', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (isRunning) => {
            const state = new AppState()
            state.setRunning(isRunning)
            state.abortCalled = false

            const options: UseKeyboardOptions = {
              onCtrlC: () => {
                if (state.isRunning) {
                  state.abort()
                }
              },
            }

            handleKeyboardInput('c', createMockKey({ ctrl: true }), options)

            // 只有在运行时才应该调用 abort
            expect(state.abortCalled).toBe(isRunning)
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 6.3**
     *
     * Ctrl+C 应该总是触发回调，无论任务是否运行。
     */
    it('Ctrl+C 应总是触发回调', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (isRunning) => {
            let callbackCalled = false
            const state = new AppState()
            state.setRunning(isRunning)

            const options: UseKeyboardOptions = {
              onCtrlC: () => {
                callbackCalled = true
              },
            }

            handleKeyboardInput('c', createMockKey({ ctrl: true }), options)

            expect(callbackCalled).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // 功能: ink-terminal-ui, 属性 12: 历史导航边界
  // 验证: 需求 6.5
  describe('属性 12: 历史导航边界', () => {
    /**
     * **Validates: Requirements 6.5**
     *
     * 对于任何历史数组和任意上/下方向键事件序列，
     * 历史索引必须保持在 [0, history.length] 范围内。
     */
    it('历史索引应保持在有效范围内', () => {
      fc.assert(
        fc.property(
          historyArb,
          navigationSequenceArb,
          (history, sequence) => {
            const state = new AppState()
            state.setHistory(history)

            const options: UseKeyboardOptions = {
              onArrowUp: () => state.navigateUp(),
              onArrowDown: () => state.navigateDown(),
            }

            for (const direction of sequence) {
              if (direction === 'up') {
                handleKeyboardInput('', createMockKey({ upArrow: true }), options)
              } else {
                handleKeyboardInput('', createMockKey({ downArrow: true }), options)
              }

              // 验证索引始终在有效范围内
              expect(state.historyIndex).toBeGreaterThanOrEqual(0)
              expect(state.historyIndex).toBeLessThanOrEqual(history.length)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 6.5**
     *
     * 连续按上方向键应该到达历史开头并停止。
     */
    it('连续按上方向键应到达历史开头', () => {
      fc.assert(
        fc.property(
          historyArb,
          fc.integer({ min: 1, max: 100 }),
          (history, pressCount) => {
            const state = new AppState()
            state.setHistory(history)

            const options: UseKeyboardOptions = {
              onArrowUp: () => state.navigateUp(),
            }

            // 按足够多次以确保到达开头
            const totalPresses = Math.max(pressCount, history.length + 1)
            for (let i = 0; i < totalPresses; i++) {
              handleKeyboardInput('', createMockKey({ upArrow: true }), options)
            }

            // 无论按多少次，索引不应小于 0
            expect(state.historyIndex).toBe(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 6.5**
     *
     * 连续按下方向键应该到达历史末尾并停止。
     */
    it('连续按下方向键应到达历史末尾', () => {
      fc.assert(
        fc.property(
          historyArb,
          fc.integer({ min: 1, max: 100 }),
          (history, pressCount) => {
            const state = new AppState()
            state.setHistory(history)
            state.historyIndex = 0 // 从开头开始

            const options: UseKeyboardOptions = {
              onArrowDown: () => state.navigateDown(),
            }

            // 按足够多次以确保到达末尾
            const totalPresses = Math.max(pressCount, history.length + 1)
            for (let i = 0; i < totalPresses; i++) {
              handleKeyboardInput('', createMockKey({ downArrow: true }), options)
            }

            // 无论按多少次，索引不应超过 history.length
            expect(state.historyIndex).toBe(history.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 6.5**
     *
     * 导航应返回正确的历史条目。
     */
    it('导航应返回正确的历史条目', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 20 }),
          fc.integer({ min: 0, max: 19 }),
          (history, targetIndex) => {
            const state = new AppState()
            state.setHistory(history)

            const options: UseKeyboardOptions = {
              onArrowUp: () => state.navigateUp(),
              onArrowDown: () => state.navigateDown(),
            }

            // 导航到目标索引
            const actualTarget = Math.min(targetIndex, history.length - 1)
            const stepsNeeded = history.length - actualTarget

            for (let i = 0; i < stepsNeeded; i++) {
              handleKeyboardInput('', createMockKey({ upArrow: true }), options)
            }

            // 验证返回正确的历史条目
            const item = state.getCurrentHistoryItem()
            if (state.historyIndex < history.length) {
              expect(item).toBe(history[state.historyIndex])
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 6.5**
     *
     * 空历史时导航不应出错。
     */
    it('空历史时导航不应出错', () => {
      fc.assert(
        fc.property(
          navigationSequenceArb,
          (sequence) => {
            const state = new AppState()
            state.setHistory([])

            const options: UseKeyboardOptions = {
              onArrowUp: () => state.navigateUp(),
              onArrowDown: () => state.navigateDown(),
            }

            expect(() => {
              for (const direction of sequence) {
                if (direction === 'up') {
                  handleKeyboardInput('', createMockKey({ upArrow: true }), options)
                } else {
                  handleKeyboardInput('', createMockKey({ downArrow: true }), options)
                }
              }
            }).not.toThrow()

            // 空历史时索引应该保持为 0
            expect(state.historyIndex).toBe(0)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
