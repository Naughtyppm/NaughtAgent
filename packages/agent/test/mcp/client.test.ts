/**
 * MCP Client 测试
 */

import { describe, it, expect } from "vitest"
import { McpClient } from "../../src/mcp/client"
import { MCP_PROTOCOL_VERSION, DEFAULT_TIMEOUT } from "../../src/mcp/types"

describe("McpClient", () => {
  it("should initialize with disconnected state", () => {
    const client = new McpClient({
      name: "test",
      transport: "stdio",
      command: "echo",
    })

    expect(client.state).toBe("disconnected")
    expect(client.capabilities).toBeNull()
    expect(client.serverInfo).toBeNull()
    expect(client.name).toBe("test")
  })

  it("should have correct name", () => {
    const client = new McpClient({
      name: "my-server",
      transport: "stdio",
      command: "test",
    })

    expect(client.name).toBe("my-server")
  })

  // Note: Full connection tests require a real MCP server
  // These tests focus on the client's initial state and configuration
})

describe("MCP Constants", () => {
  it("should have correct protocol version", () => {
    expect(MCP_PROTOCOL_VERSION).toBe("2024-11-05")
  })

  it("should have correct default timeout", () => {
    expect(DEFAULT_TIMEOUT).toBe(30000)
  })
})
