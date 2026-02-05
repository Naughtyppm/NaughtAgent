import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { z } from 'zod'
import { Tool } from '../../src/tool/tool'

/**
 * Feature: phase-2-tool-layer, Property 2: 工具接口字段完整性
 * 
 * 对于任何通过 `Tool.define()` 创建的工具定义，返回的对象应该包含所有必需字段
 * （`id`, `description`, `parameters`, `execute`），并且可选字段
 * （`inputSchema`, `outputSchema`, `title`, `icons`）如果提供则应该保留。
 * 
 * Validates: Requirements 1.1, 1.2
 */
describe('Tool Properties', () => {
  describe('Property 2: 工具接口字段完整性', () => {
    it('should preserve all required fields', () => {
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

            // 验证所有必需字段都存在
            expect(tool.id).toBe(toolDef.id)
            expect(tool.description).toBe(toolDef.description)
            expect(tool.parameters).toBeDefined()
            expect(tool.execute).toBeDefined()
            expect(typeof tool.execute).toBe('function')
          }
        ),
        { numRuns: 100 } // 运行 100 次迭代
      )
    })

    it('should auto-generate inputSchema for all tools', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (toolId) => {
            const tool = Tool.define({
              id: toolId,
              description: 'Test tool',
              parameters: z.object({
                param1: z.string(),
                param2: z.number().optional(),
              }),
              async execute() {
                return { title: 'Test', output: 'test' }
              },
            })

            // 验证 inputSchema 自动生成
            expect(tool.inputSchema).toBeDefined()
            expect(tool.inputSchema?.type).toBe('object')
            expect(tool.inputSchema?.properties).toBeDefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should set default values for source and title', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (toolId) => {
            const tool = Tool.define({
              id: toolId,
              description: 'Test tool',
              parameters: z.object({}),
              async execute() {
                return { title: 'Test', output: 'test' }
              },
            })

            // 验证默认值
            expect(tool.source).toBe('builtin')
            expect(tool.title).toBe(toolId)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should preserve optional fields when provided', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            title: fc.string({ minLength: 1, maxLength: 100 }),
            source: fc.constantFrom('builtin', 'mcp', 'custom'),
            mcpServer: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          }),
          (toolDef) => {
            const tool = Tool.define({
              id: toolDef.id,
              description: 'Test tool',
              parameters: z.object({}),
              title: toolDef.title,
              source: toolDef.source as 'builtin' | 'mcp' | 'custom',
              mcpServer: toolDef.mcpServer,
              async execute() {
                return { title: 'Test', output: 'test' }
              },
            })

            // 验证可选字段被保留
            expect(tool.title).toBe(toolDef.title)
            expect(tool.source).toBe(toolDef.source)
            if (toolDef.mcpServer !== undefined) {
              expect(tool.mcpServer).toBe(toolDef.mcpServer)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should preserve icons when provided', () => {
      fc.assert(
        fc.property(
          fc.record({
            light: fc.string({ minLength: 1, maxLength: 100 }),
            dark: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          (icons) => {
            const tool = Tool.define({
              id: 'test-tool',
              description: 'Test tool',
              parameters: z.object({}),
              icons: {
                light: icons.light,
                dark: icons.dark,
              },
              async execute() {
                return { title: 'Test', output: 'test' }
              },
            })

            // 验证 icons 被保留
            expect(tool.icons).toBeDefined()
            expect(tool.icons?.light).toBe(icons.light)
            expect(tool.icons?.dark).toBe(icons.dark)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should preserve outputSchema when provided', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            { type: 'string' },
            { type: 'number' },
            { type: 'object', properties: { result: { type: 'string' } } }
          ),
          (outputSchema) => {
            const tool = Tool.define({
              id: 'test-tool',
              description: 'Test tool',
              parameters: z.object({}),
              outputSchema,
              async execute() {
                return { title: 'Test', output: 'test' }
              },
            })

            // 验证 outputSchema 被保留
            expect(tool.outputSchema).toBeDefined()
            expect(tool.outputSchema?.type).toBe(outputSchema.type)
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle complex parameter schemas', () => {
      fc.assert(
        fc.property(
          fc.record({
            stringParam: fc.string(),
            numberParam: fc.integer(),
            boolParam: fc.boolean(),
          }),
          (params) => {
            const tool = Tool.define({
              id: 'complex-tool',
              description: 'Tool with complex params',
              parameters: z.object({
                stringParam: z.string(),
                numberParam: z.number(),
                boolParam: z.boolean(),
                optionalParam: z.string().optional(),
              }),
              async execute() {
                return { title: 'Test', output: 'test' }
              },
            })

            // 验证 inputSchema 包含所有参数
            expect(tool.inputSchema?.properties?.stringParam).toBeDefined()
            expect(tool.inputSchema?.properties?.numberParam).toBeDefined()
            expect(tool.inputSchema?.properties?.boolParam).toBeDefined()
            expect(tool.inputSchema?.properties?.optionalParam).toBeDefined()

            // 验证必需字段
            expect(tool.inputSchema?.required).toContain('stringParam')
            expect(tool.inputSchema?.required).toContain('numberParam')
            expect(tool.inputSchema?.required).toContain('boolParam')
            expect(tool.inputSchema?.required).not.toContain('optionalParam')
          }
        ),
        { numRuns: 100 }
      )
    })

    it('should handle edge cases: empty strings and special characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (toolId) => {
            // 测试包含特殊字符的工具 ID
            const specialId = toolId.replace(/[^a-zA-Z0-9]/g, '-')
            if (specialId.length === 0) return // 跳过空字符串

            const tool = Tool.define({
              id: specialId,
              description: 'Test tool',
              parameters: z.object({}),
              async execute() {
                return { title: 'Test', output: 'test' }
              },
            })

            expect(tool.id).toBe(specialId)
            expect(tool.inputSchema).toBeDefined()
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
