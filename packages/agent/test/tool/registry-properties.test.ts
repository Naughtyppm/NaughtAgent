import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { z } from 'zod'
import { Tool } from '../../src/tool/tool'
import { ToolRegistry } from '../../src/tool/registry'

/**
 * Feature: phase-2-tool-layer, Property 1: 工具注册的唯一性约束
 * 
 * 对于任何工具定义，当注册到 Tool Registry 时，如果已存在相同 ID 的工具，
 * 则应该拒绝注册或覆盖旧工具，并且注册后通过 ID 查询应该返回最新注册的工具。
 * 
 * Validates: Requirements 1.4, 1.5
 */
describe('Tool Registry Properties', () => {
  describe('Property 1: 工具注册的唯一性约束', () => {
    // 每个测试前清空注册表
    beforeEach(() => {
      ToolRegistry.clear()
    })

    // 每个测试后清空注册表
    afterEach(() => {
      ToolRegistry.clear()
    })
    it('should register a tool and retrieve it by ID', () => {
      fc.assert(
        fc.property(
          // 生成随机的工具定义
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            description: fc.string({ minLength: 1, maxLength: 200 }),
          }),
          (toolDef) => {
            // 创建工具
            const tool = Tool.define({
              id: toolDef.id,
              description: toolDef.description,
              parameters: z.object({}),
              async execute() {
                return { title: 'Test', output: 'test' }
              },
            })

            // 注册工具
            ToolRegistry.register(tool)

            // 验证工具已注册
            expect(ToolRegistry.has(toolDef.id)).toBe(true)

            // 验证可以通过 ID 查询到工具
            const retrieved = ToolRegistry.get(toolDef.id)
            expect(retrieved).toBeDefined()
            expect(retrieved?.id).toBe(toolDef.id)
            expect(retrieved?.description).toBe(toolDef.description)
          }
        ),
        { numRuns: 100 } // 运行 100 次迭代
      )
    })

    it('should overwrite existing tool when registering with same ID', () => {
      fc.assert(
        fc.property(
          // 生成相同 ID 但不同描述的两个工具
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            description1: fc.string({ minLength: 1, maxLength: 200 }),
            description2: fc.string({ minLength: 1, maxLength: 200 }),
          }),
          (toolDef) => {
            // 每次迭代前清空注册表
            ToolRegistry.clear()

            // 创建第一个工具
            const tool1 = Tool.define({
              id: toolDef.id,
              description: toolDef.description1,
              parameters: z.object({}),
              async execute() {
                return { title: 'Test1', output: 'test1' }
              },
            })

            // 创建第二个工具（相同 ID）
            const tool2 = Tool.define({
              id: toolDef.id,
              description: toolDef.description2,
              parameters: z.object({}),
              async execute() {
                return { title: 'Test2', output: 'test2' }
              },
            })

            // 注册第一个工具
            ToolRegistry.register(tool1)

            // 验证第一个工具已注册
            const retrieved1 = ToolRegistry.get(toolDef.id)
            expect(retrieved1?.description).toBe(toolDef.description1)

            // 注册第二个工具（相同 ID）
            ToolRegistry.register(tool2)

            // 验证第二个工具覆盖了第一个工具
            const retrieved2 = ToolRegistry.get(toolDef.id)
            expect(retrieved2?.description).toBe(toolDef.description2)

            // 验证只有一个工具被注册（没有重复）
            expect(ToolRegistry.count()).toBe(1)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should maintain uniqueness when registering multiple tools', () => {
      fc.assert(
        fc.property(
          // 生成多个工具定义
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 50 }),
              description: fc.string({ minLength: 1, maxLength: 200 }),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          (toolDefs) => {
            // 每次迭代前清空注册表
            ToolRegistry.clear()

            // 创建并注册所有工具
            const tools = toolDefs.map((def) =>
              Tool.define({
                id: def.id,
                description: def.description,
                parameters: z.object({}),
                async execute() {
                  return { title: 'Test', output: 'test' }
                },
              })
            )

            // 批量注册
            ToolRegistry.register(tools)

            // 计算唯一 ID 数量
            const uniqueIds = new Set(toolDefs.map((def) => def.id))

            // 验证注册表中的工具数量等于唯一 ID 数量
            expect(ToolRegistry.count()).toBe(uniqueIds.size)

            // 验证所有唯一 ID 都能查询到
            for (const id of uniqueIds) {
              expect(ToolRegistry.has(id)).toBe(true)
              expect(ToolRegistry.get(id)).toBeDefined()
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should return the latest tool when multiple registrations occur', () => {
      fc.assert(
        fc.property(
          // 生成相同 ID 的多个工具定义
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            descriptions: fc.array(fc.string({ minLength: 1, maxLength: 200 }), {
              minLength: 2,
              maxLength: 10,
            }),
          }),
          (toolDef) => {
            // 每次迭代前清空注册表
            ToolRegistry.clear()

            // 创建并注册多个工具（相同 ID）
            for (const description of toolDef.descriptions) {
              const tool = Tool.define({
                id: toolDef.id,
                description,
                parameters: z.object({}),
                async execute() {
                  return { title: 'Test', output: 'test' }
                },
              })
              ToolRegistry.register(tool)
            }

            // 验证只有一个工具被注册
            expect(ToolRegistry.count()).toBe(1)

            // 验证查询到的是最后注册的工具
            const retrieved = ToolRegistry.get(toolDef.id)
            const lastDescription = toolDef.descriptions[toolDef.descriptions.length - 1]
            expect(retrieved?.description).toBe(lastDescription)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle edge case: empty registry', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), (toolId) => {
          // 验证空注册表
          expect(ToolRegistry.count()).toBe(0)
          expect(ToolRegistry.has(toolId)).toBe(false)
          expect(ToolRegistry.get(toolId)).toBeUndefined()
        }),
        { numRuns: 100 }
      )
    })

    it('should handle edge case: special characters in tool ID', () => {
      fc.assert(
        fc.property(
          // 生成包含特殊字符的工具 ID
          fc.oneof(
            fc.constant('tool:with:colons'),
            fc.constant('tool/with/slashes'),
            fc.constant('tool.with.dots'),
            fc.constant('tool-with-dashes'),
            fc.constant('tool_with_underscores'),
            fc.constant('tool@with@at'),
            fc.constant('tool#with#hash')
          ),
          (toolId) => {
            const tool = Tool.define({
              id: toolId,
              description: 'Tool with special characters',
              parameters: z.object({}),
              async execute() {
                return { title: 'Test', output: 'test' }
              },
            })

            // 注册工具
            ToolRegistry.register(tool)

            // 验证工具已注册
            expect(ToolRegistry.has(toolId)).toBe(true)

            // 验证可以通过 ID 查询到工具
            const retrieved = ToolRegistry.get(toolId)
            expect(retrieved?.id).toBe(toolId)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle concurrent registrations correctly', () => {
      fc.assert(
        fc.property(
          // 生成多个不同的工具 ID
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
            minLength: 5,
            maxLength: 20,
          }),
          (toolIds) => {
            // 每次迭代前清空注册表
            ToolRegistry.clear()

            // 创建工具
            const tools = toolIds.map((id) =>
              Tool.define({
                id,
                description: `Tool ${id}`,
                parameters: z.object({}),
                async execute() {
                  return { title: 'Test', output: 'test' }
                },
              })
            )

            // 批量注册（模拟并发）
            ToolRegistry.register(tools)

            // 计算唯一 ID 数量
            const uniqueIds = new Set(toolIds)

            // 验证所有唯一工具都被注册
            expect(ToolRegistry.count()).toBe(uniqueIds.size)

            // 验证每个唯一 ID 都能查询到
            for (const id of uniqueIds) {
              expect(ToolRegistry.has(id)).toBe(true)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should maintain consistency after unregister and re-register', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            description1: fc.string({ minLength: 1, maxLength: 200 }),
            description2: fc.string({ minLength: 1, maxLength: 200 }),
          }),
          (toolDef) => {
            // 创建并注册第一个工具
            const tool1 = Tool.define({
              id: toolDef.id,
              description: toolDef.description1,
              parameters: z.object({}),
              async execute() {
                return { title: 'Test1', output: 'test1' }
              },
            })
            ToolRegistry.register(tool1)

            // 验证工具已注册
            expect(ToolRegistry.has(toolDef.id)).toBe(true)

            // 注销工具
            const unregistered = ToolRegistry.unregister(toolDef.id)
            expect(unregistered).toBe(true)

            // 验证工具已注销
            expect(ToolRegistry.has(toolDef.id)).toBe(false)
            expect(ToolRegistry.get(toolDef.id)).toBeUndefined()

            // 创建并注册第二个工具（相同 ID）
            const tool2 = Tool.define({
              id: toolDef.id,
              description: toolDef.description2,
              parameters: z.object({}),
              async execute() {
                return { title: 'Test2', output: 'test2' }
              },
            })
            ToolRegistry.register(tool2)

            // 验证新工具已注册
            expect(ToolRegistry.has(toolDef.id)).toBe(true)
            const retrieved = ToolRegistry.get(toolDef.id)
            expect(retrieved?.description).toBe(toolDef.description2)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle batch registration with duplicate IDs', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            count: fc.integer({ min: 2, max: 10 }),
          }),
          (toolDef) => {
            // 每次迭代前清空注册表
            ToolRegistry.clear()

            // 创建多个相同 ID 的工具
            const tools = Array.from({ length: toolDef.count }, (_, index) =>
              Tool.define({
                id: toolDef.id,
                description: `Tool ${index}`,
                parameters: z.object({}),
                async execute() {
                  return { title: `Test${index}`, output: `test${index}` }
                },
              })
            )

            // 批量注册
            ToolRegistry.register(tools)

            // 验证只有一个工具被注册（最后一个）
            expect(ToolRegistry.count()).toBe(1)

            // 验证查询到的是最后注册的工具
            const retrieved = ToolRegistry.get(toolDef.id)
            expect(retrieved?.description).toBe(`Tool ${toolDef.count - 1}`)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should preserve tool metadata after registration', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            description: fc.string({ minLength: 1, maxLength: 200 }),
            source: fc.constantFrom('builtin', 'mcp', 'custom'),
            mcpServer: fc.option(fc.string({ minLength: 1, maxLength: 50 }), {
              nil: undefined,
            }),
          }),
          (toolDef) => {
            // 创建工具
            const tool = Tool.define({
              id: toolDef.id,
              description: toolDef.description,
              parameters: z.object({}),
              source: toolDef.source as 'builtin' | 'mcp' | 'custom',
              mcpServer: toolDef.mcpServer,
              async execute() {
                return { title: 'Test', output: 'test' }
              },
            })

            // 注册工具
            ToolRegistry.register(tool)

            // 验证工具元数据被保留
            const retrieved = ToolRegistry.get(toolDef.id)
            expect(retrieved?.source).toBe(toolDef.source)
            if (toolDef.mcpServer !== undefined) {
              expect(retrieved?.mcpServer).toBe(toolDef.mcpServer)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
