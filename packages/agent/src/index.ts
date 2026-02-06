/**
 * @naughtyagent/agent
 *
 * NaughtyAgent 核心 Agent 服务
 */

// Tool 工具系统
export * from "./tool"

// Provider LLM 调用 (排除与其他模块冲突的类型)
export {
  // Types
  type ProviderType,
  type ModelConfig,
  type TokenUsage as ProviderTokenUsage,
  type StreamEvent as ProviderStreamEvent,
  type ToolDefinition as ProviderToolDefinition,
  type MessageRole as ProviderMessageRole,
  type TextContent,
  type ImageContent,
  type ToolUseContent,
  type ToolResultContent,
  type MessageContent,
  type Message as ProviderMessage,
  type ChatParams,
  type ChatResult,
  type LLMProvider,
  type AnthropicConfig,
  type KiroConfig,
  type ProviderConfig,
  // Constants
  DEFAULT_MODEL,
  FAST_MODEL,
  KIRO_MODEL_MAP,
  KIRO_MODELS,
  mapToKiroModel,
  // Factories
  createAnthropicProvider,
  createKiroProvider,
  createProvider,
  createProviderFromEnv,
} from "./provider"

// Session 会话系统
export * from "./session"

// Agent 系统 (排除与 Session 重复的类型)
export {
  type AgentMode,
  type AgentEvent,
  type AgentDefinition,
  type AgentRunConfig,
  BUILTIN_AGENTS,
  getAgentDefinition,
  listAgents,
  getSystemPrompt,
  buildSystemPrompt,
  type SystemPromptContext,
  createAgentLoop,
  type AgentLoop,
  type AgentLoopConfig,
} from "./agent"

// Permission 权限系统
export * from "./permission"

// Context 上下文系统
export * from "./context"

// Token 管理系统 (排除与 ./context 和 ./tool 冲突的类型)
export {
  // Types
  type TokenCount,
  type TokenLimits,
  type TruncateStrategy,
  type TruncateResult,
  type ToolDefinition as TokenToolDefinition,
  type TokenManager,
  // Constants
  DEFAULT_TOKEN_LIMITS,
  // Functions
  estimateTokens,
  countMessageTokens,
  countMessagesTokens,
  countToolsTokens,
  countContextTokens,
  needsTruncation,
  getAvailableTokens,
  truncateDropOld,
  truncateSlidingWindow,
  truncateMessages,
  createTokenManager,
  // 截断器 (排除 TruncationResult，已由 ./tool 导出)
  type TruncationStrategy,
  type TruncationConfig,
  type GrepMatch,
  type ToolOutputTruncator,
  DEFAULT_TRUNCATION_CONFIG,
  createTruncator,
  // 压缩器 (排除 CompressionResult/TokenCompressor，已由 ./context 导出)
  type CompressionConfig,
  DEFAULT_COMPRESSION_CONFIG,
  createCompressor,
} from "./token"

// Security 安全系统
export * from "./security"

// UX 用户体验
export * from "./ux"

// SubTask 子任务系统
export * from "./subtask"

// Interaction 交互工具
export * from "./interaction"

// Skill 技能系统
export * from "./skill"

// Rules 索引系统 (排除与 context 冲突的 loadRules)
export {
  // Types
  type RuleTrigger,
  type GlobTrigger,
  type CommandTrigger,
  type KeywordTrigger,
  type ToolTrigger,
  type RuleMeta,
  type RulesIndex,
  type LoadedRule,
  type MatchContext,
  type CommandSource,
  type ProjectCommand,
  type CommandsIndex,
  type RulesConfig,
  type CommandsConfig,
  DEFAULT_RULES_CONFIG,
  DEFAULT_COMMANDS_CONFIG,
  // Matcher
  matchGlob,
  matchTrigger,
  matchRule,
  matchRules,
  getAlwaysLoadRules,
  extractFilePaths,
  buildMatchContext,
  // Loader (重命名 loadRules 为 loadRuleContents 避免冲突)
  loadRulesIndex,
  generateDefaultIndex,
  loadRule,
  loadRules as loadRuleContents,
  loadAlwaysRules,
  loadMatchedRules,
  RulesLoader,
  buildRulesPrompt,
  // Commands
  parseJustfile,
  parseMakefile,
  parsePackageScripts,
  detectPackageManager,
  scanScriptsDir,
  discoverCommands,
  CommandsDiscovery,
  buildCommandsPrompt,
} from "./rules"

// Server HTTP API
export * from "./server"

// Command 统一命令系统 (排除与 ./ux 冲突的 HistoryConfig)
export {
  // 核心类型
  type CommandLayer,
  type ExecutionMode,
  type CommandSource as CmdCommandSource,
  type CommandParameter,
  type UnifiedCommand,
  type RoutingType,
  type RoutingResult,
  type ExecutionResult,
  LAYER_PRIORITY,
  LAYER_ICONS,
  // 注册表
  type RegistryErrors,
  type UnifiedRegistryConfig,
  type UnifiedRegistry,
  createUnifiedRegistry,
  createSyncRegistry,
  // 路由器
  type CommandRouter,
  type ParsedCommand,
  createCommandRouter,
  parseArguments,
  // 调度器
  type DispatchContext,
  type CommandDispatcher,
  createCommandDispatcher,
  // 补全
  type CompletionSuggestion,
  type CompletionProvider,
  createCompletionProvider,
  getSuggestions,
  formatSuggestion,
  // 错误诊断
  type ErrorType,
  type FixAction,
  type DiagnosticResult,
  type DiagnosticContext,
  type CommandLookup,
  ErrorDiagnostics,
  createErrorDiagnostics,
  levenshteinDistance,
  // 内置命令
  type AppState,
  type BuiltinContext,
  type BuiltinHandler,
  type BuiltinCommandDefinition,
  getBuiltinCommandDefinitions,
  convertToUnifiedCommands,
  getBuiltinCommand,
  registerBuiltinCommand,
  // 别名
  type AliasDefinition,
  type AliasConfig,
  type AliasManager,
  createAliasManager,
  DEFAULT_ALIAS_FILE,
  DEFAULT_BUILTIN_COMMANDS,
  // 历史 (排除 HistoryConfig，已由 ./ux 导出)
  type HistoryEntry,
  type HistoryConfig as CommandHistoryConfig,
  type HistoryManager,
  createHistoryManager,
  DEFAULT_HISTORY_FILE,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_HISTORY_CONFIG,
  // 管道
  type PipelineStage,
  type PipelineResult,
  type CommandExecutor,
  hasPipe,
  parsePipeline,
  executePipeline,
  // 链式
  type ChainOperator,
  type ChainSegment,
  type ChainResult,
  hasChain,
  parseChain,
  executeChain,
  // 集成
  type EnhancedRouterConfig,
  type EnhancedDispatcherConfig,
  type EnhancedRouter,
  type EnhancedDispatcher,
  createEnhancedRouter,
  createEnhancedDispatcher,
} from "./command"

// MCP 协议支持
export * from "./mcp"

// CLI 运行器
export {
  createRunner,
  type Runner,
  type RunnerConfig,
  type RunnerEventHandlers,
} from "./cli"
