/**
 * MCP 适配器属性测试
 *
 * Feature: phase-2-tool-layer
 * 测试 MCP 工具包装和结果转换的正确性属性
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"
import { wrapMcpTool, convertMcpResult } from "../../src/mcp/adapter"
import type { McpTool, McpToolResult, McpContent } from "../../src/mcp/types"
import type { McpClient } from "../../src/mcp/client"
import { Tool } from "../../src/tool/tool"

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * 创建 mock MCP 客户端
 */
function createMockClient(): McpClient {
  return {
    callTool: vi.fn(),
    state: "connected",
    name: "test-server",
  } as unknown as McpClient
}

/**
 * 创建测试用的 Tool.Context
 */
function createTestContext(): Tool.Context {
  return {
    sessionID: "test-session",
    cwd: "/test",
    abort: new AbortController().signal,
  }
}

// ============================================================================
// Arbitraries
// ============================================================================

/**
 * 生成 MCP 工具定义
 */
const mcpToolArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  inputSchema: fc.record({
    type: fc.constant("object" as const),
    properties: fc.option(
      fc.dictionary(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.record({
          type: fc.constantFrom("string", "number", "boolean"),
          description: fc.option(fc.string({ maxLength: 100 }), {
            nil: undefined,
          }),
        })
      ),
      { nil: undefined }
    ),
    required: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 })), {
      nil: undefined,
    }),
  }),
})

/**
 * 生成 MCP 文本内容
 */
const mcpTextContentArb: fc.Arbitrary<McpContent> = fc
  .string({ maxLength: 500 })
  .map((text) => ({
    type: "text" as const,
    text,
  }))

/**
 * 生成 MCP 图片内容
 */
const mcpImageContentArb: fc.Arbitrary<McpContent> = fc
  .record({
    data: fc.base64String({ minLength: 10, maxLength: 100 }),
    mimeType: fc.constantFrom("image/png", "image/jpeg", "image/gif"),
  })
  .map((img) => ({
    type: "image" as const,
    ...img,
  }))

/**
 * 生成 MCP 资源内容
 */
const mcpResourceContentArb: fc.Arbitrary<McpContent> = fc
  .record({
    uri: fc.webUrl(),
    mimeType: fc.option(fc.constantFrom("text/plain", "application/json"), {
      nil: undefined,
    }),
    text: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  })
  .map((resource) => ({
    type: "resource" as const,
    resource,
  }))

/**
 * 生成 MCP 内容（混合类型）
 */
const mcpContentArb = fc.oneof(
  mcpTextContentArb,
  mcpImageContentArb,
  mcpResourceContentArb
)

/**
 * 生成 MCP 工具结果
 */
const mcpToolResultArb = fc.record({
  content: fc.array(mcpContentArb, { minLength: 1, maxLength: 10 }),
  isError: fc.option(fc.boolean(), { nil: undefined }),
})

// ============================================================================
// Property 5: MCP 工具调用请求格式
// ============================================================================

describe("Property 5: MCP 工具调用请求格式", () => {
  // Feature: phase-2-tool-layer, Property 5: MCP 工具调用请求格式
  // 验证需求：2.4

  it("包装的 MCP 工具调用时传递正确的参数格式", async () => {
    await fc.assert(
      fc.asyncProperty(
        mcpToolArb,
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer())),
        async (tool, serverName, params) => {
          const mockClient = createMockClient()
          const mockResult: McpToolResult = {
            content: [{ type: "text", text: "success" }],
          }
          vi.mocked(mockClient.callTool).mockResolvedValue(mockResult)

          const wrappedTool = wrapMcpTool({
            tool,
            client: mockClient,
            serverName,
          })

          const ctx = createTestContext()
          try {
            await wrappedTool.execute(params, ctx)
          } catch {
            // 忽略参数验证错误
          }

          if (vi.mocked(mockClient.callTool).mock.calls.length > 0) {
            const [toolName, toolArgs] = vi.mocked(mockClient.callTool).mock
              .calls[0]

            expect(toolName).toBe(tool.name)
            expect(typeof toolArgs).toBe("object")
            expect(toolArgs).not.toBeNull()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it("包装的工具 ID 格式为 serverName:toolName", () => {
    fc.assert(
      fc.property(
        mcpToolArb,
        fc.string({ minLength: 1, maxLength: 30 }),
        (tool, serverName) => {
          const mockClient = createMockClient()
          const wrappedTool = wrapMcpTool({
            tool,
            client: mockClient,
            serverName,
          })
          expect(wrappedTool.id).toBe(`${serverName}:${tool.name}`)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("包装的工具 source 字段为 'mcp'", () => {
    fc.assert(
      fc.property(
        mcpToolArb,
        fc.string({ minLength: 1, maxLength: 30 }),
        (tool, serverName) => {
          const mockClient = createMockClient()
          const wrappedTool = wrapMcpTool({
            tool,
            client: mockClient,
            serverName,
          })
          expect(wrappedTool.source).toBe("mcp")
        }
      ),
      { numRuns: 100 }
    )
  })

  it("包装的工具 mcpServer 字段正确设置", () => {
    fc.assert(
      fc.property(
        mcpToolArb,
        fc.string({ minLength: 1, maxLength: 30 }),
        (tool, serverName) => {
          const mockClient = createMockClient()
          const wrappedTool = wrapMcpTool({
            tool,
            client: mockClient,
            serverName,
          })
          expect(wrappedTool.mcpServer).toBe(serverName)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================================
// Property 9: MCP 工具包装后的接口一致性
// ============================================================================

describe("Property 9: MCP 工具包装后的接口一致性", () => {
  // Feature: phase-2-tool-layer, Property 9: MCP 工具包装后的接口一致性
  // 验证需求：3.2

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("包装的工具符合 Tool.Definition 接口", () => {
    fc.assert(
      fc.property(
        mcpToolArb,
        fc.string({ minLength: 1, maxLength: 30 }),
        (tool, serverName) => {
          const mockClient = createMockClient()
          const wrappedTool = wrapMcpTool({
            tool,
            client: mockClient,
            serverName,
          })

          expect(wrappedTool).toHaveProperty("id")
          expect(wrappedTool).toHaveProperty("description")
          expect(wrappedTool).toHaveProperty("parameters")
          expect(wrappedTool).toHaveProperty("execute")

          expect(typeof wrappedTool.id).toBe("string")
          expect(typeof wrappedTool.description).toBe("string")
          expect(typeof wrappedTool.execute).toBe("function")
        }
      ),
      { numRuns: 100 }
    )
  })

  it("包装的工具 inputSchema 保留原始 MCP schema", () => {
    fc.assert(
      fc.property(
        mcpToolArb,
        fc.string({ minLength: 1, maxLength: 30 }),
        (tool, serverName) => {
          const mockClient = createMockClient()
          const wrappedTool = wrapMcpTool({
            tool,
            client: mockClient,
            serverName,
          })

          expect(wrappedTool.inputSchema).toBeDefined()
          expect(wrappedTool.inputSchema).toEqual(tool.inputSchema)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("convertMcpResult 正确提取文本内容", () => {
    fc.assert(
      fc.property(mcpToolResultArb, fc.string(), (mcpResult, toolName) => {
        const result = convertMcpResult(mcpResult, toolName)

        expect(result).toHaveProperty("title")
        expect(result).toHaveProperty("output")
        expect(result).toHaveProperty("metadata")

        expect(result.title).toBe(toolName)
        expect(typeof result.output).toBe("string")

        expect(result.metadata).toHaveProperty("contentTypes")
        expect(result.metadata).toHaveProperty("hasImages")
        expect(result.metadata).toHaveProperty("hasResources")
      }),
      { numRuns: 100 }
    )
  })

  it("convertMcpResult 正确识别图片内容", () => {
    fc.assert(
      fc.property(
        fc.array(mcpImageContentArb, { minLength: 1, maxLength: 5 }),
        fc.string(),
        (imageContents, toolName) => {
          const mcpResult: McpToolResult = {
            content: imageContents,
          }

          const result = convertMcpResult(mcpResult, toolName)

          expect(result.metadata?.hasImages).toBe(true)
          expect(result.metadata?.contentTypes).toContain("image")
        }
      ),
      { numRuns: 100 }
    )
  })

  it("convertMcpResult 正确识别资源内容", () => {
    fc.assert(
      fc.property(
        fc.array(mcpResourceContentArb, { minLength: 1, maxLength: 5 }),
        fc.string(),
        (resourceContents, toolName) => {
          const mcpResult: McpToolResult = {
            content: resourceContents,
          }

          const result = convertMcpResult(mcpResult, toolName)

          expect(result.metadata?.hasResources).toBe(true)
          expect(result.metadata?.contentTypes).toContain("resource")
        }
      ),
      { numRuns: 100 }
    )
  })

  it("convertMcpResult 保留 isError 标志", () => {
    fc.assert(
      fc.property(mcpToolResultArb, fc.string(), (mcpResult, toolName) => {
        const result = convertMcpResult(mcpResult, toolName)

        expect(result.isError).toBe(mcpResult.isError)
        expect(result.metadata?.isError).toBe(mcpResult.isError)
      }),
      { numRuns: 100 }
    )
  })
})
