/**
 * 交互工具类型定义
 */

// ============================================================================
// Question Types
// ============================================================================

/**
 * 问题类型
 */
export type QuestionType = "confirm" | "select" | "multiselect" | "text"

/**
 * 选项定义
 */
export interface QuestionOption {
  /** 选项值 */
  value: string
  /** 显示标签 */
  label: string
  /** 描述（可选） */
  description?: string
}

/**
 * 问题定义
 */
export interface Question {
  /** 问题类型 */
  type: QuestionType
  /** 问题文本 */
  message: string
  /** 选项（select/multiselect 时必需） */
  options?: QuestionOption[]
  /** 默认值 */
  default?: string | boolean | string[]
}

/**
 * 问题结果
 */
export interface QuestionResult {
  /** 是否已回答 */
  answered: boolean
  /** 回答值 */
  value: string | boolean | string[] | null
  /** 是否取消 */
  cancelled?: boolean
}

// ============================================================================
// Todo Types
// ============================================================================

/**
 * 任务状态
 */
export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled"

/**
 * 任务项
 */
export interface TodoItem {
  /** 任务 ID */
  id: string
  /** 任务内容 */
  content: string
  /** 状态 */
  status: TodoStatus
  /** 父任务 ID（子任务时） */
  parentId?: string
  /** 创建时间 */
  createdAt: number
  /** 更新时间 */
  updatedAt: number
}

/**
 * 任务列表
 */
export interface TodoList {
  /** 会话 ID */
  sessionId: string
  /** 任务列表 */
  items: TodoItem[]
}

/**
 * Todo 操作类型
 */
export type TodoAction = "add" | "update" | "remove" | "list" | "clear"

/**
 * Todo 工具结果
 */
export interface TodoResult {
  /** 是否成功 */
  success: boolean
  /** 操作的任务 */
  item?: TodoItem
  /** 任务列表（list 时） */
  items?: TodoItem[]
  /** 消息 */
  message: string
}

// ============================================================================
// Callback Types
// ============================================================================

/**
 * 问题回调
 */
export type QuestionCallback = (question: Question) => Promise<QuestionResult>

/**
 * 任务更新回调
 */
export type TodoUpdateCallback = (list: TodoList) => void

/**
 * 交互回调集合
 */
export interface InteractionCallbacks {
  /** 问题回调 */
  onQuestion?: QuestionCallback
  /** 任务更新回调 */
  onTodoUpdate?: TodoUpdateCallback
}
