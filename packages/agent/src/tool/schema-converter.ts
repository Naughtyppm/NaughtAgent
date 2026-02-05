import { z } from "zod"
import { AgentError, ErrorCode } from "../error"
import type { Tool } from "./tool"
import { parseJsonSchema, validateSchemaSupport } from "./json-schema-parser"

/**
 * JSON Schema 转 Zod Schema
 *
 * 将 MCP 工具的 inputSchema（JSON Schema）转换为 Zod schema
 * 用于运行时参数验证
 *
 * 安全实现：使用纯函数解析，不使用 eval/new Function
 *
 * @param jsonSchema - JSON Schema 对象
 * @returns Zod schema
 * @throws AgentError 如果转换失败或 schema 不支持
 */
export function jsonSchemaToZod(jsonSchema: Tool.JsonSchema): z.ZodType {
  try {
    // 验证 JSON Schema 基本结构
    if (!jsonSchema || typeof jsonSchema !== "object") {
      throw new AgentError(
        "Invalid JSON Schema: must be an object",
        ErrorCode.INVALID_REQUEST,
        false,
        { jsonSchema }
      )
    }

    // 使用安全的纯函数解析器
    const zodSchema = parseJsonSchema(jsonSchema)

    // 验证返回的是有效的 Zod schema
    if (!zodSchema || typeof zodSchema.parse !== "function") {
      throw new AgentError(
        "Failed to generate valid Zod schema",
        ErrorCode.TOOL_EXECUTION_ERROR,
        true,
        { jsonSchema }
      )
    }

    return zodSchema
  } catch (error) {
    // 如果已经是 AgentError，直接抛出
    if (error instanceof AgentError) {
      throw error
    }

    // 转换其他错误
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new AgentError(
      `Failed to convert JSON Schema to Zod: ${errorMessage}`,
      ErrorCode.TOOL_EXECUTION_ERROR,
      true,
      { jsonSchema, originalError: error }
    )
  }
}

/**
 * 验证 JSON Schema 是否支持转换
 *
 * 检查 JSON Schema 是否包含不支持的特性
 * 新实现支持更多特性，但仍有一些限制
 *
 * @param jsonSchema - JSON Schema 对象
 * @returns 验证结果，包含是否支持和警告列表
 */
export function validateJsonSchemaSupport(jsonSchema: Tool.JsonSchema): {
  supported: boolean
  unsupportedFeatures: string[]
} {
  const validation = validateSchemaSupport(jsonSchema)

  return {
    supported: validation.supported,
    unsupportedFeatures: validation.warnings,
  }
}

/**
 * 安全地转换 JSON Schema 到 Zod Schema
 *
 * 在转换前验证 schema 是否支持，提供更清晰的错误信息
 * 注意：新实现支持 $ref、anyOf/oneOf/allOf，所以大多数 schema 都能转换
 *
 * @param jsonSchema - JSON Schema 对象
 * @returns Zod schema
 * @throws AgentError 如果 schema 包含完全不支持的特性
 */
export function safeJsonSchemaToZod(jsonSchema: Tool.JsonSchema): z.ZodType {
  // 验证 schema 支持情况
  const validation = validateJsonSchemaSupport(jsonSchema)

  // 新实现更宽容，只在有严重问题时抛出错误
  // 警告不阻止转换，只是提示可能有精度损失
  if (!validation.supported && validation.unsupportedFeatures.length > 0) {
    // 检查是否有致命问题（如外部 $ref）
    const hasFatalIssue = validation.unsupportedFeatures.some(
      (f) => f.includes("External $ref")
    )

    if (hasFatalIssue) {
      throw new AgentError(
        `JSON Schema contains unsupported features: ${validation.unsupportedFeatures.join(", ")}`,
        ErrorCode.INVALID_REQUEST,
        false,
        {
          jsonSchema,
          unsupportedFeatures: validation.unsupportedFeatures,
        }
      )
    }
    // 非致命问题只记录警告，继续转换
  }

  // 执行转换
  return jsonSchemaToZod(jsonSchema)
}
