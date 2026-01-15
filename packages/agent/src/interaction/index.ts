/**
 * 交互工具模块
 *
 * 提供 Agent 与用户交互的能力：
 * - question: 向用户提问
 * - todo: 任务管理
 */

// Types
export type {
  QuestionType,
  QuestionOption,
  Question,
  QuestionResult,
  TodoStatus,
  TodoItem,
  TodoList,
  TodoAction,
  TodoResult,
  QuestionCallback,
  TodoUpdateCallback,
  InteractionCallbacks,
} from "./types"

// Callbacks
export {
  setInteractionCallbacks,
  getInteractionCallbacks,
  resetInteractionCallbacks,
  invokeQuestionCallback,
  invokeTodoUpdateCallback,
  createDefaultCliCallbacks,
} from "./callbacks"

// Question Tool
export {
  QuestionTool,
  type QuestionParams,
} from "./question"

// Todo Tool
export {
  TodoTool,
  resetIdCounter,
  clearAllTodoLists,
  type TodoParams,
} from "./todo"
