/**
 * MCP (Model Context Protocol) 模块
 *
 * 连接外部 MCP 服务器，动态加载工具
 */

// Types
export type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  JsonRpcNotification,
  McpTransportType,
  McpServerConfig,
  McpConfig,
  McpClientCapabilities,
  McpServerCapabilities,
  McpServerInfo,
  McpInitializeResult,
  McpTool,
  McpToolInputSchema,
  McpJsonSchema,
  McpToolResult,
  McpContent,
  McpTextContent,
  McpImageContent,
  McpResourceContent,
  McpResource,
  McpResourceContents,
  McpPrompt,
  McpPromptArgument,
  McpPromptMessage,
  McpGetPromptResult,
  McpClientState,
  McpClientEvent,
  McpEventHandler,
  McpTransport,
} from "./types"

export {
  MCP_PROTOCOL_VERSION,
  DEFAULT_TIMEOUT as MCP_DEFAULT_TIMEOUT,
  JSON_RPC_ERRORS,
} from "./types"

// Transport
export {
  StdioTransport,
  SseTransport,
  createTransport,
} from "./transport"

// Client
export {
  McpClient,
  createMcpClient,
} from "./client"

// Pool
export {
  McpClientPool,
  type ClientInfo,
  type HealthCheckConfig,
} from "./pool"

// Retry
export {
  connectWithRetry,
  retryOperation,
  calculateBackoffDelay,
  createRetryConfig,
  DEFAULT_RETRY_CONFIG as MCP_DEFAULT_RETRY_CONFIG,
  type RetryConfig as McpRetryConfig,
  type RetryResult,
} from "./retry"

// Adapter
export {
  wrapMcpTool,
  convertMcpResult,
  type WrapMcpToolOptions,
  type McpResultMetadata,
} from "./adapter"

// Tools
export {
  createMcpToolWrapper,
  loadMcpTools,
  unloadMcpTools,
  getMcpToolInfo,
  isMcpTool,
  parseMcpToolName,
  type McpToolInfo,
} from "./tools"

// Manager
export {
  McpManager,
  loadMcpConfig as loadMcpConfigLegacy,
  initMcpManager,
  getMcpManager,
  setMcpManager,
} from "./manager"

// Config
export {
  // Schemas
  McpServerConfigSchema,
  McpSettingsSchema,
  McpConfigSchema,
  // Types
  type McpSettings,
  type McpConfigWithSettings,
  type ConfigLoadResult,
  type ConfigChangeEvent,
  type ConfigChangeHandler,
  // Constants
  DEFAULT_SETTINGS,
  DEFAULT_CONFIG,
  // Functions
  replaceEnvVars,
  validateConfig,
  loadConfigFromJson,
  loadMcpConfigFromFile,
  loadMcpConfig,
  compareConfigs,
  // Hot Reload
  ConfigHotReloader,
  createConfigHotReloader,
} from "./config"
