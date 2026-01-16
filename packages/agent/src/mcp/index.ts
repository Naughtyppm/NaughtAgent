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
  DEFAULT_TIMEOUT,
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
  loadMcpConfig,
  initMcpManager,
  getMcpManager,
  setMcpManager,
} from "./manager"
