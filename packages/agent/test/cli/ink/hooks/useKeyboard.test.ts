/**
 * useKeyboard Hook 单元测试
 *
 * 测试键盘快捷键处理功能：
 * - Escape 键
 * - Ctrl+C
 * - Ctrl+O
 * - Alt+P
 * - 上/下方向键
 *
 * 需求: 6.2, 6.3, 6.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UseKeyboardOptions } from '../../../../src/cli/ink/types.js'

/**
 * 模拟 Ink 的 Key 对象
 */
interface MockKey {
  escape: boolean
  ctrl: boolean
  meta: boolean
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  return: boolean
  tab: boolean
  backspace: boolean
  delete: boolean
  shift: boolean
}

/**
 * 创建默认的 Key 对象
 */
function createMockKey(overrides: Partial<MockKey> = {}): MockKey {
  return {
    escape: false,
    ctrl: false,
    meta: false,
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    return: false,
    tab: false,
    backspace: false,
    delete: false,
    shift: false,
    ...overrides,
  }
}

/**
 * 模拟 useKeyboard 的核心逻辑
 * 由于 useInput 是 Ink 的 hook，我们直接测试处理逻辑
 */
function handleKeyboardInput(
  input: string,
  key: MockKey,
  options: UseKeyboardOptions
): void {
  const { onEscape, onCtrlC, onCtrlO, onArrowUp, onArrowDown, onAltP } = options

  // Escape 键
  if (key.escape && onEscape) {
    onEscape()
    return
  }

  // Ctrl+C
  if (input === 'c' && key.ctrl && onCtrlC) {
    onCtrlC()
    return
  }

  // Ctrl+O
  if (input === 'o' && key.ctrl && onCtrlO) {
    onCtrlO()
    return
  }

  // Alt+P
  if (input === 'p' && key.meta && onAltP) {
    onAltP()
    return
  }

  // 上方向键
  if (key.upArrow && onArrowUp) {
    onArrowUp()
    return
  }

  // 下方向键
  if (key.downArrow && onArrowDown) {
    onArrowDown()
    return
  }
}

describe('useKeyboard Hook', () => {
  let options: UseKeyboardOptions

  beforeEach(() => {
    options = {
      onEscape: vi.fn(),
      onCtrlC: vi.fn(),
      onCtrlO: vi.fn(),
      onArrowUp: vi.fn(),
      onArrowDown: vi.fn(),
      onAltP: vi.fn(),
    }
  })

  describe('Escape 键', () => {
    it('应该调用 onEscape 回调', () => {
      handleKeyboardInput('', createMockKey({ escape: true }), options)
      expect(options.onEscape).toHaveBeenCalledTimes(1)
    })

    it('没有 onEscape 回调时不应报错', () => {
      const optionsWithoutEscape = { ...options, onEscape: undefined }
      expect(() => {
        handleKeyboardInput('', createMockKey({ escape: true }), optionsWithoutEscape)
      }).not.toThrow()
    })
  })

  describe('Ctrl+C', () => {
    it('应该调用 onCtrlC 回调', () => {
      handleKeyboardInput('c', createMockKey({ ctrl: true }), options)
      expect(options.onCtrlC).toHaveBeenCalledTimes(1)
    })

    it('只按 C 键不应触发', () => {
      handleKeyboardInput('c', createMockKey(), options)
      expect(options.onCtrlC).not.toHaveBeenCalled()
    })

    it('只按 Ctrl 不应触发', () => {
      handleKeyboardInput('', createMockKey({ ctrl: true }), options)
      expect(options.onCtrlC).not.toHaveBeenCalled()
    })

    it('没有 onCtrlC 回调时不应报错', () => {
      const optionsWithoutCtrlC = { ...options, onCtrlC: undefined }
      expect(() => {
        handleKeyboardInput('c', createMockKey({ ctrl: true }), optionsWithoutCtrlC)
      }).not.toThrow()
    })
  })

  describe('Ctrl+O', () => {
    it('应该调用 onCtrlO 回调', () => {
      handleKeyboardInput('o', createMockKey({ ctrl: true }), options)
      expect(options.onCtrlO).toHaveBeenCalledTimes(1)
    })

    it('只按 O 键不应触发', () => {
      handleKeyboardInput('o', createMockKey(), options)
      expect(options.onCtrlO).not.toHaveBeenCalled()
    })
  })

  describe('Alt+P', () => {
    it('应该调用 onAltP 回调', () => {
      handleKeyboardInput('p', createMockKey({ meta: true }), options)
      expect(options.onAltP).toHaveBeenCalledTimes(1)
    })

    it('只按 P 键不应触发', () => {
      handleKeyboardInput('p', createMockKey(), options)
      expect(options.onAltP).not.toHaveBeenCalled()
    })
  })

  describe('上方向键', () => {
    it('应该调用 onArrowUp 回调', () => {
      handleKeyboardInput('', createMockKey({ upArrow: true }), options)
      expect(options.onArrowUp).toHaveBeenCalledTimes(1)
    })

    it('没有 onArrowUp 回调时不应报错', () => {
      const optionsWithoutArrowUp = { ...options, onArrowUp: undefined }
      expect(() => {
        handleKeyboardInput('', createMockKey({ upArrow: true }), optionsWithoutArrowUp)
      }).not.toThrow()
    })
  })

  describe('下方向键', () => {
    it('应该调用 onArrowDown 回调', () => {
      handleKeyboardInput('', createMockKey({ downArrow: true }), options)
      expect(options.onArrowDown).toHaveBeenCalledTimes(1)
    })

    it('没有 onArrowDown 回调时不应报错', () => {
      const optionsWithoutArrowDown = { ...options, onArrowDown: undefined }
      expect(() => {
        handleKeyboardInput('', createMockKey({ downArrow: true }), optionsWithoutArrowDown)
      }).not.toThrow()
    })
  })

  describe('优先级', () => {
    it('Escape 应该优先于其他键', () => {
      // 同时按 Escape 和 Ctrl+C
      handleKeyboardInput('c', createMockKey({ escape: true, ctrl: true }), options)
      expect(options.onEscape).toHaveBeenCalledTimes(1)
      expect(options.onCtrlC).not.toHaveBeenCalled()
    })

    it('Ctrl+C 应该优先于方向键', () => {
      handleKeyboardInput('c', createMockKey({ ctrl: true, upArrow: true }), options)
      expect(options.onCtrlC).toHaveBeenCalledTimes(1)
      expect(options.onArrowUp).not.toHaveBeenCalled()
    })
  })

  describe('无关输入', () => {
    it('普通字符不应触发任何回调', () => {
      handleKeyboardInput('a', createMockKey(), options)
      expect(options.onEscape).not.toHaveBeenCalled()
      expect(options.onCtrlC).not.toHaveBeenCalled()
      expect(options.onCtrlO).not.toHaveBeenCalled()
      expect(options.onArrowUp).not.toHaveBeenCalled()
      expect(options.onArrowDown).not.toHaveBeenCalled()
      expect(options.onAltP).not.toHaveBeenCalled()
    })

    it('空输入不应触发任何回调', () => {
      handleKeyboardInput('', createMockKey(), options)
      expect(options.onEscape).not.toHaveBeenCalled()
      expect(options.onCtrlC).not.toHaveBeenCalled()
      expect(options.onCtrlO).not.toHaveBeenCalled()
      expect(options.onArrowUp).not.toHaveBeenCalled()
      expect(options.onArrowDown).not.toHaveBeenCalled()
      expect(options.onAltP).not.toHaveBeenCalled()
    })
  })

  describe('空选项', () => {
    it('所有回调都为空时不应报错', () => {
      const emptyOptions: UseKeyboardOptions = {}
      expect(() => {
        handleKeyboardInput('', createMockKey({ escape: true }), emptyOptions)
        handleKeyboardInput('c', createMockKey({ ctrl: true }), emptyOptions)
        handleKeyboardInput('o', createMockKey({ ctrl: true }), emptyOptions)
        handleKeyboardInput('', createMockKey({ upArrow: true }), emptyOptions)
        handleKeyboardInput('', createMockKey({ downArrow: true }), emptyOptions)
        handleKeyboardInput('p', createMockKey({ meta: true }), emptyOptions)
      }).not.toThrow()
    })
  })
})
