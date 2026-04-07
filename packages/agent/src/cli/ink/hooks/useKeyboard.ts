/**
 * useKeyboard Hook
 *
 * 处理键盘快捷键，包括：
 * - Escape: 切换到手动确认模式
 * - Ctrl+C: 取消当前任务
 * - Ctrl+O: 切换所有工具面板展开状态
 * - Tab: 切换当前选中工具面板的展开状态
 * - Alt+P: 切换到手动确认模式
 * - 上/下方向键: 历史导航或工具面板导航
 *
 * 需求: 6.2, 6.3, 6.5
 */

import { useInput } from '../../cc-ink/index.js'
import type { UseKeyboardOptions } from '../types.js'

/**
 * useKeyboard Hook
 *
 * 监听键盘输入并调用相应的回调函数。
 *
 * @param options 键盘事件回调选项
 * @param isActive 是否激活键盘监听（默认 true）
 */
export function useKeyboard(options: UseKeyboardOptions, isActive: boolean = true): void {
  const {
    onEscape,
    onCtrlC,
    onCtrlO,
    onArrowUp,
    onArrowDown,
    onAltP,
    onTab,
  } = options

  useInput(
    (input, key) => {
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

      // Tab 键
      if (key.tab && onTab) {
        onTab()
        return
      }

      // Alt+P (meta 在某些终端表示 Alt)
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
    },
    { isActive }
  )
}
