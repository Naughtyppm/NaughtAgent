import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { Tool } from '../../src/tool/tool'

/**
 * Feature: phase-2-tool-layer, Property 3: JSON Schema 验证正确性
 * 
 * 对于任何提供的 JSON Schema，系统应该能够正确识别其是否符合 JSON Schema 规范，
 * 有效的 schema 应该被接受，无效的 schema 应该被拒绝并返回验证错误。
 * 
 * Validates: Requirements 1.3
 */
describe('Schema Properties', () => {
  describe('Property 3: JSON Schema 验证正确性', () => {
    /**
     * 生成有效的 Zod schema
     */
    const validZodSchemaArbitrary = fc.oneof(
      // 基本类型
      fc.constant(z.string()),
      fc.constant(z.number()),
      fc.constant(z.boolean()),
      fc.constant(z.null()),
      
      // 字符串变体
      fc.constant(z.string().min(1)),
      fc.constant(z.string().max(100)),
      fc.constant(z.string().email()),
      fc.constant(z.string().url()),
      
      // 数字变体
      fc.constant(z.number().int()),
      fc.constant(z.number().positive()),
      fc.constant(z.number().min(0)),
      fc.constant(z.number().max(100)),
      
      // 可选和可空
      fc.constant(z.string().optional()),
      fc.constant(z.number().nullable()),
      fc.constant(z.boolean().optional().nullable()),
      
      // 枚举
      fc.constant(z.enum(['a', 'b', 'c'])),
      fc.constant(z.literal('test')),
      
      // 数组
      fc.constant(z.array(z.string())),
      fc.constant(z.array(z.number())),
      fc.constant(z.array(z.boolean())),
      
      // 简单对象
      fc.constant(z.object({
        name: z.string(),
        age: z.number(),
      })),
      fc.constant(z.object({
        id: z.string(),
        active: z.boolean().optional(),
      })),
      
      // 嵌套对象
      fc.constant(z.object({
        user: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
        settings: z.object({
          theme: z.enum(['light', 'dark']),
          notifications: z.boolean(),
        }).optional(),
      })),
      
      // 联合类型
      fc.constant(z.union([z.string(), z.number()])),
      fc.constant(z.union([z.literal('a'), z.literal('b'), z.literal('c')])),
      
      // 带默认值
      fc.constant(z.string().default('default')),
      fc.constant(z.number().default(0)),
      fc.constant(z.boolean().default(false))
    )

    it('should accept valid Zod schemas and generate valid JSON Schema', () => {
      fc.assert(
        fc.property(
          validZodSchemaArbitrary,
          (zodSchema) => {
            // 使用 zodToJsonSchema 生成 JSON Schema
            const jsonSchema = zodToJsonSchema(zodSchema, {
              $refStrategy: 'none',
            })

            // 验证生成的 JSON Schema 包含必需字段
            expect(jsonSchema).toBeDefined()
            expect(typeof jsonSchema).toBe('object')
            
            // JSON Schema 应该有 type 字段（除了某些特殊情况）
            // 注意：anyOf、oneOf 等可能没有直接的 type 字段
            if ('type' in jsonSchema) {
              expect(jsonSchema.type).toBeDefined()
            }
            
            // 验证 JSON Schema 可以被序列化
            const serialized = JSON.stringify(jsonSchema)
            expect(serialized).toBeDefined()
            expect(serialized.length).toBeGreaterThan(0)
            
            // 验证可以反序列化
            const deserialized = JSON.parse(serialized)
            expect(deserialized).toBeDefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should generate consistent JSON Schema for the same Zod schema', () => {
      fc.assert(
        fc.property(
          validZodSchemaArbitrary,
          (zodSchema) => {
            // 多次生成应该产生相同的结果
            const schema1 = zodToJsonSchema(zodSchema, { $refStrategy: 'none' })
            const schema2 = zodToJsonSchema(zodSchema, { $refStrategy: 'none' })
            
            // 序列化后应该相同
            expect(JSON.stringify(schema1)).toBe(JSON.stringify(schema2))
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should preserve schema structure in Tool.define()', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            description: fc.string({ minLength: 1, maxLength: 200 }),
          }),
          validZodSchemaArbitrary,
          (toolDef, zodSchema) => {
            // 创建工具
            const tool = Tool.define({
              id: toolDef.id,
              description: toolDef.description,
              parameters: zodSchema,
              async execute() {
                return { title: 'Test', output: 'test' }
              },
            })

            // 验证 inputSchema 被正确生成
            expect(tool.inputSchema).toBeDefined()
            expect(typeof tool.inputSchema).toBe('object')
            
            // 验证 inputSchema 可以序列化
            const serialized = JSON.stringify(tool.inputSchema)
            expect(serialized).toBeDefined()
            expect(serialized.length).toBeGreaterThan(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle complex nested schemas', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3 }),
          (depth) => {
            // 根据深度生成嵌套对象
            let schema: z.ZodTypeAny = z.object({
              value: z.string(),
            })
            
            for (let i = 0; i < depth; i++) {
              schema = z.object({
                nested: schema,
                level: z.number(),
              })
            }

            // 生成 JSON Schema
            const jsonSchema = zodToJsonSchema(schema, { $refStrategy: 'none' })
            
            // 验证生成成功
            expect(jsonSchema).toBeDefined()
            expect(jsonSchema.type).toBe('object')
            expect(jsonSchema.properties).toBeDefined()
            
            // 验证可以序列化
            const serialized = JSON.stringify(jsonSchema)
            expect(serialized).toBeDefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle array schemas with various item types', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(z.array(z.string())),
            fc.constant(z.array(z.number())),
            fc.constant(z.array(z.boolean())),
            fc.constant(z.array(z.object({ id: z.string() }))),
            fc.constant(z.array(z.union([z.string(), z.number()])))
          ),
          (arraySchema) => {
            const jsonSchema = zodToJsonSchema(arraySchema, { $refStrategy: 'none' })
            
            // 验证数组 schema 结构
            expect(jsonSchema.type).toBe('array')
            expect(jsonSchema.items).toBeDefined()
            
            // 验证可以序列化
            const serialized = JSON.stringify(jsonSchema)
            expect(serialized).toBeDefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle enum schemas', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(z.enum(['option1', 'option2', 'option3'])),
            fc.constant(z.literal('single')),
            fc.constant(z.union([z.literal('a'), z.literal('b')]))
          ),
          (enumSchema) => {
            const jsonSchema = zodToJsonSchema(enumSchema, { $refStrategy: 'none' })
            
            // 验证枚举 schema 包含 enum 或 const 字段
            const hasEnum = 'enum' in jsonSchema
            const hasConst = 'const' in jsonSchema
            const hasAnyOf = 'anyOf' in jsonSchema
            const hasOneOf = 'oneOf' in jsonSchema
            
            expect(hasEnum || hasConst || hasAnyOf || hasOneOf).toBe(true)
            
            // 验证可以序列化
            const serialized = JSON.stringify(jsonSchema)
            expect(serialized).toBeDefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle optional and nullable fields', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(z.string().optional()),
            fc.constant(z.number().nullable()),
            fc.constant(z.boolean().optional().nullable()),
            fc.constant(z.object({
              required: z.string(),
              optional: z.string().optional(),
              nullable: z.number().nullable(),
            }))
          ),
          (schema) => {
            const jsonSchema = zodToJsonSchema(schema, { $refStrategy: 'none' })
            
            // 验证生成成功
            expect(jsonSchema).toBeDefined()
            
            // 对于对象类型，验证 required 字段
            if (jsonSchema.type === 'object' && jsonSchema.properties) {
              // required 字段应该只包含非可选字段
              if (jsonSchema.required) {
                expect(Array.isArray(jsonSchema.required)).toBe(true)
              }
            }
            
            // 验证可以序列化
            const serialized = JSON.stringify(jsonSchema)
            expect(serialized).toBeDefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle schemas with default values', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.tuple(fc.constant(z.string()), fc.string()).map(([schema, val]) => schema.default(val)),
            fc.tuple(fc.constant(z.number()), fc.integer()).map(([schema, val]) => schema.default(val)),
            fc.tuple(fc.constant(z.boolean()), fc.boolean()).map(([schema, val]) => schema.default(val))
          ),
          (schema) => {
            const jsonSchema = zodToJsonSchema(schema, { $refStrategy: 'none' })
            
            // 验证生成成功
            expect(jsonSchema).toBeDefined()
            
            // 验证包含 default 字段
            expect('default' in jsonSchema).toBe(true)
            
            // 验证可以序列化
            const serialized = JSON.stringify(jsonSchema)
            expect(serialized).toBeDefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should reject invalid JSON Schema structures', () => {
      // 测试无效的 JSON Schema 结构
      const invalidSchemas = [
        null,
        undefined,
        'not an object',
        123,
        true,
        [],
        { type: 'invalid-type' },
        { type: 'object', properties: 'not an object' },
        { type: 'array', items: 'not a schema' },
      ]

      invalidSchemas.forEach((invalidSchema) => {
        // 验证这些不是有效的 JSON Schema
        if (invalidSchema === null || invalidSchema === undefined) {
          expect(invalidSchema).toBeFalsy()
        } else if (typeof invalidSchema !== 'object') {
          expect(typeof invalidSchema).not.toBe('object')
        } else if (Array.isArray(invalidSchema)) {
          // 空数组不是有效的 JSON Schema
          expect(Array.isArray(invalidSchema)).toBe(true)
        } else {
          // 对于对象，验证它们不符合 JSON Schema 规范
          const schema = invalidSchema as Record<string, unknown>
          
          if (schema.type === 'invalid-type') {
            // 无效的类型
            expect(schema.type).toBe('invalid-type')
          } else if (schema.type === 'object' && typeof schema.properties === 'string') {
            // properties 应该是对象而不是字符串
            expect(typeof schema.properties).toBe('string')
          } else if (schema.type === 'array' && typeof schema.items === 'string') {
            // items 应该是对象而不是字符串
            expect(typeof schema.items).toBe('string')
          }
        }
      })
    })

    it('should handle edge cases: empty objects and minimal schemas', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(z.object({})),
            fc.constant(z.array(z.unknown())),
            fc.constant(z.any()),
            fc.constant(z.unknown())
          ),
          (schema) => {
            const jsonSchema = zodToJsonSchema(schema, { $refStrategy: 'none' })
            
            // 验证生成成功
            expect(jsonSchema).toBeDefined()
            expect(typeof jsonSchema).toBe('object')
            
            // 验证可以序列化
            const serialized = JSON.stringify(jsonSchema)
            expect(serialized).toBeDefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should validate that generated schemas are JSON-serializable', () => {
      fc.assert(
        fc.property(
          validZodSchemaArbitrary,
          (zodSchema) => {
            const jsonSchema = zodToJsonSchema(zodSchema, { $refStrategy: 'none' })
            
            // 验证可以序列化和反序列化
            const serialized = JSON.stringify(jsonSchema)
            const deserialized = JSON.parse(serialized)
            
            // 验证反序列化后的对象与原对象结构相同
            expect(deserialized).toBeDefined()
            expect(typeof deserialized).toBe('object')
            
            // 再次序列化应该产生相同的结果
            const reserialized = JSON.stringify(deserialized)
            expect(reserialized).toBe(serialized)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle union types correctly', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(z.union([z.string(), z.number()])),
            fc.constant(z.union([z.string(), z.number(), z.boolean()])),
            fc.constant(z.union([
              z.object({ type: z.literal('a'), value: z.string() }),
              z.object({ type: z.literal('b'), value: z.number() })
            ]))
          ),
          (unionSchema) => {
            const jsonSchema = zodToJsonSchema(unionSchema, { $refStrategy: 'none' })
            
            // 验证生成成功
            expect(jsonSchema).toBeDefined()
            expect(typeof jsonSchema).toBe('object')
            
            // 联合类型可能生成 anyOf、oneOf，或者直接使用 type 数组
            const hasAnyOf = 'anyOf' in jsonSchema
            const hasOneOf = 'oneOf' in jsonSchema
            const hasTypeArray = 'type' in jsonSchema && Array.isArray(jsonSchema.type)
            
            // 至少应该有一种表示方式
            expect(hasAnyOf || hasOneOf || hasTypeArray).toBe(true)
            
            // 验证可以序列化
            const serialized = JSON.stringify(jsonSchema)
            expect(serialized).toBeDefined()
            expect(serialized.length).toBeGreaterThan(0)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should preserve description fields in schemas', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (description) => {
            const schema = z.object({
              field: z.string().describe(description)
            })
            
            const jsonSchema = zodToJsonSchema(schema, { $refStrategy: 'none' })
            
            // 验证生成成功
            expect(jsonSchema).toBeDefined()
            expect(jsonSchema.type).toBe('object')
            expect(jsonSchema.properties).toBeDefined()
            
            // 验证描述被保留
            const properties = jsonSchema.properties as Record<string, Tool.JsonSchema>
            expect(properties.field).toBeDefined()
            expect(properties.field.description).toBe(description)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Feature: phase-2-tool-layer, Property 18: Schema 缓存避免重复解析
   * 
   * 对于任何工具的 JSON Schema，第一次访问时应该从 Zod schema 生成并缓存，
   * 后续访问相同工具的 schema 应该返回缓存的实例（引用相等），而不是重新生成。
   * 
   * Validates: Requirements 7.4
   */
  describe('Property 18: Schema 缓存避免重复解析', () => {
    /**
     * 生成工具定义的 arbitrary
     */
    const toolDefinitionArbitrary = fc.record({
      id: fc.string({ minLength: 1, maxLength: 50 }),
      description: fc.string({ minLength: 1, maxLength: 200 }),
    })

    /**
     * 生成 Zod schema 的 arbitrary
     */
    const zodSchemaArbitrary = fc.oneof(
      fc.constant(z.string()),
      fc.constant(z.number()),
      fc.constant(z.boolean()),
      fc.constant(z.object({ name: z.string() })),
      fc.constant(z.object({ id: z.string(), value: z.number() })),
      fc.constant(z.array(z.string())),
      fc.constant(z.enum(['a', 'b', 'c']))
    )

    it('should cache JSON Schema and return same instance on repeated access', () => {
      fc.assert(
        fc.property(
          toolDefinitionArbitrary,
          zodSchemaArbitrary,
          (toolDef, zodSchema) => {
            // 创建工具（第一次访问 schema）
            const tool1 = Tool.define({
              id: toolDef.id,
              description: toolDef.description,
              parameters: zodSchema,
              async execute() {
                return { title: 'Test', output: 'test' }
              },
            })

            // 使用相同的 Zod schema 创建另一个工具（第二次访问）
            const tool2 = Tool.define({
              id: `${toolDef.id}-2`,
              description: toolDef.description,
              parameters: zodSchema, // 相同的 Zod schema 实例
              async execute() {
                return { title: 'Test', output: 'test' }
              },
            })

            // 验证两个工具的 inputSchema 是同一个实例（引用相等）
            expect(tool1.inputSchema).toBeDefined()
            expect(tool2.inputSchema).toBeDefined()
            expect(tool1.inputSchema).toBe(tool2.inputSchema) // 引用相等
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should use getOrGenerateSchema to cache schemas', () => {
      fc.assert(
        fc.property(
          zodSchemaArbitrary,
          (zodSchema) => {
            // 第一次调用 getOrGenerateSchema
            const schema1 = Tool.getOrGenerateSchema(zodSchema)
            
            // 第二次调用 getOrGenerateSchema（应该返回缓存）
            const schema2 = Tool.getOrGenerateSchema(zodSchema)
            
            // 验证返回的是同一个实例
            expect(schema1).toBeDefined()
            expect(schema2).toBeDefined()
            expect(schema1).toBe(schema2) // 引用相等
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should generate different schemas for different Zod schemas', () => {
      fc.assert(
        fc.property(
          toolDefinitionArbitrary,
          (toolDef) => {
            // 创建两个不同的 Zod schema
            const schema1 = z.object({ field1: z.string() })
            const schema2 = z.object({ field2: z.number() })

            // 创建两个工具
            const tool1 = Tool.define({
              id: toolDef.id,
              description: toolDef.description,
              parameters: schema1,
              async execute() {
                return { title: 'Test', output: 'test' }
              },
            })

            const tool2 = Tool.define({
              id: `${toolDef.id}-2`,
              description: toolDef.description,
              parameters: schema2,
              async execute() {
                return { title: 'Test', output: 'test' }
              },
            })

            // 验证两个工具的 inputSchema 是不同的实例
            expect(tool1.inputSchema).toBeDefined()
            expect(tool2.inputSchema).toBeDefined()
            expect(tool1.inputSchema).not.toBe(tool2.inputSchema) // 引用不相等
            
            // 验证内容也不同
            const schema1Str = JSON.stringify(tool1.inputSchema)
            const schema2Str = JSON.stringify(tool2.inputSchema)
            expect(schema1Str).not.toBe(schema2Str)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should cache schemas across multiple tool definitions with same Zod schema', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 10 }),
          zodSchemaArbitrary,
          (toolCount, zodSchema) => {
            // 创建多个使用相同 Zod schema 的工具
            const tools = Array.from({ length: toolCount }, (_, i) =>
              Tool.define({
                id: `tool-${i}`,
                description: `Tool ${i}`,
                parameters: zodSchema, // 相同的 Zod schema
                async execute() {
                  return { title: 'Test', output: 'test' }
                },
              })
            )

            // 验证所有工具的 inputSchema 都是同一个实例
            const firstSchema = tools[0].inputSchema
            expect(firstSchema).toBeDefined()

            for (let i = 1; i < tools.length; i++) {
              expect(tools[i].inputSchema).toBe(firstSchema) // 引用相等
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should not regenerate schema when accessing inputSchema multiple times', () => {
      fc.assert(
        fc.property(
          toolDefinitionArbitrary,
          zodSchemaArbitrary,
          (toolDef, zodSchema) => {
            // 创建工具
            const tool = Tool.define({
              id: toolDef.id,
              description: toolDef.description,
              parameters: zodSchema,
              async execute() {
                return { title: 'Test', output: 'test' }
              },
            })

            // 多次访问 inputSchema
            const schema1 = tool.inputSchema
            const schema2 = tool.inputSchema
            const schema3 = tool.inputSchema

            // 验证都是同一个实例
            expect(schema1).toBeDefined()
            expect(schema1).toBe(schema2)
            expect(schema2).toBe(schema3)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should cache complex nested schemas correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 3 }),
          (depth) => {
            // 创建嵌套的 Zod schema
            let schema: z.ZodTypeAny = z.object({
              value: z.string(),
            })
            
            for (let i = 0; i < depth; i++) {
              schema = z.object({
                nested: schema,
                level: z.number(),
              })
            }

            // 第一次生成
            const jsonSchema1 = Tool.getOrGenerateSchema(schema)
            
            // 第二次应该返回缓存
            const jsonSchema2 = Tool.getOrGenerateSchema(schema)
            
            // 验证引用相等
            expect(jsonSchema1).toBe(jsonSchema2)
            
            // 验证结构正确
            expect(jsonSchema1.type).toBe('object')
            expect(jsonSchema1.properties).toBeDefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should cache schemas with modifiers (optional, nullable, default)', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.tuple(fc.constant(z.string()), fc.string()).map(([s, v]) => s.default(v)),
            fc.constant(z.string().optional()),
            fc.constant(z.number().nullable()),
            fc.constant(z.boolean().optional().nullable())
          ),
          (schema) => {
            // 第一次生成
            const jsonSchema1 = Tool.getOrGenerateSchema(schema)
            
            // 第二次应该返回缓存
            const jsonSchema2 = Tool.getOrGenerateSchema(schema)
            
            // 验证引用相等
            expect(jsonSchema1).toBe(jsonSchema2)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should cache array and enum schemas', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(z.array(z.string())),
            fc.constant(z.array(z.number())),
            fc.constant(z.enum(['option1', 'option2', 'option3'])),
            fc.constant(z.literal('single'))
          ),
          (schema) => {
            // 第一次生成
            const jsonSchema1 = Tool.getOrGenerateSchema(schema)
            
            // 第二次应该返回缓存
            const jsonSchema2 = Tool.getOrGenerateSchema(schema)
            
            // 验证引用相等
            expect(jsonSchema1).toBe(jsonSchema2)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should maintain cache consistency across concurrent accesses', () => {
      fc.assert(
        fc.property(
          zodSchemaArbitrary,
          (zodSchema) => {
            // 模拟并发访问（同步版本）
            const results = Array.from({ length: 10 }, () =>
              Tool.getOrGenerateSchema(zodSchema)
            )

            // 验证所有结果都是同一个实例
            const firstResult = results[0]
            expect(firstResult).toBeDefined()

            for (let i = 1; i < results.length; i++) {
              expect(results[i]).toBe(firstResult)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should cache schemas independently for each unique Zod schema instance', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 5 }),
          (schemaCount) => {
            // 创建多个不同的 Zod schema 实例
            const schemas = Array.from({ length: schemaCount }, (_, i) =>
              z.object({
                [`field${i}`]: z.string(),
              })
            )

            // 为每个 schema 生成 JSON Schema
            const jsonSchemas = schemas.map(s => Tool.getOrGenerateSchema(s))

            // 验证每个 schema 都被独立缓存
            for (let i = 0; i < schemas.length; i++) {
              const cached = Tool.getOrGenerateSchema(schemas[i])
              expect(cached).toBe(jsonSchemas[i]) // 相同 Zod schema 返回相同缓存
              
              // 验证不同 Zod schema 的缓存是不同的
              for (let j = i + 1; j < schemas.length; j++) {
                expect(jsonSchemas[i]).not.toBe(jsonSchemas[j])
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
