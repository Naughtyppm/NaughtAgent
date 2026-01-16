/**
 * MCP Manager 测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import {
  McpManager,
  loadMcpConfig,
  getMcpManager,
  setMcpManager,
} from "../../src/mcp/manager"

describe("loadMcpConfig", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-config-test-"))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it("should load config from .naught/mcp.json", async () => {
    const configDir = path.join(tempDir, ".naught")
    await fs.mkdir(configDir, { recursive: true })

    const config = {
      servers: [
        {
          name: "test-server",
          transport: "stdio",
          command: "node",
          args: ["server.js"],
        },
      ],
    }
    await fs.writeFile(
      path.join(configDir, "mcp.json"),
      JSON.stringify(config)
    )

    const loaded = await loadMcpConfig(tempDir)

    expect(loaded.servers).toHaveLength(1)
    expect(loaded.servers[0].name).toBe("test-server")
    expect(loaded.servers[0].transport).toBe("stdio")
    expect(loaded.servers[0].command).toBe("node")
    expect(loaded.servers[0].args).toEqual(["server.js"])
  })

  it("should return empty config if file not found", async () => {
    const loaded = await loadMcpConfig(tempDir)

    expect(loaded.servers).toEqual([])
  })

  it("should replace environment variables", async () => {
    const configDir = path.join(tempDir, ".naught")
    await fs.mkdir(configDir, { recursive: true })

    // 设置环境变量
    process.env.TEST_MCP_TOKEN = "secret-token"

    const config = {
      servers: [
        {
          name: "api-server",
          transport: "sse",
          url: "http://localhost:8080",
          headers: {
            Authorization: "Bearer ${TEST_MCP_TOKEN}",
          },
        },
      ],
    }
    await fs.writeFile(
      path.join(configDir, "mcp.json"),
      JSON.stringify(config)
    )

    const loaded = await loadMcpConfig(tempDir)

    expect(loaded.servers[0].headers?.Authorization).toBe("Bearer secret-token")

    // 清理
    delete process.env.TEST_MCP_TOKEN
  })

  it("should replace missing env vars with empty string", async () => {
    const configDir = path.join(tempDir, ".naught")
    await fs.mkdir(configDir, { recursive: true })

    const config = {
      servers: [
        {
          name: "test",
          transport: "stdio",
          command: "test",
          env: {
            TOKEN: "${NONEXISTENT_VAR}",
          },
        },
      ],
    }
    await fs.writeFile(
      path.join(configDir, "mcp.json"),
      JSON.stringify(config)
    )

    const loaded = await loadMcpConfig(tempDir)

    expect(loaded.servers[0].env?.TOKEN).toBe("")
  })
})

describe("McpManager", () => {
  let manager: McpManager

  beforeEach(() => {
    manager = new McpManager()
  })

  afterEach(async () => {
    await manager.closeAll()
  })

  it("should start with no servers", () => {
    expect(manager.getServerNames()).toEqual([])
    expect(manager.getAllClients()).toEqual([])
  })

  it("should check if server exists", () => {
    expect(manager.hasServer("nonexistent")).toBe(false)
  })

  it("should return undefined for nonexistent client", () => {
    expect(manager.getClient("nonexistent")).toBeUndefined()
  })

  it("should return empty status for no servers", () => {
    const status = manager.getStatus()
    expect(status).toEqual([])
  })

  // Note: Full integration tests would require a real MCP server
  // These tests focus on the manager's internal logic
})

describe("Global McpManager", () => {
  it("should get and set global manager", () => {
    const manager = new McpManager()
    setMcpManager(manager)

    expect(getMcpManager()).toBe(manager)
  })

  it("should create manager if not set", () => {
    // Reset global manager
    setMcpManager(null as unknown as McpManager)

    const manager = getMcpManager()
    expect(manager).toBeInstanceOf(McpManager)
  })
})
