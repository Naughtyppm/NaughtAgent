// CC Ink global type augmentations (stub)
// 原版用于扩展 JSX.IntrinsicElements 以支持 ink-box / ink-text 等自定义元素
import type { DOMElement } from './dom.js'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'ink-box': { ref?: React.Ref<DOMElement>; style?: Record<string, unknown>; children?: React.ReactNode }
      'ink-text': { ref?: React.Ref<DOMElement>; style?: Record<string, unknown>; children?: React.ReactNode }
      'ink-root': { children?: React.ReactNode }
      'ink-virtual-text': { children?: React.ReactNode }
    }
  }
}
