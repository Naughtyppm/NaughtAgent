/**
 * MCP Tools 测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  createMcpToolWrapper,
  getMcpToolInfo,
  isMcpTool,
  parseMcpToolName,
} from "../../src/mcp/tools"
import type { McpClient } from "../../src/mcp/client"
import type { McpTool, McpToolResult } from "../../src/mcp/types"

// Mock McpClient
function createMockClient(name: string): McpClient {
  return {
    name,
    state: "connected",
    capabilities: null,
    serverInfo: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    listTools: vi.fn(),
    callTool: vi.fn(),
    listResources: vi.fn(),
    readResource: vi.fn(),
    listPrompts: vi.fn(),
    getPrompt: vi.fn(),
    on: vi.fn(),
  } as unknown as McpClient
}

describe("createMcpToolWrapper", () => {
  it("should create a tool wrapper with correct name", () => {
    const client = createMockClient("test-server")
    const mcpTool: McpTool = {
      name: "read_file",
      description: "Read a file",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
        },
        required: ["path"],
      },
    }

    const tool = createMcpToolWrapper(client, mcpTool)

    expect(tool.name).toBe("mcp_test-server_read_file")
    expect(tool.description).toBe("Read a file")
    expect(tool.parameters.properties).toEqual(mcpTool.inputSchema.properties)
    expect(tool.parameters.required).toEqual(["path"])
  })

  it("should call MCP tool and format result", async () => {
    const client = createMockClient("test-server")
    const mcpTool: McpTool = {
      name: "echo",
      inputSchema: { type: "object" },
    }

    const mockResult: McpToolResult = {
      content: [{ type: "text", text: "Hello, World!" }],
    }
    vi.mocked(client.callTool).mockResolvedValue(mockResult)

    const tool = createMcpToolWrapper(client, mcpTool)
    const result = await tool.execute({ message: "test" }, { cwd: "/tmp" })

    expect(client.callTool).toHaveBeenCalledWith("echo", { message: "test" })
    expect(result.output).toBe("Hello, World!")
    expect(result.isError).toBeUndefined()
  })

  it("should handle multiple content items", async () => {
    const client = createMockClient("test-server")
    const mcpTool: McpTool = {
      name: "multi",
      inputSchema: { type: "object" },
    }

    const mockResult: McpToolResult = {
      content: [
        { type: "text", text: "Line 1" },
        { type: "text", text: "Line 2" },
      ],
    }
    vi.mocked(client.callTool).mockResolvedValue(mockResult)

    const tool = createMcpToolWrapper(client, mcpTool)
    const result = await tool.execute({}, { cwd: "/tmp" })

    expect(result.output).toBe("Line 1\nLine 2")
  })

  it("should handle image content", async () => {
    const client = createMockClient("test-server")
    const mcpTool: McpTool = {
      name: "screenshot",
      inputSchema: { type: "object" },
    }

    const mockResult: McpToolResult = {
      content: [{ type: "image", data: "base64...", mimeType: "image/png" }],
    }
    vi.mocked(client.callTool).mockResolvedValue(mockResult)

    const tool = createMcpToolWrapper(client, mcpTool)
    const result = await tool.execute({}, { cwd: "/tmp" })

    expect(result.output).toBe("[Image: image/png]")
  })

  it("should handle resource content", async () => {
    const client = createMockClient("test-server")
    const mcpTool: McpTool = {
      name: "get_resource",
      inputSchema: { type: "object" },
    }

    const mockResult: McpToolResult = {
      content: [
        {
          type: "resource",
          resource: { uri: "file:///test.txt", text: "File content" },
        },
      ],
    }
    vi.mocked(client.callTool).mockResolvedValue(mockResult)

    const tool = createMcpToolWrapper(client, mcpTool)
    const result = await tool.execute({}, { cwd: "/tmp" })

    expect(result.output).toBe("File content")
  })

  it("should handle errors", async () => {
    const client = createMockClient("test-server")
    const mcpTool: McpTool = {
      name: "failing",
      inputSchema: { type: "object" },
    }

    vi.mocked(client.callTool).mockRejectedValue(new Error("Tool failed"))

    const tool = createMcpToolWrapper(client, mcpTool)
    const result = await tool.execute({}, { cwd: "/tmp" })

    expect(result.isError).toBe(true)
    expect(result.output).toContain("Error calling MCP tool failing")
    expect(result.output).toContain("Tool failed")
  })

  it("should handle error results from MCP", async () => {
    const client = createMockClient("test-server")
    const mcpTool: McpTool = {
      name: "error_tool",
      inputSchema: { type: "object" },
    }

    const mockResult: McpToolResult = {
      content: [{ type: "text", text: "Something went wrong" }],
      isError: true,
    }
    vi.mocked(client.callTool).mockResolvedValue(mockResult)

    const tool = createMcpToolWrapper(client, mcpTool)
    const result = await tool.execute({}, { cwd: "/tmp" })

    expect(result.isError).toBe(true)
    expect(result.output).toBe("Something went wrong")
  })
})

describe("getMcpToolInfo", () => {
  it("should return tool info", () => {
    const client = createMockClient("my-server")
    const mcpTool: McpTool = {
      name: "my_tool",
      description: "A tool",
      inputSchema: { type: "object" },
    }

    const info = getMcpToolInfo(client, mcpTool)

    expect(info.mcpName).toBe("my_tool")
    expect(info.registeredName).toBe("mcp_my-server_my_tool")
    expect(info.serverName).toBe("my-server")
    expect(info.description).toBe("A tool")
  })
})

describe("isMcpTool", () => {
  it("should identify MCP tools", () => {
    expect(isMcpTool("mcp_server_tool")).toBe(true)
    expect(isMcpTool("mcp_a_b")).toBe(true)
  })

  it("should reject non-MCP tools", () => {
    expect(isMcpTool("read")).toBe(false)
    expect(isMcpTool("write")).toBe(false)
    expect(isMcpTool("mc_tool")).toBe(false)
  })
})

describe("parseMcpToolName", () => {
  it("should parse MCP tool names", () => {
    const result = parseMcpToolName("mcp_server_tool")
    expect(result).toEqual({
      serverName: "server",
      mcpToolName: "tool",
    })
  })

  it("should handle tool names with underscores", () => {
    const result = parseMcpToolName("mcp_server_read_file")
    expect(result).toEqual({
      serverName: "server",
      mcpToolName: "read_file",
    })
  })

  it("should return null for non-MCP tools", () => {
    expect(parseMcpToolName("read")).toBeNull()
    expect(parseMcpToolName("mcp_")).toBeNull()
  })
})
