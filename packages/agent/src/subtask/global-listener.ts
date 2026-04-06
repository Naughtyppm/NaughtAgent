/**
 * 全局子 Agent 事件监听器
 *
 * 支持多监听器注册，解决单例模式下多 Agent 并发覆盖问题。
 * 所有注册的监听器会同时收到事件。
 */

import type { SubAgentEventListener } from "./events"

/** 已注册的监听器集合 */
const listeners = new Set<SubAgentEventListener>()

/**
 * 设置全局子 Agent 事件监听器（向后兼容）
 * 
 * 注意：传 null 会清除所有监听器
 * 传函数会作为"主监听器"注册（先清除旧的，再设新的）
 * 
 * @deprecated 推荐使用 addGlobalSubAgentEventListener / removeGlobalSubAgentEventListener
 */
let primaryListener: SubAgentEventListener | null = null

export function setGlobalSubAgentEventListener(listener: SubAgentEventListener | null) {
  // 清除旧的主监听器
  if (primaryListener) {
    listeners.delete(primaryListener)
  }
  primaryListener = listener
  if (listener) {
    listeners.add(listener)
  }
}

/**
 * 添加全局事件监听器（支持多个并发监听）
 * @returns 清理函数，调用后移除该监听器
 */
export function addGlobalSubAgentEventListener(listener: SubAgentEventListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 移除全局事件监听器
 */
export function removeGlobalSubAgentEventListener(listener: SubAgentEventListener): void {
  listeners.delete(listener)
  if (primaryListener === listener) {
    primaryListener = null
  }
}

/**
 * 获取全局事件监听器（向后兼容）
 * 
 * 返回一个合成监听器，分发到所有已注册的监听器
 */
export function getGlobalSubAgentEventListener(): SubAgentEventListener | null {
  if (listeners.size === 0) return null
  // 返回合成监听器：一个事件分发到所有注册的 listener
  return (event) => {
    for (const listener of listeners) {
      try {
        listener(event)
      } catch (e) {
        console.error("[global-listener] Listener error:", e)
      }
    }
  }
}
