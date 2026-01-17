/**
 * SubTask 子任务系统
 *
 * 提供四种执行模式：
 * - ask_llm: 单次 LLM 调用，无工具
 * - run_agent: 独立子 Agent Loop
 * - fork_agent: 继承父会话上下文的子 Agent
 * - run_workflow: 预定义流程执行
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Mode types
  SubTaskMode,
  SubTaskModeNew,
  // Token budget
  TokenBudget,
  ContextSummary,
  CompressionStrategy,
  CompressionConfig,
  // Base config
  SubTaskBaseConfig,
  // ask_llm (原 API)
  AskLlmConfig,
  APITaskConfig, // deprecated
  // run_agent (原 Agent)
  RunAgentConfig,
  AgentTaskConfig, // deprecated
  // fork_agent (新增)
  InheritConfig,
  ForkAgentConfig,
  ParentContext,
  // run_workflow (原 Workflow)
  RunWorkflowConfig,
  WorkflowTaskConfig, // deprecated
  // Unified config
  SubTaskConfig,
  // Execution types
  SubTaskStep,
  TaskExecutionStatus,
  TaskExecution,
  SubTaskResult,
  // Workflow types
  WorkflowContext,
  WorkflowStepType,
  WorkflowStep,
  WorkflowDefinition,
  // Provider interfaces
  SubTaskProvider,
  SubTaskToolExecutor,
} from "./types"

export { DEFAULT_TOKEN_BUDGET } from "./types"

// ============================================================================
// ask_llm Mode (原 API)
// ============================================================================

export {
  runAskLlm,
  runAPITask, // deprecated alias
} from "./ask-llm"

// ============================================================================
// run_agent Mode (原 Agent)
// ============================================================================

export {
  runRunAgent,
  runAgentTask, // deprecated alias
  type RunAgentRuntime,
  type AgentModeRuntime, // deprecated alias
} from "./run-agent"

// ============================================================================
// fork_agent Mode (新增)
// ============================================================================

export {
  runForkAgent,
  type ForkAgentRuntime,
} from "./fork-agent"

// ============================================================================
// run_workflow Mode (原 Workflow)
// ============================================================================

export {
  runRunWorkflow,
  runWorkflowTask, // deprecated alias
  registerWorkflow,
  getWorkflow,
  listWorkflows,
  clearWorkflows,
  type RunWorkflowRuntime,
  type WorkflowModeRuntime, // deprecated alias
} from "./run-workflow"

// ============================================================================
// Context Management
// ============================================================================

export {
  // Budget
  type TokenCounter,
  SimpleTokenCounter,
  defaultTokenCounter,
  TokenBudgetManager,
  createTokenBudgetManager,
  // Summary
  DEFAULT_COMPRESSION_CONFIG,
  type MessageImportance,
  evaluateMessageImportance,
  compressBySlidingWindow,
  compressByImportance,
  compressMessages,
  extractKeyFiles,
  extractKeyDecisions,
  generateSimpleSummary,
  generateLLMSummary,
  // Manager
  type ContextManagerConfig,
  type PreparedContext,
  ContextManager,
  createContextManager,
} from "./context"

// ============================================================================
// Queue Management
// ============================================================================

export {
  type QueuedTask,
  type ExecutorStatus,
  type ExecutorEvent,
  type ExecutorEventListener,
  type TaskExecutorConfig,
  TaskExecutor,
  createTaskExecutor,
} from "./queue"

// ============================================================================
// Chain API
// ============================================================================

export {
  SubTaskChain,
  createChain,
  chain,
} from "./chain"

// ============================================================================
// Error Handling
// ============================================================================

export {
  type RetryConfig,
  type FallbackConfig,
  type TimeoutConfig,
  type ErrorHandlerConfig,
  DEFAULT_RETRY_CONFIG,
  isRetryableError,
  calculateDelay,
  runWithErrorHandler,
  withRetry,
  withFallback,
  withTimeout_ as withTimeout,
  combineErrorHandlers,
  ErrorHandlerBuilder,
  errorHandler,
} from "./error-handler"

// ============================================================================
// Runner (统一入口)
// ============================================================================

export {
  runSubTask,
  SubTask,
  createSubTask,
  type SubTaskRuntime,
} from "./runner"

// ============================================================================
// Task Tool
// ============================================================================

export {
  TaskTool,
  setTaskRuntime,
  getTaskRuntime,
  type TaskParams,
} from "./task-tool"

// ============================================================================
// Backward Compatibility (向后兼容)
// ============================================================================

// 保留旧的导出名称，标记为 deprecated
/** @deprecated 使用 runAskLlm */
export { runAskLlm as runAPITask_v2 }
/** @deprecated 使用 runRunAgent */
export { runRunAgent as runAgentTask_v2 }
/** @deprecated 使用 runRunWorkflow */
export { runRunWorkflow as runWorkflowTask_v2 }
