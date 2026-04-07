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
  CompressionConfig as SubTaskCompressionConfig,
  // Base config
  SubTaskBaseConfig,
  // ask_llm (原 API)
  AskLlmConfig,
  // run_agent (原 Agent)
  RunAgentConfig,
  // fork_agent (新增)
  InheritConfig,
  ForkAgentConfig,
  ParentContext,
  // run_workflow (原 Workflow)
  RunWorkflowConfig,
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
// Events (子 Agent 事件系统)
// ============================================================================

export type {
  SubAgentMode,
  SubAgentEventType,
  SubAgentStartEvent,
  SubAgentTextEvent,
  SubAgentToolStartEvent,
  SubAgentToolEndEvent,
  SubAgentStepEvent,
  SubAgentThinkingEvent,
  SubAgentEndEvent,
  SubAgentChildStartEvent,
  SubAgentChildEndEvent,
  SubAgentConfigEvent,
  SubAgentRetryEvent,
  SubAgentEvent,
  SubAgentEventListener,
  SubAgentEmitter,
  CreateSubAgentEmitterOptions,
} from "./events"

export {
  generateSubAgentId,
  createSubAgentEmitter,
} from "./events"

// Global listener
export {
  setGlobalSubAgentEventListener,
  getGlobalSubAgentEventListener,
  addGlobalSubAgentEventListener,
  removeGlobalSubAgentEventListener,
} from "./global-listener"

// ============================================================================
// ask_llm Mode (原 API)
// ============================================================================

export {
  runAskLlm,
} from "./ask-llm"

// ============================================================================
// run_agent Mode (原 Agent)
// ============================================================================

export {
  runRunAgent,
  type RunAgentRuntime,
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
  registerWorkflow,
  getWorkflow,
  listWorkflows,
  clearWorkflows,
  type RunWorkflowRuntime,
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
  DEFAULT_COMPRESSION_CONFIG as SUBTASK_DEFAULT_COMPRESSION_CONFIG,
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
// Error Types (结构化错误定义)
// ============================================================================

export {
  // Enum
  SubAgentErrorType,
  // Interfaces
  type SubAgentErrorContext,
  type SubAgentError,
  // Class
  SubAgentErrorClass,
  // Factory functions
  createConfigError,
  createAgentNotFoundError,
  createTimeoutError,
  createAbortedError,
  createLLMError,
  createToolError,
  createConcurrencyError,
  createRetryExhaustedError,
  // Type guards
  isSubAgentError,
  isSubAgentErrorClass,
  isErrorType,
  isRetryableErrorType,
  isUserCancelledError,
  isConfigRelatedError,
  // Conversion utilities
  fromError,
  inferErrorType,
  toErrorClass,
  // Formatting
  formatErrorMessage,
  getErrorTypeDescription,
} from "./errors"

// ============================================================================
// Error Handling
// ============================================================================

export {
  type RetryConfig,
  type FallbackConfig,
  type TimeoutConfig,
  type ErrorHandlerConfig,
  type RetryEvent,
  type RetryAttempt,
  type ComprehensiveErrorReport,
  DEFAULT_RETRY_CONFIG,
  isRetryableError,
  isRetryableSubAgentError,
  shouldRetryError,
  convertToSubAgentError,
  calculateDelay,
  createComprehensiveErrorReport,
  errorReportToResult,
  runWithErrorHandler,
  withRetry,
  withFallback,
  withTimeout_ as withTimeout,
  combineErrorHandlers,
  ErrorHandlerBuilder,
  errorHandler,
} from "./error-handler"

// ============================================================================
// Configuration Management
// ============================================================================

export type {
  RetrySettings,
  SubAgentConfig,
  ConfigValidationError,
  ConfigValidationResult,
  ConfigManager,
} from "./config"

export {
  DEFAULT_RETRY_SETTINGS,
  DEFAULT_CONFIG as DEFAULT_SUBAGENT_CONFIG,
  FROZEN_DEFAULT_CONFIG as FROZEN_DEFAULT_SUBAGENT_CONFIG,
  ENV_VAR_NAMES as SUBAGENT_ENV_VAR_NAMES,
  CONFIG_FILE_NAME as SUBAGENT_CONFIG_FILE_NAME,
  ConfigLoadError,
  mergeConfig as mergeSubAgentConfig,
  freezeConfig as freezeSubAgentConfig,
  validateConfig as validateSubAgentConfig,
  loadConfigFromEnv as loadSubAgentConfigFromEnv,
  loadConfigFromFile as loadSubAgentConfigFromFile,
  loadConfig as loadSubAgentConfig,
  createConfigManager as createSubAgentConfigManager,
  getConfigManager as getSubAgentConfigManager,
  resetConfigManager as resetSubAgentConfigManager,
} from "./config"

// ============================================================================
// Concurrency Controller (并发控制器)
// ============================================================================

export type {
  ConcurrencyConfig,
  TaskResult,
  TaskStatus,
  ConcurrencyResult,
  ConcurrencyTaskExecutor,
  ProgressCallback,
  ConcurrencyProgress,
  ConcurrencyController,
  ConcurrencyControllerFactory,
  ConcurrencyRunOptions,
  // Internal types (for advanced usage)
  QueuedTask as ConcurrencyQueuedTask,
  QueueState as ConcurrencyQueueState,
} from "./concurrency"

export {
  DEFAULT_CONCURRENCY_CONFIG,
  mergeConcurrencyConfig,
  validateConcurrencyConfig,
  createConcurrencyController,
} from "./concurrency"

// ============================================================================
// Agent Registry (自定义 Agent 注册表)
// ============================================================================

export type {
  PermissionMode,
  CustomAgentDefinition,
  AgentFrontmatter,
  AgentValidationResult,
  AgentRegistry,
  AgentRegistryConfig,
  CreateAgentRegistry,
} from "./agent-registry"

export {
  DEFAULT_CUSTOM_AGENTS_DIR,
  AGENT_FILE_EXTENSION,
  REQUIRED_FIELDS as AGENT_REQUIRED_FIELDS,
  VALID_PERMISSION_MODES,
  validateAgentDefinition,
  parseAgentFile,
  createAgentRegistry,
  getAgentRegistry,
  resetAgentRegistry,
} from "./agent-registry"

// ============================================================================
// SharedContext (融合代理共享状态)
// ============================================================================

export type {
  SharedEntryType,
  SharedEntry,
  SharedContextConfig,
  SharedContextSnapshot,
} from "./shared-context"

export {
  SharedContext,
  createSharedContext,
  getSharedContext,
  removeSharedContext,
  clearAllSharedContexts,
} from "./shared-context"

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

