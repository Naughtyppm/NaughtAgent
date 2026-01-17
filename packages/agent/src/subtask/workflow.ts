/**
 * Workflow 模式 - 预定义流程执行
 *
 * @deprecated 此文件已重命名为 run-workflow.ts，请使用新的导入路径
 *
 * 中等灵活度的子任务模式：
 * - 预定义步骤
 * - 支持条件分支
 * - 支持并行执行
 * - 上下文在步骤间传递
 */

// 重新导出新模块的内容，保持向后兼容
export {
  runRunWorkflow as runWorkflowTask,
  registerWorkflow,
  getWorkflow,
  listWorkflows,
  clearWorkflows,
  type RunWorkflowRuntime as WorkflowModeRuntime,
} from "./run-workflow"
export type { RunWorkflowConfig as WorkflowTaskConfig } from "./types"
