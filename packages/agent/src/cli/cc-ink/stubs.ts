/**
 * CC Ink 外部依赖的 Stub
 *
 * CC ink 源码中引用了 4 个 CC 内部模块，
 * 这里用简单实现替代它们。
 */

/** bootstrap/state.ts → flushInteractionTime */
export function flushInteractionTime(): void {
  // NA 不需要交互时间统计
}

/** utils/debug.ts → logForDebugging */
export function logForDebugging(..._args: unknown[]): void {
  // NA 使用自己的 Logger，这里静默
}

/** utils/log.ts → logError */
export function logError(msg: string, err?: unknown): void {
  console.error("[cc-ink]", msg, err)
}

/** yoga-layout 计数器 → getYogaCounters */
export function getYogaCounters(): { creates: number; destroys: number } {
  return { creates: 0, destroys: 0 }
}
