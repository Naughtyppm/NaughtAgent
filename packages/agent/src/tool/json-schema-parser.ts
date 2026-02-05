/**
 * 安全的 JSON Schema → Zod 转换器
 *
 * 使用纯函数实现，不使用 eval/new Function
 * 支持常见的 JSON Schema 类型和特性
 */

import { z } from "zod"
import type { Tool } from "./tool"

/**
 * 扩展的 JSON Schema 类型（包含更多字段）
 */
interface ExtendedJsonSchema extends Tool.JsonSchema {
  $defs?: Record<string, Tool.JsonSchema>
  definitions?: Record<string, Tool.JsonSchema>
  anyOf?: Tool.JsonSchema[]
  oneOf?: Tool.JsonSchema[]
  allOf?: Tool.JsonSchema[]
  not?: Tool.JsonSchema
  if?: Tool.JsonSchema
  then?: Tool.JsonSchema
  else?: Tool.JsonSchema
  const?: unknown
  pattern?: string
  format?: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
  minItems?: number
  maxItems?: number
  additionalProperties?: boolean | Tool.JsonSchema
  patternProperties?: Record<string, Tool.JsonSchema>
  dependencies?: Record<string, unknown>
}

/**
 * 将 JSON Schema 转换为 Zod Schema（安全实现）
 *
 * @param schema - JSON Schema 对象
 * @param definitions - 可选的 $defs 定义（用于 $ref 解析）
 * @returns Zod schema
 */
export function parseJsonSchema(
  schema: Tool.JsonSchema,
  definitions?: Record<string, Tool.JsonSchema>
): z.ZodType {
  // 处理空 schema
  if (!schema || typeof schema !== "object") {
    return z.unknown()
  }

  const extSchema = schema as ExtendedJsonSchema

  // 合并 definitions
  const defs: Record<string, Tool.JsonSchema> = {
    ...(extSchema.$defs || {}),
    ...(extSchema.definitions || {}),
    ...(definitions || {}),
  }

  return parseSchemaNode(extSchema, defs)
}

/**
 * 解析单个 schema 节点
 */
function parseSchemaNode(
  schema: ExtendedJsonSchema,
  definitions: Record<string, Tool.JsonSchema>
): z.ZodType {
  // 处理 $ref
  const ref = schema.$ref
  if (ref && typeof ref === "string") {
    return resolveRef(ref, definitions)
  }

  // 处理 anyOf/oneOf
  if (schema.anyOf || schema.oneOf) {
    const variants = (schema.anyOf || schema.oneOf)!
    if (variants.length === 0) {
      return z.never()
    }
    if (variants.length === 1) {
      return parseSchemaNode(variants[0] as ExtendedJsonSchema, definitions)
    }
    const schemas = variants.map((v) =>
      parseSchemaNode(v as ExtendedJsonSchema, definitions)
    )
    return z.union(schemas as [z.ZodType, z.ZodType, ...z.ZodType[]])
  }

  // 处理 allOf
  if (schema.allOf) {
    if (schema.allOf.length === 0) {
      return z.unknown()
    }
    if (schema.allOf.length === 1) {
      return parseSchemaNode(schema.allOf[0] as ExtendedJsonSchema, definitions)
    }
    // 合并所有 schema（简化实现：只支持 object 合并）
    const merged = mergeAllOf(schema.allOf, definitions)
    return parseSchemaNode(merged, definitions)
  }

  // 处理 const
  if (schema.const !== undefined) {
    return z.literal(schema.const as z.Primitive)
  }

  // 处理 enum
  if (schema.enum) {
    if (schema.enum.length === 0) {
      return z.never()
    }
    if (schema.enum.length === 1) {
      return z.literal(schema.enum[0] as z.Primitive)
    }
    return z.enum(schema.enum as [string, ...string[]])
  }

  // 根据 type 处理
  const type = schema.type

  // 处理多类型
  if (Array.isArray(type)) {
    if (type.length === 0) {
      return z.never()
    }
    if (type.length === 1) {
      return parseTypeNode(type[0], schema, definitions)
    }
    const schemas = type.map((t) => parseTypeNode(t, schema, definitions))
    return z.union(schemas as [z.ZodType, z.ZodType, ...z.ZodType[]])
  }

  // 处理单一类型
  if (type) {
    return parseTypeNode(type, schema, definitions)
  }

  // 无类型信息，返回 unknown
  return z.unknown()
}

/**
 * 解析特定类型的 schema
 */
function parseTypeNode(
  type: string,
  schema: ExtendedJsonSchema,
  definitions: Record<string, Tool.JsonSchema>
): z.ZodType {
  switch (type) {
    case "string":
      return parseStringSchema(schema)

    case "number":
    case "integer":
      return parseNumberSchema(schema, type === "integer")

    case "boolean":
      return z.boolean()

    case "null":
      return z.null()

    case "array":
      return parseArraySchema(schema, definitions)

    case "object":
      return parseObjectSchema(schema, definitions)

    default:
      return z.unknown()
  }
}

/**
 * 解析字符串 schema
 */
function parseStringSchema(schema: ExtendedJsonSchema): z.ZodType {
  let result: z.ZodString = z.string()

  // 长度约束
  if (typeof schema.minLength === "number") {
    result = result.min(schema.minLength)
  }
  if (typeof schema.maxLength === "number") {
    result = result.max(schema.maxLength)
  }

  // 格式约束
  if (schema.format) {
    switch (schema.format) {
      case "email":
        result = result.email()
        break
      case "uri":
      case "url":
        result = result.url()
        break
      case "uuid":
        result = result.uuid()
        break
      case "date-time":
        result = result.datetime()
        break
      case "date":
        result = result.date()
        break
      case "time":
        result = result.time()
        break
      case "ipv4":
        result = result.ip({ version: "v4" })
        break
      case "ipv6":
        result = result.ip({ version: "v6" })
        break
      // 其他格式忽略
    }
  }

  // 正则约束
  if (schema.pattern && typeof schema.pattern === "string") {
    try {
      result = result.regex(new RegExp(schema.pattern))
    } catch {
      // 无效正则，忽略
    }
  }

  return result
}

/**
 * 解析数字 schema
 */
function parseNumberSchema(
  schema: ExtendedJsonSchema,
  isInteger: boolean
): z.ZodType {
  let result: z.ZodNumber = z.number()

  if (isInteger) {
    result = result.int()
  }

  // 范围约束
  if (typeof schema.minimum === "number") {
    result = result.min(schema.minimum)
  }
  if (typeof schema.maximum === "number") {
    result = result.max(schema.maximum)
  }
  if (typeof schema.exclusiveMinimum === "number") {
    result = result.gt(schema.exclusiveMinimum)
  }
  if (typeof schema.exclusiveMaximum === "number") {
    result = result.lt(schema.exclusiveMaximum)
  }

  // 倍数约束
  if (typeof schema.multipleOf === "number") {
    result = result.multipleOf(schema.multipleOf)
  }

  return result
}

/**
 * 解析数组 schema
 */
function parseArraySchema(
  schema: ExtendedJsonSchema,
  definitions: Record<string, Tool.JsonSchema>
): z.ZodType {
  // 获取元素类型
  let itemSchema: z.ZodType = z.unknown()
  if (schema.items) {
    if (Array.isArray(schema.items)) {
      // tuple 形式
      if (schema.items.length === 0) {
        return z.array(z.unknown())
      }
      const tupleSchemas = schema.items.map((item) =>
        parseSchemaNode(item as ExtendedJsonSchema, definitions)
      )
      return z.tuple(tupleSchemas as [z.ZodType, ...z.ZodType[]])
    } else {
      itemSchema = parseSchemaNode(
        schema.items as ExtendedJsonSchema,
        definitions
      )
    }
  }

  let result = z.array(itemSchema)

  // 长度约束
  if (typeof schema.minItems === "number") {
    result = result.min(schema.minItems)
  }
  if (typeof schema.maxItems === "number") {
    result = result.max(schema.maxItems)
  }

  return result
}

/**
 * 解析对象 schema
 */
function parseObjectSchema(
  schema: ExtendedJsonSchema,
  definitions: Record<string, Tool.JsonSchema>
): z.ZodType {
  const properties = schema.properties || {}
  const required = new Set(schema.required || [])

  // 构建属性 schema
  const shape: Record<string, z.ZodType> = {}

  for (const [key, propSchema] of Object.entries(properties)) {
    const extPropSchema = propSchema as ExtendedJsonSchema
    let propZod = parseSchemaNode(extPropSchema, definitions)

    // 处理默认值
    if (extPropSchema.default !== undefined) {
      propZod = propZod.default(extPropSchema.default)
    }

    // 处理可选
    if (!required.has(key)) {
      propZod = propZod.optional()
    }

    shape[key] = propZod
  }

  let result = z.object(shape)

  // 处理 additionalProperties
  if (schema.additionalProperties === false) {
    return result.strict()
  } else if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  ) {
    // 有额外属性的类型定义
    const additionalSchema = parseSchemaNode(
      schema.additionalProperties as ExtendedJsonSchema,
      definitions
    )
    return result.catchall(additionalSchema)
  } else {
    // 默认允许额外属性
    return result.passthrough()
  }
}

/**
 * 解析 $ref 引用
 */
function resolveRef(
  ref: string,
  definitions: Record<string, Tool.JsonSchema>
): z.ZodType {
  // 只支持本地引用 #/$defs/xxx 或 #/definitions/xxx
  const match = ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/)
  if (!match) {
    // 不支持的引用格式，返回 unknown
    return z.unknown()
  }

  const defName = match[1]
  const defSchema = definitions[defName]

  if (!defSchema) {
    // 引用不存在，返回 unknown
    return z.unknown()
  }

  // 递归解析（注意：不处理循环引用）
  return parseSchemaNode(defSchema as ExtendedJsonSchema, definitions)
}

/**
 * 合并 allOf schemas（简化实现）
 */
function mergeAllOf(
  schemas: Tool.JsonSchema[],
  definitions: Record<string, Tool.JsonSchema>
): ExtendedJsonSchema {
  const merged: ExtendedJsonSchema = {
    type: "object",
    properties: {},
    required: [],
  }

  for (const schema of schemas) {
    let resolved = schema as ExtendedJsonSchema

    // 解析 $ref
    const ref = resolved.$ref
    if (ref && typeof ref === "string") {
      const match = ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/)
      if (match && definitions[match[1]]) {
        resolved = definitions[match[1]] as ExtendedJsonSchema
      }
    }

    // 合并 properties
    if (resolved.properties) {
      merged.properties = { ...merged.properties, ...resolved.properties }
    }

    // 合并 required
    if (resolved.required) {
      merged.required = [...(merged.required || []), ...resolved.required]
    }
  }

  // 去重 required
  merged.required = [...new Set(merged.required)]

  return merged
}

/**
 * 验证 JSON Schema 是否支持转换
 */
export function validateSchemaSupport(schema: Tool.JsonSchema): {
  supported: boolean
  warnings: string[]
} {
  const warnings: string[] = []
  const extSchema = schema as ExtendedJsonSchema

  // 检查可能有问题的特性
  if (extSchema.not) {
    warnings.push("'not' keyword is not fully supported")
  }

  if (extSchema.if || extSchema.then || extSchema.else) {
    warnings.push("Conditional schemas (if/then/else) are not supported")
  }

  if (extSchema.patternProperties) {
    warnings.push("'patternProperties' is not supported")
  }

  if (extSchema.dependencies) {
    warnings.push("'dependencies' is not supported")
  }

  // 检查外部 $ref
  const ref = extSchema.$ref
  if (ref && typeof ref === "string" && !ref.startsWith("#/")) {
    warnings.push("External $ref is not supported, only local references")
  }

  return {
    supported: warnings.length === 0,
    warnings,
  }
}
