/**
 * 全局子 Agent 事件监听器
 *
 * 提供统一的事件监听器管理，所有子 Agent 工具共享
 */

import type { SubAgentEventListener } from "./events"

// 全局事件监听器
let globalEventListener: SubAgentEventListener | null = null

/**
 * 设置全局子 Agent 事件监听器
 * UI 层调用此函数注册监听器，接收所有子 Agent 执行状态
 */
export function setGlobalSubAgentEventListener(listener: SubAgentEventListener | null) {
  globalEventListener = listener
}

/**
 * 获取全局事件监听器
 */
export function getGlobalSubAgentEventListener(): SubAgentEventListener | null {
  return globalEventListener
}
