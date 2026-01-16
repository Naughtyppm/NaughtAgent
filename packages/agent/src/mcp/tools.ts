/**
 * MCP Tools 集成
 *
 * 将 MCP 工具转换为 NaughtyAgent 工具格式
 */

import { Tool } from "../tool/tool"
import type { McpClient } from "./client"
import type { McpTool, McpToolResult, McpContent } from "./types"

// ============================================================================
// Types
// ============================================================================

/**
 * MCP 工具包装器类型
 */
export interface McpToolWrapper {
  name: string
  description: string
  parameters: {
    type: string
    properties: Record<string, unknown>
    required: string[]
  }
  execute: (params: unknown, context: Tool.Context) => Promise<Tool.Result>
}

// ============================================================================
// Tool Wrapper
// ============================================================================

/**
 * 创建 MCP 工具包装器
 *
 * 将 MCP 工具转换为 NaughtAgent Tool 格式
 */
export function createMcpToolWrapper(
  client: McpClient,
  mcpTool: McpTool
): McpToolWrapper {
  // 使用前缀避免命名冲突
  const toolName = `mcp_${client.name}_${mcpTool.name}`

  return {
    name: toolName,
    description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
    parameters: {
      type: "object",
      properties: mcpTool.inputSchema.properties || {},
      required: mcpTool.inputSchema.required || [],
    },
    execute: async (params: unknown, _context: Tool.Context): Promise<Tool.Result> => {
      try {
        const result = await client.callTool(mcpTool.name, params)
        return formatMcpResult(result)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          title: "Error",
          output: `Error calling MCP tool ${mcpTool.name}: ${message}`,
          isError: true,
        }
      }
    },
  }
}

/**
 * 格式化 MCP 工具结果
 */
function formatMcpResult(result: McpToolResult): Tool.Result {
  const output = result.content
    .map((content) => formatMcpContent(content))
    .join("\n")

  return {
    title: result.isError ? "Error" : "Success",
    output,
    isError: result.isError,
  }
}

/**
 * 格式化 MCP 内容
 */
function formatMcpContent(content: McpContent): string {
  switch (content.type) {
    case "text":
      return content.text
    case "image":
      return `[Image: ${content.mimeType}]`
    case "resource":
      if (content.resource.text) {
        return content.resource.text
      }
      return `[Resource: ${content.resource.uri}]`
    default:
      return "[Unknown content type]"
  }
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * 从 MCP Client 加载工具并注册到 ToolRegistry
 */
export async function loadMcpTools(client: McpClient): Promise<McpToolWrapper[]> {
  const mcpTools = await client.listTools()
  const tools: McpToolWrapper[] = []

  for (const mcpTool of mcpTools) {
    const tool = createMcpToolWrapper(client, mcpTool)
    // Note: ToolRegistry expects Tool.Definition, this is a simplified wrapper
    // In production, you'd need to properly convert or use a different registry
    tools.push(tool)
  }

  return tools
}

/**
 * 从 MCP Client 卸载工具
 */
export function unloadMcpTools(_client: McpClient, _tools: McpToolWrapper[]): void {
  // Note: ToolRegistry.unregister doesn't exist yet
  // This is a placeholder for future implementation
}

// ============================================================================
// Tool Info
// ============================================================================

/**
 * MCP 工具信息（用于显示）
 */
export interface McpToolInfo {
  /** 原始 MCP 工具名 */
  mcpName: string
  /** 注册的工具名 */
  registeredName: string
  /** 来源服务器 */
  serverName: string
  /** 描述 */
  description?: string
}

/**
 * 获取 MCP 工具信息
 */
export function getMcpToolInfo(client: McpClient, mcpTool: McpTool): McpToolInfo {
  return {
    mcpName: mcpTool.name,
    registeredName: `mcp_${client.name}_${mcpTool.name}`,
    serverName: client.name,
    description: mcpTool.description,
  }
}

/**
 * 检查工具是否是 MCP 工具
 */
export function isMcpTool(toolName: string): boolean {
  return toolName.startsWith("mcp_")
}

/**
 * 解析 MCP 工具名
 */
export function parseMcpToolName(toolName: string): {
  serverName: string
  mcpToolName: string
} | null {
  if (!isMcpTool(toolName)) {
    return null
  }

  // 格式: mcp_<serverName>_<toolName>
  const parts = toolName.slice(4).split("_")
  if (parts.length < 2) {
    return null
  }

  const serverName = parts[0]
  const mcpToolName = parts.slice(1).join("_")

  return { serverName, mcpToolName }
}
