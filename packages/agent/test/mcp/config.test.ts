/**
 * Feature: phase-2-tool-layer, Property 20: 配置文件加载和验证
 *
 * 对于任何有效的 MCP 配置文件，系统应该能够正确加载和验证配置，
 * 对于无效的配置，系统应该记录错误并使用默认设置。
 *
 * **Validates: Requirements 10.1, 10.2, 10.4, 10.5**
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import {
  McpServerConfigSchema,
  McpSettingsSchema,
  McpConfigSchema,
  validateConfig,
  loadConfigFromJson,
  loadMcpConfigFromFile,
  loadMcpConfig,
  compareConfigs,
  replaceEnvVars,
  DEFAULT_SETTINGS,
  DEFAULT_CONFIG,
  type McpConfigWithSettings,
  type ConfigChangeEvent,
} from "../../src/mcp/config"
import type { McpServerConfig } from "../../src/mcp/types"

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * 创建临时目录
 */
async function createTempDir(): Promise<string> {
  const tempDir = path.join(os.tmpdir(), `mcp-config-test-${Date.now()}`)
  await fs.mkdir(tempDir, { recursive: true })
  return tempDir
}

/**
 * 清理临时目录
 */
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true })
  } catch {
    // 忽略清理错误
  }
}

/**
 * 生成有效的 stdio 服务器配置
 */
const validStdioServerArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  transport: fc.constant("stdio" as const),
  command: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  args: fc.array(fc.string(), { maxLength: 5 }),
  timeout: fc.option(fc.integer({ min: 1000, max: 60000 }), { nil: undefined }),
})

/**
 * 生成有效的 SSE 服务器配置
 */
const validSseServerArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  transport: fc.constant("sse" as const),
  url: fc.webUrl(),
  timeout: fc.option(fc.integer({ min: 1000, max: 60000 }), { nil: undefined }),
})

/**
 * 生成有效的服务器配置
 */
const validServerArb = fc.oneof(validStdioServerArb, validSseServerArb)

/**
 * 生成有效的设置配置
 */
const validSettingsArb = fc.record({
  defaultTimeout: fc.integer({ min: 1000, max: 120000 }),
  hotReload: fc.boolean(),
  reconnect: fc.record({
    enabled: fc.boolean(),
    maxAttempts: fc.integer({ min: 1, max: 10 }),
    initialDelayMs: fc.integer({ min: 100, max: 5000 }),
    maxDelayMs: fc.integer({ min: 5000, max: 60000 }),
    backoffMultiplier: fc.integer({ min: 2, max: 5 }),
  }),
})

/**
 * 生成有效的完整配置
 */
const validConfigArb = fc.record({
  servers: fc.array(validServerArb, { maxLength: 5 }),
  settings: validSettingsArb,
})

// ============================================================================
// Property Tests: 配置加载和验证
// ============================================================================

describe("Property 20: 配置文件加载和验证", () => {
  /**
   * 属性 20.1：有效配置应该通过验证
   */
  it("Property 20.1: 有效配置通过验证", () => {
    fc.assert(
      fc.property(validConfigArb, (config) => {
        // 确保服务器名称唯一
        const uniqueNames = new Set(config.servers.map((s) => s.name))
        if (uniqueNames.size !== config.servers.length) {
          return true // 跳过重复名称的情况
        }

        const result = validateConfig(config)

        // 验证结果应该成功
        expect(result.success).toBe(true)
        expect(result.config).toBeDefined()
        expect(result.usedDefaults).toBe(false)

        // 验证服务器数量一致
        expect(result.config!.servers.length).toBe(config.servers.length)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * 属性 20.2：空配置应该使用默认值
   */
  it("Property 20.2: 空配置使用默认值", () => {
    const result = validateConfig({})

    expect(result.success).toBe(true)
    expect(result.config).toBeDefined()
    expect(result.config!.servers).toEqual([])
    expect(result.config!.settings).toEqual(DEFAULT_SETTINGS)
  })

  /**
   * 属性 20.3：JSON 解析应该正确处理有效 JSON
   */
  it("Property 20.3: JSON 解析正确处理有效 JSON", () => {
    fc.assert(
      fc.property(validConfigArb, (config) => {
        // 确保服务器名称唯一
        const uniqueNames = new Set(config.servers.map((s) => s.name))
        if (uniqueNames.size !== config.servers.length) {
          return true
        }

        const json = JSON.stringify(config)
        const result = loadConfigFromJson(json)

        expect(result.success).toBe(true)
        expect(result.config).toBeDefined()

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * 属性 20.4：stdio 传输必须有 command
   */
  it("Property 20.4: stdio 传输必须有 command", () => {
    const invalidConfig = {
      servers: [
        {
          name: "test-server",
          transport: "stdio",
          // 缺少 command
        },
      ],
    }

    const result = validateConfig(invalidConfig)

    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)
    expect(result.usedDefaults).toBe(true)
  })

  /**
   * 属性 20.5：sse 传输必须有 url
   */
  it("Property 20.5: sse 传输必须有 url", () => {
    const invalidConfig = {
      servers: [
        {
          name: "test-server",
          transport: "sse",
          // 缺少 url
        },
      ],
    }

    const result = validateConfig(invalidConfig)

    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)
    expect(result.usedDefaults).toBe(true)
  })

  /**
   * 属性 20.6：服务器名称不能为空
   */
  it("Property 20.6: 服务器名称不能为空", () => {
    const invalidConfig = {
      servers: [
        {
          name: "",
          transport: "stdio",
          command: "node",
        },
      ],
    }

    const result = validateConfig(invalidConfig)

    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.usedDefaults).toBe(true)
  })

  /**
   * 属性 20.7：超时时间必须为正整数
   */
  it("Property 20.7: 超时时间必须为正整数", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 0 }),
        (timeout) => {
          const invalidConfig = {
            servers: [
              {
                name: "test-server",
                transport: "stdio",
                command: "node",
                timeout,
              },
            ],
          }

          const result = validateConfig(invalidConfig)

          expect(result.success).toBe(false)
          expect(result.usedDefaults).toBe(true)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * 属性 20.8：设置字段有默认值
   */
  it("Property 20.8: 设置字段有默认值", () => {
    const configWithoutSettings = {
      servers: [
        {
          name: "test-server",
          transport: "stdio",
          command: "node",
        },
      ],
    }

    const result = validateConfig(configWithoutSettings)

    expect(result.success).toBe(true)
    expect(result.config!.settings).toBeDefined()
    expect(result.config!.settings.defaultTimeout).toBe(DEFAULT_SETTINGS.defaultTimeout)
    expect(result.config!.settings.hotReload).toBe(DEFAULT_SETTINGS.hotReload)
    expect(result.config!.settings.reconnect).toEqual(DEFAULT_SETTINGS.reconnect)
  })
})

// ============================================================================
// Unit Tests: 无效配置处理
// ============================================================================

describe("Unit Tests: 无效配置记录错误并使用默认设置", () => {
  /**
   * 测试：无效 JSON 应该返回错误并使用默认配置
   */
  it("无效 JSON 返回错误并使用默认配置", () => {
    const invalidJson = "{ invalid json }"
    const result = loadConfigFromJson(invalidJson)

    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)
    expect(result.errors![0]).toContain("Invalid JSON")
    expect(result.config).toEqual(DEFAULT_CONFIG)
    expect(result.usedDefaults).toBe(true)
  })

  /**
   * 测试：无效传输类型应该返回错误
   */
  it("无效传输类型返回错误", () => {
    const invalidConfig = {
      servers: [
        {
          name: "test-server",
          transport: "invalid-transport",
          command: "node",
        },
      ],
    }

    const result = validateConfig(invalidConfig)

    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.usedDefaults).toBe(true)
  })

  /**
   * 测试：无效 URL 格式应该返回错误
   */
  it("无效 URL 格式返回错误", () => {
    const invalidConfig = {
      servers: [
        {
          name: "test-server",
          transport: "sse",
          url: "not-a-valid-url",
        },
      ],
    }

    const result = validateConfig(invalidConfig)

    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.usedDefaults).toBe(true)
  })

  /**
   * 测试：负数超时时间应该返回错误
   */
  it("负数超时时间返回错误", () => {
    const invalidConfig = {
      settings: {
        defaultTimeout: -1000,
      },
    }

    const result = validateConfig(invalidConfig)

    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.usedDefaults).toBe(true)
  })

  /**
   * 测试：非整数重试次数应该返回错误
   */
  it("非整数重试次数返回错误", () => {
    const invalidConfig = {
      settings: {
        reconnect: {
          maxAttempts: 2.5,
        },
      },
    }

    const result = validateConfig(invalidConfig)

    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.usedDefaults).toBe(true)
  })

  /**
   * 测试：null 配置应该使用默认值
   */
  it("null 配置使用默认值", () => {
    const result = validateConfig(null)

    expect(result.success).toBe(false)
    expect(result.config).toEqual(DEFAULT_CONFIG)
    expect(result.usedDefaults).toBe(true)
  })

  /**
   * 测试：undefined 配置应该使用默认值
   */
  it("undefined 配置使用默认值", () => {
    const result = validateConfig(undefined)

    expect(result.success).toBe(false)
    expect(result.config).toEqual(DEFAULT_CONFIG)
    expect(result.usedDefaults).toBe(true)
  })

  /**
   * 测试：数组类型配置应该返回错误
   */
  it("数组类型配置返回错误", () => {
    const result = validateConfig([])

    expect(result.success).toBe(false)
    expect(result.config).toEqual(DEFAULT_CONFIG)
    expect(result.usedDefaults).toBe(true)
  })

  /**
   * 测试：字符串类型配置应该返回错误
   */
  it("字符串类型配置返回错误", () => {
    const result = validateConfig("invalid")

    expect(result.success).toBe(false)
    expect(result.config).toEqual(DEFAULT_CONFIG)
    expect(result.usedDefaults).toBe(true)
  })
})

// ============================================================================
// Unit Tests: 环境变量替换
// ============================================================================

describe("Unit Tests: 环境变量替换", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  /**
   * 测试：环境变量应该被正确替换
   */
  it("环境变量被正确替换", () => {
    process.env.TEST_VAR = "test-value"
    process.env.ANOTHER_VAR = "another-value"

    const input = {
      key1: "${TEST_VAR}",
      key2: "prefix-${ANOTHER_VAR}-suffix",
      key3: "no-vars",
    }

    const result = replaceEnvVars(input)

    expect(result.key1).toBe("test-value")
    expect(result.key2).toBe("prefix-another-value-suffix")
    expect(result.key3).toBe("no-vars")
  })

  /**
   * 测试：不存在的环境变量应该被替换为空字符串
   */
  it("不存在的环境变量替换为空字符串", () => {
    const input = {
      key: "${NON_EXISTENT_VAR}",
    }

    const result = replaceEnvVars(input)

    expect(result.key).toBe("")
  })

  /**
   * 测试：多个环境变量应该都被替换
   */
  it("多个环境变量都被替换", () => {
    process.env.VAR1 = "value1"
    process.env.VAR2 = "value2"

    const input = {
      key: "${VAR1}-${VAR2}",
    }

    const result = replaceEnvVars(input)

    expect(result.key).toBe("value1-value2")
  })
})

// ============================================================================
// Unit Tests: 配置比较
// ============================================================================

describe("Unit Tests: 配置比较", () => {
  /**
   * 测试：相同配置应该没有变更
   */
  it("相同配置没有变更", () => {
    const config: McpConfigWithSettings = {
      servers: [
        { name: "server1", transport: "stdio", command: "node" },
      ],
      settings: DEFAULT_SETTINGS,
    }

    const changes = compareConfigs(config, config)

    expect(changes).toEqual([])
  })

  /**
   * 测试：添加服务器应该检测到 added 事件
   */
  it("添加服务器检测到 added 事件", () => {
    const oldConfig: McpConfigWithSettings = {
      servers: [],
      settings: DEFAULT_SETTINGS,
    }

    const newConfig: McpConfigWithSettings = {
      servers: [
        { name: "server1", transport: "stdio", command: "node" },
      ],
      settings: DEFAULT_SETTINGS,
    }

    const changes = compareConfigs(oldConfig, newConfig)

    expect(changes.length).toBe(1)
    expect(changes[0].type).toBe("added")
    expect(changes[0].serverName).toBe("server1")
    expect(changes[0].newConfig).toBeDefined()
    expect(changes[0].oldConfig).toBeUndefined()
  })

  /**
   * 测试：移除服务器应该检测到 removed 事件
   */
  it("移除服务器检测到 removed 事件", () => {
    const oldConfig: McpConfigWithSettings = {
      servers: [
        { name: "server1", transport: "stdio", command: "node" },
      ],
      settings: DEFAULT_SETTINGS,
    }

    const newConfig: McpConfigWithSettings = {
      servers: [],
      settings: DEFAULT_SETTINGS,
    }

    const changes = compareConfigs(oldConfig, newConfig)

    expect(changes.length).toBe(1)
    expect(changes[0].type).toBe("removed")
    expect(changes[0].serverName).toBe("server1")
    expect(changes[0].oldConfig).toBeDefined()
    expect(changes[0].newConfig).toBeUndefined()
  })

  /**
   * 测试：修改服务器应该检测到 modified 事件
   */
  it("修改服务器检测到 modified 事件", () => {
    const oldConfig: McpConfigWithSettings = {
      servers: [
        { name: "server1", transport: "stdio", command: "node" },
      ],
      settings: DEFAULT_SETTINGS,
    }

    const newConfig: McpConfigWithSettings = {
      servers: [
        { name: "server1", transport: "stdio", command: "python" },
      ],
      settings: DEFAULT_SETTINGS,
    }

    const changes = compareConfigs(oldConfig, newConfig)

    expect(changes.length).toBe(1)
    expect(changes[0].type).toBe("modified")
    expect(changes[0].serverName).toBe("server1")
    expect(changes[0].oldConfig).toBeDefined()
    expect(changes[0].newConfig).toBeDefined()
  })

  /**
   * 测试：复杂变更应该正确检测
   */
  it("复杂变更正确检测", () => {
    const oldConfig: McpConfigWithSettings = {
      servers: [
        { name: "server1", transport: "stdio", command: "node" },
        { name: "server2", transport: "stdio", command: "python" },
      ],
      settings: DEFAULT_SETTINGS,
    }

    const newConfig: McpConfigWithSettings = {
      servers: [
        { name: "server1", transport: "stdio", command: "deno" }, // modified
        { name: "server3", transport: "sse", url: "http://localhost:3000" }, // added
        // server2 removed
      ],
      settings: DEFAULT_SETTINGS,
    }

    const changes = compareConfigs(oldConfig, newConfig)

    expect(changes.length).toBe(3)

    const removed = changes.find((c) => c.type === "removed")
    const added = changes.find((c) => c.type === "added")
    const modified = changes.find((c) => c.type === "modified")

    expect(removed).toBeDefined()
    expect(removed!.serverName).toBe("server2")

    expect(added).toBeDefined()
    expect(added!.serverName).toBe("server3")

    expect(modified).toBeDefined()
    expect(modified!.serverName).toBe("server1")
  })
})

// ============================================================================
// Integration Tests: 文件加载
// ============================================================================

describe("Integration Tests: 配置文件加载", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  /**
   * 测试：从文件加载有效配置
   */
  it("从文件加载有效配置", async () => {
    const config = {
      servers: [
        { name: "test-server", transport: "stdio", command: "node" },
      ],
      settings: {
        defaultTimeout: 60000,
        hotReload: true,
        reconnect: {
          enabled: true,
          maxAttempts: 5,
          initialDelayMs: 2000,
          maxDelayMs: 30000,
          backoffMultiplier: 2,
        },
      },
    }

    const configPath = path.join(tempDir, "mcp.json")
    await fs.writeFile(configPath, JSON.stringify(config))

    const result = await loadMcpConfigFromFile(configPath)

    expect(result.success).toBe(true)
    expect(result.config!.servers.length).toBe(1)
    expect(result.config!.servers[0].name).toBe("test-server")
    expect(result.config!.settings.defaultTimeout).toBe(60000)
    expect(result.config!.settings.hotReload).toBe(true)
  })

  /**
   * 测试：文件不存在时返回默认配置
   */
  it("文件不存在时返回默认配置", async () => {
    const configPath = path.join(tempDir, "non-existent.json")

    const result = await loadMcpConfigFromFile(configPath)

    expect(result.success).toBe(true)
    expect(result.config).toEqual(DEFAULT_CONFIG)
    expect(result.usedDefaults).toBe(true)
  })

  /**
   * 测试：从工作目录加载配置
   */
  it("从工作目录加载配置", async () => {
    const naughtDir = path.join(tempDir, ".naught")
    await fs.mkdir(naughtDir, { recursive: true })

    const config = {
      servers: [
        { name: "test-server", transport: "stdio", command: "node" },
      ],
    }

    await fs.writeFile(path.join(naughtDir, "mcp.json"), JSON.stringify(config))

    const result = await loadMcpConfig(tempDir)

    expect(result.success).toBe(true)
    expect(result.config!.servers.length).toBe(1)
  })

  /**
   * 测试：工作目录没有配置文件时返回默认配置
   */
  it("工作目录没有配置文件时返回默认配置", async () => {
    const result = await loadMcpConfig(tempDir)

    expect(result.success).toBe(true)
    expect(result.config).toEqual(DEFAULT_CONFIG)
    expect(result.usedDefaults).toBe(true)
  })
})

// ============================================================================
// Property Tests: 配置比较属性
// ============================================================================

describe("Property Tests: 配置比较属性", () => {
  /**
   * 属性：添加的服务器数量 + 移除的服务器数量 + 修改的服务器数量 = 总变更数
   */
  it("变更数量等于各类型变更之和", () => {
    fc.assert(
      fc.property(
        fc.array(validServerArb, { maxLength: 5 }),
        fc.array(validServerArb, { maxLength: 5 }),
        (oldServers, newServers) => {
          // 确保名称唯一
          const oldNames = new Set<string>()
          const uniqueOldServers = oldServers.filter((s) => {
            if (oldNames.has(s.name)) return false
            oldNames.add(s.name)
            return true
          })

          const newNames = new Set<string>()
          const uniqueNewServers = newServers.filter((s) => {
            if (newNames.has(s.name)) return false
            newNames.add(s.name)
            return true
          })

          const oldConfig: McpConfigWithSettings = {
            servers: uniqueOldServers,
            settings: DEFAULT_SETTINGS,
          }

          const newConfig: McpConfigWithSettings = {
            servers: uniqueNewServers,
            settings: DEFAULT_SETTINGS,
          }

          const changes = compareConfigs(oldConfig, newConfig)

          const added = changes.filter((c) => c.type === "added").length
          const removed = changes.filter((c) => c.type === "removed").length
          const modified = changes.filter((c) => c.type === "modified").length

          return added + removed + modified === changes.length
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * 属性：比较相同配置应该没有变更
   */
  it("比较相同配置没有变更", () => {
    fc.assert(
      fc.property(
        fc.array(validServerArb, { maxLength: 5 }),
        (servers) => {
          // 确保名称唯一
          const names = new Set<string>()
          const uniqueServers = servers.filter((s) => {
            if (names.has(s.name)) return false
            names.add(s.name)
            return true
          })

          const config: McpConfigWithSettings = {
            servers: uniqueServers,
            settings: DEFAULT_SETTINGS,
          }

          const changes = compareConfigs(config, config)

          return changes.length === 0
        }
      ),
      { numRuns: 100 }
    )
  })
})
