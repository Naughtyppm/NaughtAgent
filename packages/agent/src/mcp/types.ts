/**
 * MCP (Model Context Protocol) 类型定义
 *
 * MCP 是 Anthropic 推出的开放协议，用于 AI 应用与外部工具的标准化连接
 */

// ============================================================================
// JSON-RPC 2.0
// ============================================================================

/**
 * JSON-RPC 请求
 */
export interface JsonRpcRequest {
  jsonrpc: "2.0"
  id: string | number
  method: string
  params?: unknown
}

/**
 * JSON-RPC 响应
 */
export interface JsonRpcResponse {
  jsonrpc: "2.0"
  id: string | number
  result?: unknown
  error?: JsonRpcError
}

/**
 * JSON-RPC 错误
 */
export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

/**
 * JSON-RPC 通知（无需响应）
 */
export interface JsonRpcNotification {
  jsonrpc: "2.0"
  method: string
  params?: unknown
}

// ============================================================================
// Server Configuration
// ============================================================================

/**
 * 传输方式
 */
export type McpTransportType = "stdio" | "sse"

/**
 * MCP 服务器配置
 */
export interface McpServerConfig {
  /** 服务器名称（唯一标识） */
  name: string
  /** 传输方式 */
  transport: McpTransportType
  /** stdio: 要执行的命令 */
  command?: string
  /** stdio: 命令参数 */
  args?: string[]
  /** stdio: 环境变量 */
  env?: Record<string, string>
  /** stdio: 工作目录 */
  cwd?: string
  /** sse: 服务器 URL */
  url?: string
  /** sse: HTTP 头 */
  headers?: Record<string, string>
  /** 连接超时（毫秒） */
  timeout?: number
}

/**
 * MCP 配置文件
 */
export interface McpConfig {
  /** 服务器列表 */
  servers: McpServerConfig[]
}

// ============================================================================
// Capabilities
// ============================================================================

/**
 * 客户端能力
 */
export interface McpClientCapabilities {
  /** 实验性功能 */
  experimental?: Record<string, unknown>
  /** 采样支持 */
  sampling?: Record<string, unknown>
}

/**
 * 服务器能力
 */
export interface McpServerCapabilities {
  /** 工具支持 */
  tools?: {
    listChanged?: boolean
  }
  /** 资源支持 */
  resources?: {
    subscribe?: boolean
    listChanged?: boolean
  }
  /** 提示模板支持 */
  prompts?: {
    listChanged?: boolean
  }
  /** 日志支持 */
  logging?: Record<string, unknown>
  /** 实验性功能 */
  experimental?: Record<string, unknown>
}

/**
 * 服务器信息
 */
export interface McpServerInfo {
  /** 服务器名称 */
  name: string
  /** 版本 */
  version: string
}

/**
 * 初始化结果
 */
export interface McpInitializeResult {
  /** 协议版本 */
  protocolVersion: string
  /** 服务器能力 */
  capabilities: McpServerCapabilities
  /** 服务器信息 */
  serverInfo: McpServerInfo
}

// ============================================================================
// Tools
// ============================================================================

/**
 * MCP 工具定义
 */
export interface McpTool {
  /** 工具名称 */
  name: string
  /** 描述 */
  description?: string
  /** 输入参数 JSON Schema */
  inputSchema: McpToolInputSchema
}

/**
 * 工具输入 Schema
 */
export interface McpToolInputSchema {
  type: "object"
  properties?: Record<string, McpJsonSchema>
  required?: string[]
  additionalProperties?: boolean
}

/**
 * JSON Schema 类型
 */
export interface McpJsonSchema {
  type?: string | string[]
  description?: string
  enum?: unknown[]
  items?: McpJsonSchema
  properties?: Record<string, McpJsonSchema>
  required?: string[]
  default?: unknown
  [key: string]: unknown
}

/**
 * 工具调用结果
 */
export interface McpToolResult {
  /** 内容列表 */
  content: McpContent[]
  /** 是否出错 */
  isError?: boolean
}

/**
 * 内容类型
 */
export type McpContent =
  | McpTextContent
  | McpImageContent
  | McpResourceContent

/**
 * 文本内容
 */
export interface McpTextContent {
  type: "text"
  text: string
}

/**
 * 图片内容
 */
export interface McpImageContent {
  type: "image"
  data: string
  mimeType: string
}

/**
 * 资源内容
 */
export interface McpResourceContent {
  type: "resource"
  resource: {
    uri: string
    mimeType?: string
    text?: string
    blob?: string
  }
}

// ============================================================================
// Resources
// ============================================================================

/**
 * MCP 资源
 */
export interface McpResource {
  /** 资源 URI */
  uri: string
  /** 名称 */
  name: string
  /** 描述 */
  description?: string
  /** MIME 类型 */
  mimeType?: string
}

/**
 * 资源内容
 */
export interface McpResourceContents {
  uri: string
  mimeType?: string
  text?: string
  blob?: string
}

// ============================================================================
// Prompts
// ============================================================================

/**
 * MCP 提示模板
 */
export interface McpPrompt {
  /** 名称 */
  name: string
  /** 描述 */
  description?: string
  /** 参数 */
  arguments?: McpPromptArgument[]
}

/**
 * 提示模板参数
 */
export interface McpPromptArgument {
  /** 参数名 */
  name: string
  /** 描述 */
  description?: string
  /** 是否必需 */
  required?: boolean
}

/**
 * 提示消息
 */
export interface McpPromptMessage {
  role: "user" | "assistant"
  content: McpContent
}

/**
 * 获取提示结果
 */
export interface McpGetPromptResult {
  description?: string
  messages: McpPromptMessage[]
}

// ============================================================================
// Client State
// ============================================================================

/**
 * 客户端状态
 */
export type McpClientState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"

/**
 * 客户端事件
 */
export type McpClientEvent =
  | { type: "connected"; serverInfo: McpServerInfo }
  | { type: "disconnected"; reason?: string }
  | { type: "error"; error: Error }
  | { type: "tools_changed" }
  | { type: "resources_changed" }
  | { type: "prompts_changed" }

/**
 * 事件处理器
 */
export type McpEventHandler = (event: McpClientEvent) => void

// ============================================================================
// Transport
// ============================================================================

/**
 * 传输层接口
 */
export interface McpTransport {
  /** 发送请求并等待响应 */
  request(method: string, params?: unknown): Promise<unknown>

  /** 发送通知（无需响应） */
  notify(method: string, params?: unknown): void

  /** 设置通知处理器 */
  onNotification(handler: (method: string, params: unknown) => void): void

  /** 关闭连接 */
  close(): Promise<void>

  /** 是否已连接 */
  readonly connected: boolean
}

// ============================================================================
// Constants
// ============================================================================

/**
 * MCP 协议版本
 */
export const MCP_PROTOCOL_VERSION = "2024-11-05"

/**
 * 默认超时时间（毫秒）
 */
export const DEFAULT_TIMEOUT = 30000

/**
 * JSON-RPC 错误码
 */
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const
