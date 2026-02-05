/**
 * 统一命令系统 (Unified Command System)
 *
 * 提供三层命令架构的统一入口：
 * - Builtin Layer: 内置命令，同步执行
 * - External Layer: 外部命令（justfile），子进程执行
 * - Skill Layer: AI 技能，工作流执行
 *
 * @module command
 */

// ============================================================================
// 类型导出
// ============================================================================

// 核心类型
export type {
  CommandLayer,
  ExecutionMode,
  CommandSource,
  CommandParameter,
  UnifiedCommand,
  RoutingType,
  RoutingResult,
  ExecutionResult,
} from './types.js'

// 常量
export { LAYER_PRIORITY, LAYER_ICONS } from './types.js'

// ============================================================================
// 注册表 (Registry)
// ============================================================================

export type {
  RegistryErrors,
  UnifiedRegistryConfig,
  UnifiedRegistry,
} from './registry.js'

export { createUnifiedRegistry, createSyncRegistry } from './registry.js'

// ============================================================================
// 路由器 (Router)
// ============================================================================

export type { CommandRouter, ParsedCommand } from './router.js'

export { createCommandRouter, parseArguments } from './router.js'

// ============================================================================
// 调度器 (Dispatcher)
// ============================================================================

export type { DispatchContext, CommandDispatcher } from './dispatcher.js'

export { createCommandDispatcher } from './dispatcher.js'

// ============================================================================
// 补全提供器 (Completion)
// ============================================================================

export type { CompletionSuggestion, CompletionProvider } from './completion.js'

export {
  createCompletionProvider,
  getSuggestions,
  formatSuggestion,
} from './completion.js'

// ============================================================================
// 错误诊断 (Diagnostics)
// ============================================================================

export type {
  ErrorType,
  FixAction,
  DiagnosticResult,
  DiagnosticContext,
  CommandLookup,
} from './diagnostics.js'

export {
  ErrorDiagnostics,
  createErrorDiagnostics,
  levenshteinDistance,
} from './diagnostics.js'

// ============================================================================
// 内置命令 (Builtin)
// ============================================================================

export type {
  AppState,
  BuiltinContext,
  BuiltinHandler,
  BuiltinCommandDefinition,
} from './builtin/types.js'

export {
  getBuiltinCommandDefinitions,
  convertToUnifiedCommands,
  getBuiltinCommand,
  registerBuiltinCommand,
} from './builtin/index.js'

// ============================================================================
// 别名管理器 (Alias Manager)
// ============================================================================

export type {
  AliasDefinition,
  AliasConfig,
  AliasManager,
} from './alias.js'

export {
  createAliasManager,
  DEFAULT_ALIAS_FILE,
  DEFAULT_BUILTIN_COMMANDS,
} from './alias.js'

// ============================================================================
// 历史管理器 (History Manager)
// ============================================================================

export type {
  HistoryEntry,
  HistoryConfig,
  HistoryManager,
} from './history-manager.js'

export {
  createHistoryManager,
  DEFAULT_HISTORY_FILE,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_HISTORY_CONFIG,
} from './history-manager.js'

// ============================================================================
// 管道执行器 (Pipeline Executor)
// ============================================================================

export type {
  PipelineStage,
  PipelineResult,
  CommandExecutor,
} from './pipeline.js'

export {
  hasPipe,
  parsePipeline,
  executePipeline,
} from './pipeline.js'

// ============================================================================
// 链式执行器 (Chain Executor)
// ============================================================================

export type {
  ChainOperator,
  ChainSegment,
  ChainResult,
} from './chain.js'

export {
  hasChain,
  parseChain,
  executeChain,
} from './chain.js'

// ============================================================================
// 集成模块 (Integration)
// ============================================================================

export type {
  EnhancedRouterConfig,
  EnhancedDispatcherConfig,
  EnhancedRouter,
  EnhancedDispatcher,
} from './integration.js'

export {
  createEnhancedRouter,
  createEnhancedDispatcher,
} from './integration.js'
