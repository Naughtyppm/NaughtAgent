/**
 * @naughtagent/agent
 *
 * NaughtAgent 核心 Agent 服务
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

// Token 管理系统
export * from "./token"

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

// MCP 协议支持
export * from "./mcp"

// CLI 运行器
export {
  createRunner,
  type Runner,
  type RunnerConfig,
  type RunnerEventHandlers,
} from "./cli"
