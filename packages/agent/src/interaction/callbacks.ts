/**
 * 交互回调管理
 *
 * 管理 question 和 todo 工具的回调函数
 */

import type {
  InteractionCallbacks,
  Question,
  QuestionResult,
  TodoList,
} from "./types"

// ============================================================================
// Callback Storage
// ============================================================================

let callbacks: InteractionCallbacks = {}

/**
 * 设置交互回调
 */
export function setInteractionCallbacks(newCallbacks: InteractionCallbacks): void {
  callbacks = { ...callbacks, ...newCallbacks }
}

/**
 * 获取交互回调
 */
export function getInteractionCallbacks(): InteractionCallbacks {
  return callbacks
}

/**
 * 重置交互回调
 */
export function resetInteractionCallbacks(): void {
  callbacks = {}
}

// ============================================================================
// Callback Invocation
// ============================================================================

/**
 * 调用问题回调
 */
export async function invokeQuestionCallback(question: Question): Promise<QuestionResult> {
  if (!callbacks.onQuestion) {
    // 没有回调时，明确返回 cancelled，防止 LLM 把默认值当成用户真实回答
    return {
      answered: false,
      value: null,
      cancelled: true,
    }
  }

  try {
    return await callbacks.onQuestion(question)
  } catch (error) {
    return {
      answered: false,
      value: null,
      cancelled: true,
    }
  }
}

/**
 * 调用任务更新回调
 */
export function invokeTodoUpdateCallback(list: TodoList): void {
  if (callbacks.onTodoUpdate) {
    try {
      callbacks.onTodoUpdate(list)
    } catch {
      // 忽略回调错误
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * 获取问题的默认结果
 */
function getDefaultQuestionResult(question: Question): QuestionResult {
  if (question.default !== undefined) {
    return {
      answered: true,
      value: question.default,
    }
  }

  // 根据类型返回默认值
  switch (question.type) {
    case "confirm":
      return { answered: true, value: false }
    case "select":
      return {
        answered: true,
        value: question.options?.[0]?.value ?? null,
      }
    case "multiselect":
      return { answered: true, value: [] }
    case "text":
      return { answered: true, value: "" }
    default:
      return { answered: false, value: null }
  }
}

// ============================================================================
// Default CLI Callbacks
// ============================================================================

/**
 * 创建默认的 CLI 回调（用于简单场景）
 */
export function createDefaultCliCallbacks(): InteractionCallbacks {
  return {
    onQuestion: async (question) => {
      // 简单实现：直接返回默认值
      // 实际使用时应该用 readline 或 inquirer
      return getDefaultQuestionResult(question)
    },
    onTodoUpdate: (list) => {
      // 简单实现：打印到控制台
      console.log("\n📋 Tasks:")
      for (const item of list.items) {
        const icon = getStatusIcon(item.status)
        const indent = item.parentId ? "    " : "  "
        console.log(`${indent}${icon} ${item.content}`)
      }
      console.log("")
    },
  }
}

/**
 * 获取状态图标
 */
function getStatusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "✓"
    case "in_progress":
      return "◐"
    case "cancelled":
      return "✗"
    default:
      return "□"
  }
}
