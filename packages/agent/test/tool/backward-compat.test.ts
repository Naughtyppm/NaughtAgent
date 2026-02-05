import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fc from "fast-check"
import { z } from "zod"
import { Tool } from "../../src/tool/tool"
import { ToolRegistry } from "../../src/tool/registry"

/**
 * Feature: phase-2-tool-layer, Property 15: 向后兼容的格式转换
 *
 * 对于任何旧格式的工具定义（没有 inputSchema、source、title 等新字段），
 * 通过 Tool.define() 处理后应该自动生成这些字段，确保向后兼容。
 *
 * Validates: Requirements 5.1, 5.2
 */
describe("Backward Compatibility", () => {
  describe("Property 15: 向后兼容的格式转换", () => {
    beforeEach(() => {
      ToolRegistry.clear()
    })

    afterEach(() => {
      ToolRegistry.clear()
    })

    it("should auto-generate inputSchema for tools without it", () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            description: fc.string({ minLength: 1, maxLength: 200 }),
          }),
          (toolDef) => {
            // 创建旧格式工具（没有 inputSchema）
            const tool = Tool.define({
              id: toolDef.id,
              description: toolDef.description,
              parameters: z.object({
                name: z.string(),
                age: z.number().optional(),
              }),
              async execute() {
                return { title: "Test", output: "test" }
              },
            })

            // 验证 inputSchema 被自动生成
            expect(tool.inputSchema).toBeDefined()
            expect(tool.inputSchema?.type).toBe("object")
            expect(tool.inputSchema?.properties).toBeDefined()
            expect(tool.inputSchema?.properties?.name).toBeDefined()
            expect(tool.inputSchema?.properties?.age).toBeDefined()
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should set default source to 'builtin' for tools without source", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), (toolId) => {
          // 创建旧格式工具（没有 source）
          const tool = Tool.define({
            id: toolId,
            description: "Test tool",
            parameters: z.object({}),
            async execute() {
              return { title: "Test", output: "test" }
            },
          })

          // 验证 source 被设置为默认值
          expect(tool.source).toBe("builtin")
        }),
        { numRuns: 100 }
      )
    })

    it("should set default title to id for tools without title", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), (toolId) => {
          // 创建旧格式工具（没有 title）
          const tool = Tool.define({
            id: toolId,
            description: "Test tool",
            parameters: z.object({}),
            async execute() {
              return { title: "Test", output: "test" }
            },
          })

          // 验证 title 被设置为 id
          expect(tool.title).toBe(toolId)
        }),
        { numRuns: 100 }
      )
    })

    it("should preserve user-provided values over defaults", () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            title: fc.string({ minLength: 1, maxLength: 100 }),
            source: fc.constantFrom("builtin", "mcp", "custom"),
          }),
          (toolDef) => {
            // 创建工具并提供自定义值
            const tool = Tool.define({
              id: toolDef.id,
              description: "Test tool",
              parameters: z.object({}),
              title: toolDef.title,
              source: toolDef.source as "builtin" | "mcp" | "custom",
              async execute() {
                return { title: "Test", output: "test" }
              },
            })

            // 验证用户提供的值被保留
            expect(tool.title).toBe(toolDef.title)
            expect(tool.source).toBe(toolDef.source)
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should mark tools as _defined after Tool.define()", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), (toolId) => {
          const tool = Tool.define({
            id: toolId,
            description: "Test tool",
            parameters: z.object({}),
            async execute() {
              return { title: "Test", output: "test" }
            },
          })

          // 验证 _defined 标记被设置
          expect(tool._defined).toBe(true)
        }),
        { numRuns: 100 }
      )
    })

    it("should handle complex parameter schemas in old format", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), (toolId) => {
          // 创建带有复杂参数的旧格式工具
          const tool = Tool.define({
            id: toolId,
            description: "Tool with complex params",
            parameters: z.object({
              user: z.object({
                name: z.string(),
                email: z.string().email(),
              }),
              tags: z.array(z.string()),
              options: z
                .object({
                  verbose: z.boolean().default(false),
                })
                .optional(),
            }),
            async execute() {
              return { title: "Test", output: "test" }
            },
          })

          // 验证 inputSchema 正确生成
          expect(tool.inputSchema).toBeDefined()
          expect(tool.inputSchema?.type).toBe("object")
          expect(tool.inputSchema?.properties?.user).toBeDefined()
          expect(tool.inputSchema?.properties?.tags).toBeDefined()
          expect(tool.inputSchema?.properties?.options).toBeDefined()
        }),
        { numRuns: 100 }
      )
    })

    it("should work correctly when registered to ToolRegistry", () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            description: fc.string({ minLength: 1, maxLength: 200 }),
          }),
          (toolDef) => {
            // 每次迭代前清空注册表
            ToolRegistry.clear()

            // 创建旧格式工具
            const tool = Tool.define({
              id: toolDef.id,
              description: toolDef.description,
              parameters: z.object({
                input: z.string(),
              }),
              async execute() {
                return { title: "Test", output: "test" }
              },
            })

            // 注册工具
            ToolRegistry.register(tool)

            // 验证工具被正确注册
            expect(ToolRegistry.has(toolDef.id)).toBe(true)

            // 验证注册后的工具保留了自动生成的字段
            const retrieved = ToolRegistry.get(toolDef.id)
            expect(retrieved?.inputSchema).toBeDefined()
            expect(retrieved?.source).toBe("builtin")
            expect(retrieved?.title).toBe(toolDef.id)
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Feature: phase-2-tool-layer, Property 16: 新旧 API 共存
   *
   * 新旧 API 应该能够共存，旧的 ToolRegistry.register() 签名应该继续工作，
   * 同时支持新的批量注册选项。
   *
   * Validates: Requirements 5.3
   */
  describe("Property 16: 新旧 API 共存", () => {
    beforeEach(() => {
      ToolRegistry.clear()
    })

    afterEach(() => {
      ToolRegistry.clear()
    })

    it("should support single tool registration (old API)", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), (toolId) => {
          ToolRegistry.clear()

          const tool = Tool.define({
            id: toolId,
            description: "Single tool",
            parameters: z.object({}),
            async execute() {
              return { title: "Test", output: "test" }
            },
          })

          // 使用旧 API（单个注册）
          ToolRegistry.register(tool)

          expect(ToolRegistry.has(toolId)).toBe(true)
          expect(ToolRegistry.count()).toBe(1)
        }),
        { numRuns: 100 }
      )
    })

    it("should support batch tool registration (new API)", () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
            minLength: 2,
            maxLength: 10,
          }),
          (toolIds) => {
            ToolRegistry.clear()

            const tools = toolIds.map((id) =>
              Tool.define({
                id,
                description: `Tool ${id}`,
                parameters: z.object({}),
                async execute() {
                  return { title: "Test", output: "test" }
                },
              })
            )

            // 使用新 API（批量注册）
            ToolRegistry.register(tools)

            const uniqueIds = new Set(toolIds)
            expect(ToolRegistry.count()).toBe(uniqueIds.size)

            for (const id of uniqueIds) {
              expect(ToolRegistry.has(id)).toBe(true)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should allow mixing single and batch registrations", () => {
      fc.assert(
        fc.property(
          fc.record({
            singleId: fc.string({ minLength: 1, maxLength: 50 }),
            batchIds: fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
              minLength: 1,
              maxLength: 5,
            }),
          }),
          (toolDef) => {
            ToolRegistry.clear()

            // 单个注册
            const singleTool = Tool.define({
              id: toolDef.singleId,
              description: "Single tool",
              parameters: z.object({}),
              async execute() {
                return { title: "Test", output: "test" }
              },
            })
            ToolRegistry.register(singleTool)

            // 批量注册
            const batchTools = toolDef.batchIds.map((id) =>
              Tool.define({
                id,
                description: `Batch tool ${id}`,
                parameters: z.object({}),
                async execute() {
                  return { title: "Test", output: "test" }
                },
              })
            )
            ToolRegistry.register(batchTools)

            // 验证所有工具都被注册
            const allIds = new Set([toolDef.singleId, ...toolDef.batchIds])
            expect(ToolRegistry.count()).toBe(allIds.size)

            for (const id of allIds) {
              expect(ToolRegistry.has(id)).toBe(true)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should handle empty array registration gracefully", () => {
      fc.assert(
        fc.property(fc.constant([]), () => {
          ToolRegistry.clear()

          // 注册空数组
          ToolRegistry.register([])

          expect(ToolRegistry.count()).toBe(0)
        }),
        { numRuns: 100 }
      )
    })

    it("should maintain tool metadata with both APIs", () => {
      fc.assert(
        fc.property(
          fc.record({
            id1: fc.string({ minLength: 1, maxLength: 50 }),
            id2: fc.string({ minLength: 1, maxLength: 50 }),
            source1: fc.constantFrom("builtin", "mcp", "custom"),
            source2: fc.constantFrom("builtin", "mcp", "custom"),
          }),
          (toolDef) => {
            ToolRegistry.clear()

            // 单个注册
            const tool1 = Tool.define({
              id: toolDef.id1,
              description: "Tool 1",
              parameters: z.object({}),
              source: toolDef.source1 as "builtin" | "mcp" | "custom",
              async execute() {
                return { title: "Test", output: "test" }
              },
            })
            ToolRegistry.register(tool1)

            // 批量注册
            const tool2 = Tool.define({
              id: toolDef.id2,
              description: "Tool 2",
              parameters: z.object({}),
              source: toolDef.source2 as "builtin" | "mcp" | "custom",
              async execute() {
                return { title: "Test", output: "test" }
              },
            })
            ToolRegistry.register([tool2])

            // 验证元数据被保留
            const retrieved1 = ToolRegistry.get(toolDef.id1)
            const retrieved2 = ToolRegistry.get(toolDef.id2)

            if (toolDef.id1 !== toolDef.id2) {
              expect(retrieved1?.source).toBe(toolDef.source1)
              expect(retrieved2?.source).toBe(toolDef.source2)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("should support filtering with both registration methods", () => {
      fc.assert(
        fc.property(
          fc.record({
            builtinId: fc.string({ minLength: 1, maxLength: 50 }),
            mcpId: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          (toolDef) => {
            ToolRegistry.clear()

            // 单个注册 builtin 工具
            const builtinTool = Tool.define({
              id: toolDef.builtinId,
              description: "Builtin tool",
              parameters: z.object({}),
              source: "builtin",
              async execute() {
                return { title: "Test", output: "test" }
              },
            })
            ToolRegistry.register(builtinTool)

            // 批量注册 mcp 工具
            const mcpTool = Tool.define({
              id: toolDef.mcpId,
              description: "MCP tool",
              parameters: z.object({}),
              source: "mcp",
              mcpServer: "test-server",
              async execute() {
                return { title: "Test", output: "test" }
              },
            })
            ToolRegistry.register([mcpTool])

            // 验证过滤功能
            const builtinTools = ToolRegistry.list({ source: "builtin" })
            const mcpTools = ToolRegistry.list({ source: "mcp" })

            if (toolDef.builtinId !== toolDef.mcpId) {
              expect(builtinTools.some((t) => t.id === toolDef.builtinId)).toBe(
                true
              )
              expect(mcpTools.some((t) => t.id === toolDef.mcpId)).toBe(true)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Feature: phase-2-tool-layer
   *
   * 弃用警告测试：验证使用旧 API（未经 Tool.define() 处理的工具）时会发出警告
   *
   * Validates: Requirements 5.4
   */
  describe("Deprecation Warnings", () => {
    beforeEach(() => {
      ToolRegistry.clear()
    })

    afterEach(() => {
      ToolRegistry.clear()
    })

    it("should emit deprecation warning for tools not created with Tool.define()", () => {
      // 创建一个未经 Tool.define() 处理的工具
      const legacyTool: Tool.Definition = {
        id: "legacy-tool",
        description: "A legacy tool",
        parameters: z.object({}),
        async execute() {
          return { title: "Test", output: "test" }
        },
      }

      // 注册工具
      ToolRegistry.register(legacyTool)

      // 验证弃用警告被记录
      expect(ToolRegistry.hasDeprecationWarning("legacy-tool")).toBe(true)
    })

    it("should NOT emit deprecation warning for tools created with Tool.define()", () => {
      // 创建一个经过 Tool.define() 处理的工具
      const modernTool = Tool.define({
        id: "modern-tool",
        description: "A modern tool",
        parameters: z.object({}),
        async execute() {
          return { title: "Test", output: "test" }
        },
      })

      // 注册工具
      ToolRegistry.register(modernTool)

      // 验证没有弃用警告
      expect(ToolRegistry.hasDeprecationWarning("modern-tool")).toBe(false)
    })

    it("should only emit deprecation warning once per tool", () => {
      // 创建一个未经 Tool.define() 处理的工具
      const legacyTool: Tool.Definition = {
        id: "legacy-tool-once",
        description: "A legacy tool",
        parameters: z.object({}),
        async execute() {
          return { title: "Test", output: "test" }
        },
      }

      // 多次注册同一工具
      ToolRegistry.register(legacyTool)
      ToolRegistry.register(legacyTool)
      ToolRegistry.register(legacyTool)

      // 验证弃用警告只记录一次
      expect(ToolRegistry.hasDeprecationWarning("legacy-tool-once")).toBe(true)
      // 工具应该只有一个（被覆盖）
      expect(ToolRegistry.count()).toBe(1)
    })

    it("should reset deprecation warnings with resetDeprecationWarnings()", () => {
      // 创建一个未经 Tool.define() 处理的工具
      const legacyTool: Tool.Definition = {
        id: "legacy-tool-reset",
        description: "A legacy tool",
        parameters: z.object({}),
        async execute() {
          return { title: "Test", output: "test" }
        },
      }

      // 注册工具
      ToolRegistry.register(legacyTool)
      expect(ToolRegistry.hasDeprecationWarning("legacy-tool-reset")).toBe(true)

      // 重置弃用警告
      ToolRegistry.resetDeprecationWarnings()
      expect(ToolRegistry.hasDeprecationWarning("legacy-tool-reset")).toBe(
        false
      )
    })

    it("should clear deprecation warnings when registry is cleared", () => {
      // 创建一个未经 Tool.define() 处理的工具
      const legacyTool: Tool.Definition = {
        id: "legacy-tool-clear",
        description: "A legacy tool",
        parameters: z.object({}),
        async execute() {
          return { title: "Test", output: "test" }
        },
      }

      // 注册工具
      ToolRegistry.register(legacyTool)
      expect(ToolRegistry.hasDeprecationWarning("legacy-tool-clear")).toBe(true)

      // 清空注册表
      ToolRegistry.clear()
      expect(ToolRegistry.hasDeprecationWarning("legacy-tool-clear")).toBe(
        false
      )
    })

    it("should still register legacy tools despite deprecation warning", () => {
      // 创建一个未经 Tool.define() 处理的工具
      const legacyTool: Tool.Definition = {
        id: "legacy-tool-works",
        description: "A legacy tool that still works",
        parameters: z.object({
          input: z.string(),
        }),
        async execute(params) {
          return { title: "Test", output: `Received: ${params.input}` }
        },
      }

      // 注册工具
      ToolRegistry.register(legacyTool)

      // 验证工具被正确注册
      expect(ToolRegistry.has("legacy-tool-works")).toBe(true)

      // 验证工具可以被获取
      const retrieved = ToolRegistry.get("legacy-tool-works")
      expect(retrieved).toBeDefined()
      expect(retrieved?.id).toBe("legacy-tool-works")
      expect(retrieved?.description).toBe("A legacy tool that still works")
    })

    it("should handle mixed legacy and modern tools in batch registration", () => {
      // 创建混合的工具列表
      const legacyTool: Tool.Definition = {
        id: "batch-legacy",
        description: "Legacy tool in batch",
        parameters: z.object({}),
        async execute() {
          return { title: "Test", output: "test" }
        },
      }

      const modernTool = Tool.define({
        id: "batch-modern",
        description: "Modern tool in batch",
        parameters: z.object({}),
        async execute() {
          return { title: "Test", output: "test" }
        },
      })

      // 批量注册
      ToolRegistry.register([legacyTool, modernTool])

      // 验证两个工具都被注册
      expect(ToolRegistry.has("batch-legacy")).toBe(true)
      expect(ToolRegistry.has("batch-modern")).toBe(true)

      // 验证只有 legacy 工具触发了弃用警告
      expect(ToolRegistry.hasDeprecationWarning("batch-legacy")).toBe(true)
      expect(ToolRegistry.hasDeprecationWarning("batch-modern")).toBe(false)
    })
  })
})
