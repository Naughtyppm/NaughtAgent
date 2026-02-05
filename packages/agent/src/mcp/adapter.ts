/**
 * MCP 工具适配器
 *
 * 将 MCP 工具包装为统一的 Tool.Definition 接口
 */

import { z } from "zod"
import type { McpTool, McpToolResult, McpContent } from "./types"
import type { McpClient } from "./client"
import { Tool } from "../tool/tool"
import { AgentError, ErrorCode } from "../error"

// ============================================================================
// Types
// ============================================================================

/**
 * MCP 工具包装选项
 */
export interface WrapMcpToolOptions {
  /** MCP 工具定义 */
  tool: McpTool
  /** MCP 客户端 */
  client: McpClient
  /** 服务器名称 */
  serverName: string
}

/**
 * MCP 结果元数据
 */
export interface McpResultMetadata {
  /** 内容类型列表 */
  contentTypes: string[]
  /** 是否包含图片 */
  hasImages: boolean
  /** 是否包含资源 */
  hasResources: boolean
  /** 是否为错误结果 */
  isError?: boolean
  /** 图片内容（可选） */
  images?: Array<{ mimeType: string; data: string }>
  /** 资源内容（可选） */
  resources?: unknown[]
  /** 允许其他动态属性 */
  [key: string]: unknown
}

// ============================================================================
// MCP Tool Wrapper
// ============================================================================

/**
 * 将 MCP 工具包装为 Tool.Definition
 *
 * @param options 包装选项
 * @returns Tool.Definition 实例
 */
export function wrapMcpTool(options: WrapMcpToolOptions): Tool.Definition {
  const { tool, client, serverName } = options

  // 生成工具 ID：${serverName}:${toolName}
  const toolId = `${serverName}:${tool.name}`

  // 从 MCP inputSchema 创建 Zod schema
  // 注意：这里简化处理，假设 inputSchema 是标准的 JSON Schema object
  const zodSchema = createZodSchemaFromMcpSchema(tool.inputSchema)

  return Tool.define({
    id: toolId,
    description: tool.description || `MCP tool: ${tool.name}`,
    parameters: zodSchema,
    source: "mcp",
    mcpServer: serverName,
    title: tool.name,
    inputSchema: tool.inputSchema as Tool.JsonSchema,

    execute: async (params, ctx) => {
      // 检查取消信号
      if (ctx.abort.aborted) {
        throw new AgentError(
          "Tool execution cancelled",
          ErrorCode.INTERNAL_ERROR,
          false,
          { tool: toolId }
        )
      }

      try {
        // 调用 MCP 工具
        const result = await client.callTool(tool.name, params)

        // 转换 MCP 结果为 Tool.Result
        return convertMcpResult(result, tool.name)
      } catch (error) {
        // 处理 MCP 调用错误
        const errorMessage =
          error instanceof Error ? error.message : String(error)

        // 检查是否为连接错误
        if (
          errorMessage.includes("Not connected") ||
          errorMessage.includes("connection")
        ) {
          throw new AgentError(
            `MCP server connection error: ${errorMessage}`,
            ErrorCode.NETWORK_ERROR,
            true,
            { tool: toolId, server: serverName, originalError: error }
          )
        }

        // 其他 MCP 工具执行错误
        throw new AgentError(
          `MCP tool execution failed: ${errorMessage}`,
          ErrorCode.TOOL_EXECUTION_ERROR,
          true,
          { tool: toolId, server: serverName, originalError: error }
        )
      }
    },
  })
}

// ============================================================================
// MCP Result Conversion
// ============================================================================

/**
 * 将 MCP 工具结果转换为 Tool.Result
 *
 * @param mcpResult MCP 工具结果
 * @param toolName 工具名称
 * @returns Tool.Result
 */
export function convertMcpResult(
  mcpResult: McpToolResult,
  toolName: string
): Tool.Result {
  // 提取文本内容
  const textContents = mcpResult.content
    .filter((c): c is Extract<McpContent, { type: "text" }> => c.type === "text")
    .map((c) => c.text)

  // 合并所有文本内容
  const output = textContents.join("\n\n")

  // 收集元数据
  const contentTypes = mcpResult.content.map((c) => c.type)
  const hasImages = mcpResult.content.some((c) => c.type === "image")
  const hasResources = mcpResult.content.some((c) => c.type === "resource")

  const metadata: McpResultMetadata = {
    contentTypes,
    hasImages,
    hasResources,
    isError: mcpResult.isError,
  }

  // 处理图片内容（添加到元数据）
  const images = mcpResult.content
    .filter((c): c is Extract<McpContent, { type: "image" }> => c.type === "image")
    .map((c) => ({
      mimeType: c.mimeType,
      data: c.data,
    }))

  if (images.length > 0) {
    ;(metadata as Record<string, unknown>).images = images
  }

  // 处理资源内容（添加到元数据）
  const resources = mcpResult.content
    .filter(
      (c): c is Extract<McpContent, { type: "resource" }> => c.type === "resource"
    )
    .map((c) => c.resource)

  if (resources.length > 0) {
    ;(metadata as Record<string, unknown>).resources = resources
  }

  return {
    title: toolName,
    output: output || "(no text output)",
    isError: mcpResult.isError,
    metadata,
  }
}

// ============================================================================
// Schema Conversion Helpers
// ============================================================================

/**
 * 从 MCP inputSchema 创建 Zod schema
 *
 * 注意：这是简化实现，仅支持基本的 object schema
 * 对于复杂的 JSON Schema，可能需要更完善的转换逻辑
 *
 * @param mcpSchema MCP 工具的 inputSchema
 * @returns Zod schema
 */
function createZodSchemaFromMcpSchema(
  mcpSchema: McpTool["inputSchema"]
): z.ZodType {
  // 如果没有 properties，返回空对象 schema
  if (!mcpSchema.properties) {
    return z.object({})
  }

  // 构建 Zod object schema
  const shape: Record<string, z.ZodType> = {}

  for (const [key, propSchema] of Object.entries(mcpSchema.properties)) {
    // 根据 JSON Schema 类型创建对应的 Zod schema
    let zodProp = createZodTypeFromJsonSchema(propSchema)

    // 检查是否为必需字段
    const isRequired = mcpSchema.required?.includes(key) ?? false

    // 如果不是必需字段，标记为 optional
    if (!isRequired) {
      zodProp = zodProp.optional()
    }

    shape[key] = zodProp
  }

  return z.object(shape)
}

/**
 * 从 JSON Schema 创建 Zod 类型
 *
 * @param jsonSchema JSON Schema
 * @returns Zod type
 */
function createZodTypeFromJsonSchema(
  jsonSchema: Record<string, unknown>
): z.ZodType {
  const type = jsonSchema.type as string | string[] | undefined

  // 处理数组类型（union）
  if (Array.isArray(type)) {
    // 简化处理：取第一个非 null 类型
    const nonNullType = type.find((t) => t !== "null")
    if (nonNullType) {
      return createZodTypeFromJsonSchema({ ...jsonSchema, type: nonNullType })
    }
    return z.any()
  }

  // 处理单一类型
  switch (type) {
    case "string":
      if (jsonSchema.enum) {
        // 枚举类型
        const enumValues = jsonSchema.enum as string[]
        return z.enum(enumValues as [string, ...string[]])
      }
      return z.string()

    case "number":
    case "integer":
      return z.number()

    case "boolean":
      return z.boolean()

    case "array":
      // 数组类型
      if (jsonSchema.items) {
        const itemSchema = createZodTypeFromJsonSchema(
          jsonSchema.items as Record<string, unknown>
        )
        return z.array(itemSchema)
      }
      return z.array(z.any())

    case "object":
      // 嵌套对象
      if (jsonSchema.properties) {
        const shape: Record<string, z.ZodType> = {}
        const properties = jsonSchema.properties as Record<
          string,
          Record<string, unknown>
        >
        const required = (jsonSchema.required as string[]) || []

        for (const [key, propSchema] of Object.entries(properties)) {
          let zodProp = createZodTypeFromJsonSchema(propSchema)
          if (!required.includes(key)) {
            zodProp = zodProp.optional()
          }
          shape[key] = zodProp
        }

        return z.object(shape)
      }
      return z.record(z.any())

    case "null":
      return z.null()

    default:
      // 未知类型，使用 any
      return z.any()
  }
}
