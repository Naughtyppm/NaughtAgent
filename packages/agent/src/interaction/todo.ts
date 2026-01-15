/**
 * Todo 工具 - 任务管理
 *
 * 支持的操作：
 * - add: 添加任务
 * - update: 更新任务状态
 * - remove: 删除任务
 * - list: 列出任务
 * - clear: 清空任务
 */

import { z } from "zod"
import { Tool } from "../tool/tool"
import { invokeTodoUpdateCallback } from "./callbacks"
import type { TodoItem, TodoList, TodoStatus, TodoAction } from "./types"

const DESCRIPTION = `Manage a task list to track progress on complex tasks.

Actions:
- **add**: Add a new task. Requires content.
- **update**: Update task status. Requires id and status.
- **remove**: Remove a task. Requires id.
- **list**: List all tasks.
- **clear**: Clear all tasks.

Status values: pending, in_progress, completed, cancelled

Use this tool to:
- Break down complex tasks into steps
- Show progress to the user
- Track what has been done and what remains

Examples:
- Add: { action: "add", content: "Implement login" }
- Update: { action: "update", id: "1", status: "completed" }
- List: { action: "list" }`

/**
 * Todo 工具参数 Schema
 */
const TodoParamsSchema = z.object({
  /** 操作类型 */
  action: z
    .enum(["add", "update", "remove", "list", "clear"])
    .describe("Action to perform: add, update, remove, list, or clear"),

  /** 任务内容（add 时必需） */
  content: z
    .string()
    .optional()
    .describe("Task content (required for add)"),

  /** 任务 ID（update/remove 时必需） */
  id: z
    .string()
    .optional()
    .describe("Task ID (required for update/remove)"),

  /** 新状态（update 时必需） */
  status: z
    .enum(["pending", "in_progress", "completed", "cancelled"])
    .optional()
    .describe("New status (required for update)"),

  /** 父任务 ID（add 子任务时） */
  parentId: z
    .string()
    .optional()
    .describe("Parent task ID for creating subtasks"),
})

export type TodoParams = z.infer<typeof TodoParamsSchema>

// ============================================================================
// Todo Storage (in-memory, per session)
// ============================================================================

const todoLists = new Map<string, TodoList>()
let idCounter = 0

/**
 * 获取或创建任务列表
 */
function getOrCreateList(sessionId: string): TodoList {
  let list = todoLists.get(sessionId)
  if (!list) {
    list = { sessionId, items: [] }
    todoLists.set(sessionId, list)
  }
  return list
}

/**
 * 生成任务 ID
 */
function generateId(): string {
  return String(++idCounter)
}

/**
 * 重置 ID 计数器（用于测试）
 */
export function resetIdCounter(): void {
  idCounter = 0
}

/**
 * 清空所有任务列表（用于测试）
 */
export function clearAllTodoLists(): void {
  todoLists.clear()
  idCounter = 0
}

// ============================================================================
// Todo Operations
// ============================================================================

/**
 * 添加任务
 */
function addTodo(
  sessionId: string,
  content: string,
  parentId?: string
): TodoItem {
  const list = getOrCreateList(sessionId)
  const now = Date.now()

  const item: TodoItem = {
    id: generateId(),
    content,
    status: "pending",
    parentId,
    createdAt: now,
    updatedAt: now,
  }

  list.items.push(item)
  invokeTodoUpdateCallback(list)

  return item
}

/**
 * 更新任务状态
 */
function updateTodo(
  sessionId: string,
  id: string,
  status: TodoStatus
): TodoItem | null {
  const list = getOrCreateList(sessionId)
  const item = list.items.find((i) => i.id === id)

  if (!item) {
    return null
  }

  item.status = status
  item.updatedAt = Date.now()
  invokeTodoUpdateCallback(list)

  return item
}

/**
 * 删除任务
 */
function removeTodo(sessionId: string, id: string): boolean {
  const list = getOrCreateList(sessionId)
  const index = list.items.findIndex((i) => i.id === id)

  if (index === -1) {
    return false
  }

  // 同时删除子任务
  list.items = list.items.filter((i) => i.id !== id && i.parentId !== id)
  invokeTodoUpdateCallback(list)

  return true
}

/**
 * 列出任务
 */
function listTodos(sessionId: string): TodoItem[] {
  const list = getOrCreateList(sessionId)
  return list.items
}

/**
 * 清空任务
 */
function clearTodos(sessionId: string): number {
  const list = getOrCreateList(sessionId)
  const count = list.items.length
  list.items = []
  invokeTodoUpdateCallback(list)
  return count
}

// ============================================================================
// Todo Tool
// ============================================================================

/**
 * Todo 工具定义
 */
export const TodoTool = Tool.define({
  id: "todo",
  description: DESCRIPTION,
  parameters: TodoParamsSchema,

  async execute(params, ctx) {
    // 使用 cwd 作为简单的 session 标识
    const sessionId = ctx.cwd

    // 验证参数
    const validationError = validateTodoParams(params)
    if (validationError) {
      throw new Error(validationError)
    }

    // 执行操作
    switch (params.action) {
      case "add": {
        const item = addTodo(sessionId, params.content!, params.parentId)
        return {
          title: "todo: add",
          output: `Added task [${item.id}]: ${item.content}`,
          metadata: { action: "add", item },
        }
      }

      case "update": {
        const item = updateTodo(sessionId, params.id!, params.status as TodoStatus)
        if (!item) {
          return {
            title: "todo: update",
            output: `Task not found: ${params.id}`,
            metadata: { action: "update", success: false },
          }
        }
        return {
          title: "todo: update",
          output: `Updated task [${item.id}]: ${item.status}`,
          metadata: { action: "update", item },
        }
      }

      case "remove": {
        const success = removeTodo(sessionId, params.id!)
        return {
          title: "todo: remove",
          output: success
            ? `Removed task: ${params.id}`
            : `Task not found: ${params.id}`,
          metadata: { action: "remove", success },
        }
      }

      case "list": {
        const items = listTodos(sessionId)
        const output = formatTodoList(items)
        return {
          title: "todo: list",
          output,
          metadata: { action: "list", items, count: items.length },
        }
      }

      case "clear": {
        const count = clearTodos(sessionId)
        return {
          title: "todo: clear",
          output: `Cleared ${count} task(s)`,
          metadata: { action: "clear", count },
        }
      }

      default:
        throw new Error(`Unknown action: ${params.action}`)
    }
  },
})

/**
 * 验证 Todo 参数
 */
function validateTodoParams(params: TodoParams): string | null {
  switch (params.action) {
    case "add":
      if (!params.content || params.content.trim() === "") {
        return "Content is required for add action"
      }
      break
    case "update":
      if (!params.id) {
        return "ID is required for update action"
      }
      if (!params.status) {
        return "Status is required for update action"
      }
      break
    case "remove":
      if (!params.id) {
        return "ID is required for remove action"
      }
      break
  }
  return null
}

/**
 * 格式化任务列表
 */
function formatTodoList(items: TodoItem[]): string {
  if (items.length === 0) {
    return "No tasks"
  }

  // 统计
  const stats = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  }
  for (const item of items) {
    stats[item.status]++
  }

  const lines: string[] = []
  lines.push(`Tasks: ${items.length} total`)
  lines.push(`  ${stats.completed} completed, ${stats.in_progress} in progress, ${stats.pending} pending`)
  lines.push("")

  // 按层级组织
  const rootItems = items.filter((i) => !i.parentId)
  for (const item of rootItems) {
    lines.push(formatTodoItem(item))
    // 子任务
    const children = items.filter((i) => i.parentId === item.id)
    for (const child of children) {
      lines.push("  " + formatTodoItem(child))
    }
  }

  return lines.join("\n")
}

/**
 * 格式化单个任务
 */
function formatTodoItem(item: TodoItem): string {
  const icon = getStatusIcon(item.status)
  return `${icon} [${item.id}] ${item.content}`
}

/**
 * 获取状态图标
 */
function getStatusIcon(status: TodoStatus): string {
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
