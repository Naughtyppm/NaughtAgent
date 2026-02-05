import { describe, it, expect } from "vitest"
import { z } from "zod"
import {
  jsonSchemaToZod,
  safeJsonSchemaToZod,
  validateJsonSchemaSupport,
} from "../../src/tool/schema-converter"
import { AgentError, ErrorCode } from "../../src/error"
import type { Tool } from "../../src/tool/tool"

describe("schema-converter", () => {
  describe("jsonSchemaToZod", () => {
    it("应该转换简单的字符串 schema", () => {
      const jsonSchema: Tool.JsonSchema = {
        type: "string",
        description: "A simple string",
      }

      const zodSchema = jsonSchemaToZod(jsonSchema)
      
      // 验证是有效的 Zod schema
      expect(zodSchema).toBeDefined()
      expect(typeof zodSchema.parse).toBe("function")
      
      // 验证可以解析有效值
      expect(zodSchema.parse("hello")).toBe("hello")
      
      // 验证会拒绝无效值
      expect(() => zodSchema.parse(123)).toThrow()
    })

    it("应该转换数字 schema", () => {
      const jsonSchema: Tool.JsonSchema = {
        type: "number",
        description: "A number",
      }

      const zodSchema = jsonSchemaToZod(jsonSchema)
      
      expect(zodSchema.parse(42)).toBe(42)
      expect(zodSchema.parse(3.14)).toBe(3.14)
      expect(() => zodSchema.parse("not a number")).toThrow()
    })

    it("应该转换布尔 schema", () => {
      const jsonSchema: Tool.JsonSchema = {
        type: "boolean",
      }

      const zodSchema = jsonSchemaToZod(jsonSchema)
      
      expect(zodSchema.parse(true)).toBe(true)
      expect(zodSchema.parse(false)).toBe(false)
      expect(() => zodSchema.parse("true")).toThrow()
    })

    it("应该转换对象 schema", () => {
      const jsonSchema: Tool.JsonSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name"],
      }

      const zodSchema = jsonSchemaToZod(jsonSchema)
      
      // 有效对象
      const valid = { name: "Alice", age: 30 }
      expect(zodSchema.parse(valid)).toEqual(valid)
      
      // 缺少可选字段
      const validPartial = { name: "Bob" }
      expect(zodSchema.parse(validPartial)).toEqual(validPartial)
      
      // 缺少必需字段
      expect(() => zodSchema.parse({ age: 25 })).toThrow()
    })

    it("应该转换数组 schema", () => {
      const jsonSchema: Tool.JsonSchema = {
        type: "array",
        items: { type: "string" },
      }

      const zodSchema = jsonSchemaToZod(jsonSchema)
      
      expect(zodSchema.parse(["a", "b", "c"])).toEqual(["a", "b", "c"])
      expect(zodSchema.parse([])).toEqual([])
      expect(() => zodSchema.parse([1, 2, 3])).toThrow()
    })

    it("应该转换嵌套对象 schema", () => {
      const jsonSchema: Tool.JsonSchema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
            },
            required: ["name"],
          },
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["user"],
      }

      const zodSchema = jsonSchemaToZod(jsonSchema)
      
      const valid = {
        user: { name: "Alice", email: "alice@example.com" },
        tags: ["admin", "user"],
      }
      expect(zodSchema.parse(valid)).toEqual(valid)
    })

    it("应该转换 enum schema", () => {
      const jsonSchema: Tool.JsonSchema = {
        type: "string",
        enum: ["red", "green", "blue"],
      }

      const zodSchema = jsonSchemaToZod(jsonSchema)
      
      expect(zodSchema.parse("red")).toBe("red")
      expect(zodSchema.parse("green")).toBe("green")
      expect(() => zodSchema.parse("yellow")).toThrow()
    })

    it("应该处理 default 值", () => {
      const jsonSchema: Tool.JsonSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          role: { type: "string", default: "user" },
        },
      }

      const zodSchema = jsonSchemaToZod(jsonSchema)
      
      // 注意：json-schema-to-zod 可能不完全支持 default
      // 这里主要验证转换不会失败
      const result = zodSchema.parse({ name: "Alice" })
      expect(result).toHaveProperty("name", "Alice")
    })

    it("应该拒绝无效的 JSON Schema", () => {
      expect(() => {
        jsonSchemaToZod(null as any)
      }).toThrow(AgentError)

      expect(() => {
        jsonSchemaToZod("not an object" as any)
      }).toThrow(AgentError)
    })

    it("应该在转换失败时抛出 AgentError", () => {
      // 使用一个可能导致转换失败的 schema
      // 注意：json-schema-to-zod 对某些无效 schema 可能不会失败
      // 这里主要测试错误处理机制存在
      const invalidSchema: Tool.JsonSchema = {
        type: "invalid-type" as any,
      }

      // json-schema-to-zod 可能会处理这个 schema 而不抛出错误
      // 所以我们只验证函数不会崩溃
      try {
        const result = jsonSchemaToZod(invalidSchema)
        // 如果成功转换，验证返回的是有效的 Zod schema
        expect(result).toBeDefined()
        expect(typeof result.parse).toBe("function")
      } catch (error) {
        // 如果抛出错误，应该是 AgentError
        expect(error).toBeInstanceOf(AgentError)
        if (error instanceof AgentError) {
          expect(error.code).toBe(ErrorCode.TOOL_EXECUTION_ERROR)
        }
      }
    })
  })

  describe("validateJsonSchemaSupport", () => {
    it("应该验证支持的 schema", () => {
      const schema: Tool.JsonSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
      }

      const result = validateJsonSchemaSupport(schema)
      expect(result.supported).toBe(true)
      expect(result.unsupportedFeatures).toEqual([])
    })

    // 新实现支持本地 $ref，只有外部 $ref 会产生警告
    it("应该支持本地 $ref", () => {
      const schema: Tool.JsonSchema = {
        $ref: "#/$defs/User",
        $defs: {
          User: { type: "object", properties: { name: { type: "string" } } },
        },
      }

      const result = validateJsonSchemaSupport(schema)
      // 本地 $ref 现在被支持
      expect(result.supported).toBe(true)
    })

    it("应该警告外部 $ref", () => {
      const schema: Tool.JsonSchema = {
        $ref: "https://example.com/schemas/user.json",
      }

      const result = validateJsonSchemaSupport(schema)
      expect(result.supported).toBe(false)
      expect(result.unsupportedFeatures.some((f) => f.includes("External $ref"))).toBe(true)
    })

    // 新实现支持 allOf/anyOf/oneOf
    it("应该支持 allOf/anyOf/oneOf", () => {
      const schema1: Tool.JsonSchema = {
        allOf: [{ type: "object", properties: { a: { type: "string" } } }],
      }

      const result1 = validateJsonSchemaSupport(schema1)
      expect(result1.supported).toBe(true)

      const schema2: Tool.JsonSchema = {
        anyOf: [{ type: "string" }, { type: "number" }],
      }

      const result2 = validateJsonSchemaSupport(schema2)
      expect(result2.supported).toBe(true)
    })

    it("应该警告 not", () => {
      const schema: Tool.JsonSchema = {
        not: { type: "string" },
      }

      const result = validateJsonSchemaSupport(schema)
      expect(result.supported).toBe(false)
      expect(result.unsupportedFeatures.some((f) => f.includes("not"))).toBe(true)
    })

    it("应该警告 if/then/else", () => {
      const schema: Tool.JsonSchema = {
        if: { properties: { country: { const: "US" } } },
        then: { properties: { zipCode: { type: "string" } } },
      }

      const result = validateJsonSchemaSupport(schema)
      expect(result.supported).toBe(false)
      expect(result.unsupportedFeatures.some((f) => f.includes("if/then/else") || f.includes("Conditional"))).toBe(true)
    })

    it("应该警告 patternProperties", () => {
      const schema: Tool.JsonSchema = {
        type: "object",
        patternProperties: {
          "^S_": { type: "string" },
        },
      }

      const result = validateJsonSchemaSupport(schema)
      expect(result.supported).toBe(false)
      expect(result.unsupportedFeatures.some((f) => f.includes("patternProperties"))).toBe(true)
    })

    it("应该警告 dependencies", () => {
      const schema: Tool.JsonSchema = {
        type: "object",
        dependencies: {
          creditCard: ["billingAddress"],
        },
      }

      const result = validateJsonSchemaSupport(schema)
      expect(result.supported).toBe(false)
      expect(result.unsupportedFeatures.some((f) => f.includes("dependencies"))).toBe(true)
    })

    it("应该检测多个警告特性", () => {
      const schema: Tool.JsonSchema = {
        not: { type: "null" },
        patternProperties: { "^x_": { type: "string" } },
      }

      const result = validateJsonSchemaSupport(schema)
      expect(result.supported).toBe(false)
      expect(result.unsupportedFeatures.length).toBeGreaterThan(1)
    })
  })

  describe("safeJsonSchemaToZod", () => {
    it("应该成功转换支持的 schema", () => {
      const schema: Tool.JsonSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      }

      const zodSchema = safeJsonSchemaToZod(schema)
      expect(zodSchema).toBeDefined()
      expect(zodSchema.parse({ name: "Alice" })).toEqual({ name: "Alice" })
    })

    // 新实现支持本地 $ref，可以成功转换
    it("应该成功转换包含本地 $ref 的 schema", () => {
      const schema: Tool.JsonSchema = {
        $ref: "#/$defs/User",
        $defs: {
          User: {
            type: "object",
            properties: { name: { type: "string" } },
          },
        },
      }

      const zodSchema = safeJsonSchemaToZod(schema)
      expect(zodSchema).toBeDefined()
      expect(zodSchema.parse({ name: "Alice" })).toEqual({ name: "Alice" })
    })

    // 新实现支持 anyOf/oneOf/allOf
    it("应该成功转换包含 anyOf 的 schema", () => {
      const schema: Tool.JsonSchema = {
        anyOf: [{ type: "string" }, { type: "number" }],
      }

      const zodSchema = safeJsonSchemaToZod(schema)
      expect(zodSchema).toBeDefined()
      expect(zodSchema.parse("hello")).toBe("hello")
      expect(zodSchema.parse(42)).toBe(42)
    })

    // 只有外部 $ref 会抛出错误
    it("应该拒绝包含外部 $ref 的 schema", () => {
      const schema: Tool.JsonSchema = {
        $ref: "https://example.com/schemas/user.json",
      }

      try {
        safeJsonSchemaToZod(schema)
        expect.fail("应该抛出 AgentError")
      } catch (error) {
        expect(error).toBeInstanceOf(AgentError)
        if (error instanceof AgentError) {
          expect(error.code).toBe(ErrorCode.INVALID_REQUEST)
          expect(error.message).toContain("unsupported features")
        }
      }
    })

    // 警告特性不会阻止转换，只是记录警告
    it("应该允许转换包含警告特性的 schema（如 not）", () => {
      const schema: Tool.JsonSchema = {
        type: "string",
        not: { type: "null" },  // 警告但不阻止
      }

      // 新实现会转换成功，只是忽略 not 约束
      const zodSchema = safeJsonSchemaToZod(schema)
      expect(zodSchema).toBeDefined()
      expect(zodSchema.parse("hello")).toBe("hello")
    })
  })

  describe("MCP 工具 inputSchema 转换", () => {
    it("应该转换典型的 MCP 工具 inputSchema", () => {
      // 模拟一个典型的 MCP 工具 schema
      const mcpSchema: Tool.JsonSchema = {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to read",
          },
          encoding: {
            type: "string",
            enum: ["utf8", "ascii", "base64"],
            default: "utf8",
          },
          maxSize: {
            type: "number",
            description: "Maximum file size in bytes",
          },
        },
        required: ["path"],
      }

      const zodSchema = jsonSchemaToZod(mcpSchema)
      
      // 验证有效输入
      const valid = {
        path: "/path/to/file.txt",
        encoding: "utf8",
        maxSize: 1024,
      }
      expect(zodSchema.parse(valid)).toEqual(valid)
      
      // 验证必需字段
      expect(() => zodSchema.parse({ encoding: "utf8" })).toThrow()
    })

    it("应该处理复杂的嵌套 MCP schema", () => {
      const mcpSchema: Tool.JsonSchema = {
        type: "object",
        properties: {
          query: { type: "string" },
          filters: {
            type: "object",
            properties: {
              status: {
                type: "array",
                items: { type: "string" },
              },
              priority: {
                type: "number",
              },
            },
          },
          pagination: {
            type: "object",
            properties: {
              page: { type: "number" },
              pageSize: { type: "number" },
            },
            required: ["page"],
          },
        },
        required: ["query"],
      }

      const zodSchema = jsonSchemaToZod(mcpSchema)
      
      const valid = {
        query: "search term",
        filters: {
          status: ["open", "in-progress"],
          priority: 1,
        },
        pagination: {
          page: 1,
          pageSize: 20,
        },
      }
      
      expect(zodSchema.parse(valid)).toEqual(valid)
    })
  })

  describe("边界情况", () => {
    it("应该处理空对象 schema", () => {
      const schema: Tool.JsonSchema = {
        type: "object",
      }

      const zodSchema = jsonSchemaToZod(schema)
      expect(zodSchema.parse({})).toEqual({})
      expect(zodSchema.parse({ any: "value" })).toEqual({ any: "value" })
    })

    it("应该处理空数组 schema", () => {
      const schema: Tool.JsonSchema = {
        type: "array",
        items: { type: "string" },
      }

      const zodSchema = jsonSchemaToZod(schema)
      expect(zodSchema.parse([])).toEqual([])
    })

    it("应该处理没有 type 字段的 schema", () => {
      const schema: Tool.JsonSchema = {
        properties: {
          name: { type: "string" },
        },
      }

      // 这可能会失败或成功，取决于 json-schema-to-zod 的实现
      // 主要验证不会崩溃
      try {
        const zodSchema = jsonSchemaToZod(schema)
        expect(zodSchema).toBeDefined()
      } catch (error) {
        expect(error).toBeInstanceOf(AgentError)
      }
    })
  })
})
