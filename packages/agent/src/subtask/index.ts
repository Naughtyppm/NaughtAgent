/**
 * SubTask 子任务系统
 *
 * 提供三种执行模式：
 * - API: 单次 LLM 调用，无工具
 * - Workflow: 预定义流程执行
 * - Agent: 子 Agent Loop
 */

// Types
export type {
  SubTaskMode,
  SubTaskBaseConfig,
  APITaskConfig,
  WorkflowTaskConfig,
  AgentTaskConfig,
  SubTaskConfig,
  SubTaskStep,
  SubTaskResult,
  WorkflowContext,
  WorkflowStepType,
  WorkflowStep,
  WorkflowDefinition,
  SubTaskProvider,
  SubTaskToolExecutor,
} from "./types"

// API Mode
export { runAPITask } from "./api"

// Workflow Mode
export {
  runWorkflowTask,
  registerWorkflow,
  getWorkflow,
  listWorkflows,
  clearWorkflows,
  type WorkflowModeRuntime,
} from "./workflow"

// Agent Mode
export {
  runAgentTask,
  type AgentModeRuntime,
} from "./agent"

// Runner
export {
  runSubTask,
  type SubTaskRuntime,
} from "./runner"

// Task Tool
export {
  TaskTool,
  setTaskRuntime,
  getTaskRuntime,
  type TaskParams,
} from "./task-tool"
