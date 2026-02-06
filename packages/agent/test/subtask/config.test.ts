/**
 * SubAgent 配置管理模块测试
 *
 * 测试配置加载、验证和环境变量覆盖功能
 *
 * @module test/subtask/config
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "node:fs"
import * as path from "node:path"
import {
  DEFAULT_CONFIG as DEFAULT_SUBAGENT_CONFIG,
  DEFAULT_RETRY_SETTINGS,
  FROZEN_DEFAULT_CONFIG as FROZEN_DEFAULT_SUBAGENT_CONFIG,
  ENV_VAR_NAMES as SUBAGENT_ENV_VAR_NAMES,
  CONFIG_FILE_NAME as SUBAGENT_CONFIG_FILE_NAME,
  ConfigLoadError,
  mergeConfig as mergeSubAgentConfig,
  freezeConfig as freezeSubAgentConfig,
  validateConfig as validateSubAgentConfig,
  loadConfigFromEnv as loadSubAgentConfigFromEnv,
  loadConfigFromFile as loadSubAgentConfigFromFile,
  loadConfig as loadSubAgentConfig,
  createConfigManager as createSubAgentConfigManager,
  getConfigManager as getSubAgentConfigManager,
  resetConfigManager as resetSubAgentConfigManager,
  type SubAgentConfig,
  type ConfigValidationError,
} from "../../src/subtask/config"

// ============================================================================
// Test Fixtures
// ============================================================================

const VALID_CONFIG: SubAgentConfig = {
  defaultTimeout: 300000,
  maxConcurrency: 5,
  retry: {
    maxAttempts: 5,
    initialDelay: 2000,
    maxDelay: 20000,
    backoffMultiplier: 3,
  },
  defaultModel: "claude-sonnet",
  customAgentsDir: ".custom/agents",
}

// ============================================================================
// Default Configuration Tests
// ============================================================================

describe("Default Configuration", () => {
  it("should have sensible default values", () => {
    expect(DEFAULT_SUBAGENT_CONFIG.defaultTimeout).toBe(180000) // 3 分钟
    expect(DEFAULT_SUBAGENT_CONFIG.maxConcurrency).toBe(3)
    expect(DEFAULT_SUBAGENT_CONFIG.customAgentsDir).toBe(".naughty/agents")
  })

  it("should have valid retry settings", () => {
    expect(DEFAULT_RETRY_SETTINGS.maxAttempts).toBe(3)
    expect(DEFAULT_RETRY_SETTINGS.initialDelay).toBe(1000)
    expect(DEFAULT_RETRY_SETTINGS.maxDelay).toBe(10000)
    expect(DEFAULT_RETRY_SETTINGS.backoffMultiplier).toBe(2)
  })

  it("should have frozen default config", () => {
    expect(Object.isFrozen(FROZEN_DEFAULT_SUBAGENT_CONFIG)).toBe(true)
    expect(() => {
      // @ts-expect-error - 测试冻结对象
      FROZEN_DEFAULT_SUBAGENT_CONFIG.defaultTimeout = 999
    }).toThrow()
  })
})

// ============================================================================
// mergeConfig Tests
// ============================================================================

describe("mergeSubAgentConfig", () => {
  it("should return default config when given empty object", () => {
    const result = mergeSubAgentConfig({})
    expect(result).toEqual(DEFAULT_SUBAGENT_CONFIG)
  })

  it("should override specific fields", () => {
    const result = mergeSubAgentConfig({ defaultTimeout: 300000 })
    expect(result.defaultTimeout).toBe(300000)
    expect(result.maxConcurrency).toBe(DEFAULT_SUBAGENT_CONFIG.maxConcurrency)
  })

  it("should merge retry settings partially", () => {
    const result = mergeSubAgentConfig({
      retry: { maxAttempts: 5 } as any,
    })
    expect(result.retry.maxAttempts).toBe(5)
    expect(result.retry.initialDelay).toBe(DEFAULT_RETRY_SETTINGS.initialDelay)
  })

  it("should handle complete config override", () => {
    const result = mergeSubAgentConfig(VALID_CONFIG)
    expect(result).toEqual(VALID_CONFIG)
  })
})

// ============================================================================
// freezeConfig Tests
// ============================================================================

describe("freezeSubAgentConfig", () => {
  it("should freeze top-level object", () => {
    const config = { a: 1, b: 2 }
    const frozen = freezeSubAgentConfig(config)
    expect(Object.isFrozen(frozen)).toBe(true)
  })

  it("should freeze nested objects", () => {
    const config = { outer: { inner: { value: 1 } } }
    const frozen = freezeSubAgentConfig(config)
    expect(Object.isFrozen(frozen.outer)).toBe(true)
    expect(Object.isFrozen(frozen.outer.inner)).toBe(true)
  })
})


// ============================================================================
// validateConfig Tests
// ============================================================================

describe("validateSubAgentConfig", () => {
  describe("valid configurations", () => {
    it("should accept empty config", () => {
      const result = validateSubAgentConfig({})
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("should accept valid complete config", () => {
      const result = validateSubAgentConfig(VALID_CONFIG)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("should accept valid partial config", () => {
      const result = validateSubAgentConfig({
        defaultTimeout: 60000,
        maxConcurrency: 2,
      })
      expect(result.valid).toBe(true)
    })
  })

  describe("defaultTimeout validation", () => {
    it("should reject non-number defaultTimeout", () => {
      const result = validateSubAgentConfig({ defaultTimeout: "invalid" as any })
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: "defaultTimeout", message: "必须是数字类型" })
      )
    })

    it("should reject zero defaultTimeout", () => {
      const result = validateSubAgentConfig({ defaultTimeout: 0 })
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: "defaultTimeout", message: "必须是正数" })
      )
    })

    it("should reject negative defaultTimeout", () => {
      const result = validateSubAgentConfig({ defaultTimeout: -1000 })
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: "defaultTimeout", message: "必须是正数" })
      )
    })
  })

  describe("maxConcurrency validation", () => {
    it("should reject non-number maxConcurrency", () => {
      const result = validateSubAgentConfig({ maxConcurrency: "5" as any })
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: "maxConcurrency", message: "必须是数字类型" })
      )
    })

    it("should reject non-integer maxConcurrency", () => {
      const result = validateSubAgentConfig({ maxConcurrency: 3.5 })
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: "maxConcurrency", message: "必须是正整数" })
      )
    })

    it("should reject zero maxConcurrency", () => {
      const result = validateSubAgentConfig({ maxConcurrency: 0 })
      expect(result.valid).toBe(false)
    })

    it("should reject negative maxConcurrency", () => {
      const result = validateSubAgentConfig({ maxConcurrency: -1 })
      expect(result.valid).toBe(false)
    })
  })

  describe("retry validation", () => {
    it("should reject non-object retry", () => {
      const result = validateSubAgentConfig({ retry: "invalid" as any })
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: "retry", message: "必须是对象类型" })
      )
    })

    it("should reject invalid retry.maxAttempts", () => {
      const result = validateSubAgentConfig({ retry: { maxAttempts: 0 } as any })
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: "retry.maxAttempts", message: "必须是正整数" })
      )
    })

    it("should reject negative retry.initialDelay", () => {
      const result = validateSubAgentConfig({ retry: { initialDelay: -100 } as any })
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: "retry.initialDelay", message: "不能为负数" })
      )
    })

    it("should reject negative retry.maxDelay", () => {
      const result = validateSubAgentConfig({ retry: { maxDelay: -100 } as any })
      expect(result.valid).toBe(false)
    })

    it("should reject backoffMultiplier less than 1", () => {
      const result = validateSubAgentConfig({ retry: { backoffMultiplier: 0.5 } as any })
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: "retry.backoffMultiplier", message: "必须大于等于 1" })
      )
    })

    it("should reject initialDelay greater than maxDelay", () => {
      const result = validateSubAgentConfig({
        retry: { initialDelay: 10000, maxDelay: 5000 } as any,
      })
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: "retry.initialDelay", message: "初始延迟不能大于最大延迟" })
      )
    })
  })

  describe("defaultModel validation", () => {
    it("should reject non-string defaultModel", () => {
      const result = validateSubAgentConfig({ defaultModel: 123 as any })
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: "defaultModel", message: "必须是字符串类型" })
      )
    })

    it("should reject empty string defaultModel", () => {
      const result = validateSubAgentConfig({ defaultModel: "" })
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: "defaultModel", message: "不能为空字符串" })
      )
    })

    it("should reject whitespace-only defaultModel", () => {
      const result = validateSubAgentConfig({ defaultModel: "   " })
      expect(result.valid).toBe(false)
    })
  })

  describe("customAgentsDir validation", () => {
    it("should reject non-string customAgentsDir", () => {
      const result = validateSubAgentConfig({ customAgentsDir: 123 as any })
      expect(result.valid).toBe(false)
    })

    it("should reject empty string customAgentsDir", () => {
      const result = validateSubAgentConfig({ customAgentsDir: "" })
      expect(result.valid).toBe(false)
    })
  })

  describe("multiple errors", () => {
    it("should collect all validation errors", () => {
      const result = validateSubAgentConfig({
        defaultTimeout: -1,
        maxConcurrency: 0,
        defaultModel: "",
      })
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThanOrEqual(3)
    })
  })
})


// ============================================================================
// loadConfigFromEnv Tests
// ============================================================================

describe("loadSubAgentConfigFromEnv", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // 清除所有相关环境变量
    Object.values(SUBAGENT_ENV_VAR_NAMES).forEach((name) => {
      delete process.env[name]
    })
  })

  afterEach(() => {
    // 恢复原始环境变量
    Object.values(SUBAGENT_ENV_VAR_NAMES).forEach((name) => {
      delete process.env[name]
    })
    Object.assign(process.env, originalEnv)
  })

  it("should return empty object when no env vars set", () => {
    const result = loadSubAgentConfigFromEnv()
    expect(result).toEqual({})
  })

  it("should parse NAUGHTY_SUBAGENT_TIMEOUT", () => {
    process.env[SUBAGENT_ENV_VAR_NAMES.defaultTimeout] = "300000"
    const result = loadSubAgentConfigFromEnv()
    expect(result.defaultTimeout).toBe(300000)
  })

  it("should parse NAUGHTY_SUBAGENT_MAX_CONCURRENCY", () => {
    process.env[SUBAGENT_ENV_VAR_NAMES.maxConcurrency] = "5"
    const result = loadSubAgentConfigFromEnv()
    expect(result.maxConcurrency).toBe(5)
  })

  it("should parse NAUGHTY_SUBAGENT_DEFAULT_MODEL", () => {
    process.env[SUBAGENT_ENV_VAR_NAMES.defaultModel] = "claude-opus"
    const result = loadSubAgentConfigFromEnv()
    expect(result.defaultModel).toBe("claude-opus")
  })

  it("should parse NAUGHTY_SUBAGENT_CUSTOM_AGENTS_DIR", () => {
    process.env[SUBAGENT_ENV_VAR_NAMES.customAgentsDir] = ".custom/agents"
    const result = loadSubAgentConfigFromEnv()
    expect(result.customAgentsDir).toBe(".custom/agents")
  })

  it("should parse retry settings from env vars", () => {
    process.env[SUBAGENT_ENV_VAR_NAMES.retryMaxAttempts] = "5"
    process.env[SUBAGENT_ENV_VAR_NAMES.retryInitialDelay] = "2000"
    process.env[SUBAGENT_ENV_VAR_NAMES.retryMaxDelay] = "20000"
    process.env[SUBAGENT_ENV_VAR_NAMES.retryBackoffMultiplier] = "3"

    const result = loadSubAgentConfigFromEnv()
    expect(result.retry).toBeDefined()
    expect(result.retry?.maxAttempts).toBe(5)
    expect(result.retry?.initialDelay).toBe(2000)
    expect(result.retry?.maxDelay).toBe(20000)
    expect(result.retry?.backoffMultiplier).toBe(3)
  })

  it("should ignore invalid number values", () => {
    process.env[SUBAGENT_ENV_VAR_NAMES.defaultTimeout] = "not-a-number"
    const result = loadSubAgentConfigFromEnv()
    expect(result.defaultTimeout).toBeUndefined()
  })

  it("should ignore empty string values", () => {
    process.env[SUBAGENT_ENV_VAR_NAMES.defaultModel] = ""
    const result = loadSubAgentConfigFromEnv()
    expect(result.defaultModel).toBeUndefined()
  })

  it("should parse multiple env vars together", () => {
    process.env[SUBAGENT_ENV_VAR_NAMES.defaultTimeout] = "120000"
    process.env[SUBAGENT_ENV_VAR_NAMES.maxConcurrency] = "10"
    process.env[SUBAGENT_ENV_VAR_NAMES.defaultModel] = "claude-haiku"

    const result = loadSubAgentConfigFromEnv()
    expect(result.defaultTimeout).toBe(120000)
    expect(result.maxConcurrency).toBe(10)
    expect(result.defaultModel).toBe("claude-haiku")
  })
})

// ============================================================================
// loadConfigFromFile Tests
// ============================================================================

describe("loadSubAgentConfigFromFile", () => {
  const testDir = path.join(process.cwd(), "test-config-temp")
  const configDir = path.join(testDir, ".naughty")
  const configPath = path.join(configDir, "config.json")

  beforeEach(() => {
    // 创建测试目录
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
  })

  afterEach(() => {
    // 清理测试目录
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  it("should return empty object when config file does not exist", async () => {
    const result = await loadSubAgentConfigFromFile(testDir + "-nonexistent")
    expect(result).toEqual({})
  })

  it("should load config from subagent key", async () => {
    const config = {
      subagent: {
        defaultTimeout: 300000,
        maxConcurrency: 5,
      },
    }
    fs.writeFileSync(configPath, JSON.stringify(config))

    const result = await loadSubAgentConfigFromFile(testDir)
    expect(result.defaultTimeout).toBe(300000)
    expect(result.maxConcurrency).toBe(5)
  })

  it("should load config from root level", async () => {
    const config = {
      defaultTimeout: 240000,
      maxConcurrency: 4,
    }
    fs.writeFileSync(configPath, JSON.stringify(config))

    const result = await loadSubAgentConfigFromFile(testDir)
    expect(result.defaultTimeout).toBe(240000)
    expect(result.maxConcurrency).toBe(4)
  })

  it("should throw ConfigLoadError for invalid JSON", async () => {
    fs.writeFileSync(configPath, "{ invalid json }")

    await expect(loadSubAgentConfigFromFile(testDir)).rejects.toThrow(ConfigLoadError)
  })

  it("should load complete config with retry settings", async () => {
    const config = {
      subagent: {
        defaultTimeout: 300000,
        maxConcurrency: 5,
        retry: {
          maxAttempts: 5,
          initialDelay: 2000,
          maxDelay: 20000,
          backoffMultiplier: 3,
        },
        defaultModel: "claude-sonnet",
        customAgentsDir: ".custom/agents",
      },
    }
    fs.writeFileSync(configPath, JSON.stringify(config))

    const result = await loadSubAgentConfigFromFile(testDir)
    expect(result).toEqual(config.subagent)
  })
})


// ============================================================================
// loadConfig Tests (Integration)
// ============================================================================

describe("loadSubAgentConfig", () => {
  const testDir = path.join(process.cwd(), "test-config-integration")
  const configDir = path.join(testDir, ".naughty")
  const configPath = path.join(configDir, "config.json")
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // 创建测试目录
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    // 清除环境变量
    Object.values(SUBAGENT_ENV_VAR_NAMES).forEach((name) => {
      delete process.env[name]
    })
  })

  afterEach(() => {
    // 清理测试目录
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
    // 恢复环境变量
    Object.values(SUBAGENT_ENV_VAR_NAMES).forEach((name) => {
      delete process.env[name]
    })
    Object.assign(process.env, originalEnv)
  })

  it("should return default config when no file or env vars", async () => {
    const result = await loadSubAgentConfig(testDir + "-empty")
    expect(result).toEqual(DEFAULT_SUBAGENT_CONFIG)
  })

  it("should merge file config with defaults", async () => {
    const config = {
      subagent: {
        defaultTimeout: 300000,
      },
    }
    fs.writeFileSync(configPath, JSON.stringify(config))

    const result = await loadSubAgentConfig(testDir)
    expect(result.defaultTimeout).toBe(300000)
    expect(result.maxConcurrency).toBe(DEFAULT_SUBAGENT_CONFIG.maxConcurrency)
    expect(result.retry).toEqual(DEFAULT_SUBAGENT_CONFIG.retry)
  })

  it("should override file config with env vars", async () => {
    const config = {
      subagent: {
        defaultTimeout: 300000,
        maxConcurrency: 5,
      },
    }
    fs.writeFileSync(configPath, JSON.stringify(config))
    process.env[SUBAGENT_ENV_VAR_NAMES.maxConcurrency] = "10"

    const result = await loadSubAgentConfig(testDir)
    expect(result.defaultTimeout).toBe(300000) // from file
    expect(result.maxConcurrency).toBe(10) // from env (overrides file)
  })

  it("should throw ConfigLoadError for invalid config values", async () => {
    const config = {
      subagent: {
        defaultTimeout: -1000, // invalid
      },
    }
    fs.writeFileSync(configPath, JSON.stringify(config))

    await expect(loadSubAgentConfig(testDir)).rejects.toThrow(ConfigLoadError)
  })

  it("should include validation errors in ConfigLoadError", async () => {
    const config = {
      subagent: {
        defaultTimeout: -1000,
        maxConcurrency: 0,
      },
    }
    fs.writeFileSync(configPath, JSON.stringify(config))

    try {
      await loadSubAgentConfig(testDir)
      expect.fail("Should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigLoadError)
      const configError = error as ConfigLoadError
      expect(configError.validationErrors).toBeDefined()
      expect(configError.validationErrors!.length).toBeGreaterThanOrEqual(2)
    }
  })

  it("should merge retry settings from file and env", async () => {
    const config = {
      subagent: {
        retry: {
          maxAttempts: 5,
          initialDelay: 2000,
        },
      },
    }
    fs.writeFileSync(configPath, JSON.stringify(config))
    process.env[SUBAGENT_ENV_VAR_NAMES.retryMaxDelay] = "30000"

    const result = await loadSubAgentConfig(testDir)
    expect(result.retry.maxAttempts).toBe(5) // from file
    expect(result.retry.initialDelay).toBe(2000) // from file
    expect(result.retry.maxDelay).toBe(30000) // from env
    expect(result.retry.backoffMultiplier).toBe(DEFAULT_RETRY_SETTINGS.backoffMultiplier) // default
  })
})

// ============================================================================
// ConfigManager Tests
// ============================================================================

describe("SubAgentConfigManager", () => {
  const testDir = path.join(process.cwd(), "test-config-manager")
  const configDir = path.join(testDir, ".naughty")
  const configPath = path.join(configDir, "config.json")

  beforeEach(() => {
    resetSubAgentConfigManager()
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
  })

  afterEach(() => {
    resetSubAgentConfigManager()
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe("createSubAgentConfigManager", () => {
    it("should create a new config manager", () => {
      const manager = createSubAgentConfigManager()
      expect(manager).toBeDefined()
      expect(manager.get).toBeDefined()
      expect(manager.load).toBeDefined()
      expect(manager.merge).toBeDefined()
    })

    it("should return default config before load", () => {
      const manager = createSubAgentConfigManager()
      const config = manager.get()
      expect(config).toEqual(DEFAULT_SUBAGENT_CONFIG)
    })

    it("should load config from file", async () => {
      const fileConfig = {
        subagent: {
          defaultTimeout: 300000,
        },
      }
      fs.writeFileSync(configPath, JSON.stringify(fileConfig))

      const manager = createSubAgentConfigManager()
      const config = await manager.load(testDir)
      expect(config.defaultTimeout).toBe(300000)
    })

    it("should update current config after load", async () => {
      const fileConfig = {
        subagent: {
          maxConcurrency: 10,
        },
      }
      fs.writeFileSync(configPath, JSON.stringify(fileConfig))

      const manager = createSubAgentConfigManager()
      await manager.load(testDir)
      const config = manager.get()
      expect(config.maxConcurrency).toBe(10)
    })

    it("should merge partial config", () => {
      const manager = createSubAgentConfigManager()
      const merged = manager.merge({ defaultTimeout: 600000 })
      expect(merged.defaultTimeout).toBe(600000)
      expect(merged.maxConcurrency).toBe(DEFAULT_SUBAGENT_CONFIG.maxConcurrency)
    })

    it("should merge nested retry config", () => {
      const manager = createSubAgentConfigManager()
      const merged = manager.merge({
        retry: { maxAttempts: 10 },
      })
      expect(merged.retry.maxAttempts).toBe(10)
      expect(merged.retry.initialDelay).toBe(DEFAULT_RETRY_SETTINGS.initialDelay)
    })
  })

  describe("getSubAgentConfigManager (singleton)", () => {
    it("should return the same instance", () => {
      const manager1 = getSubAgentConfigManager()
      const manager2 = getSubAgentConfigManager()
      expect(manager1).toBe(manager2)
    })

    it("should reset singleton with resetSubAgentConfigManager", () => {
      const manager1 = getSubAgentConfigManager()
      resetSubAgentConfigManager()
      const manager2 = getSubAgentConfigManager()
      expect(manager1).not.toBe(manager2)
    })
  })
})

// ============================================================================
// ENV_VAR_NAMES Tests
// ============================================================================

describe("SUBAGENT_ENV_VAR_NAMES", () => {
  it("should have correct environment variable names", () => {
    expect(SUBAGENT_ENV_VAR_NAMES.defaultTimeout).toBe("NAUGHTY_SUBAGENT_TIMEOUT")
    expect(SUBAGENT_ENV_VAR_NAMES.maxConcurrency).toBe("NAUGHTY_SUBAGENT_MAX_CONCURRENCY")
    expect(SUBAGENT_ENV_VAR_NAMES.retryMaxAttempts).toBe("NAUGHTY_SUBAGENT_RETRY_MAX_ATTEMPTS")
    expect(SUBAGENT_ENV_VAR_NAMES.retryInitialDelay).toBe("NAUGHTY_SUBAGENT_RETRY_INITIAL_DELAY")
    expect(SUBAGENT_ENV_VAR_NAMES.retryMaxDelay).toBe("NAUGHTY_SUBAGENT_RETRY_MAX_DELAY")
    expect(SUBAGENT_ENV_VAR_NAMES.retryBackoffMultiplier).toBe("NAUGHTY_SUBAGENT_RETRY_BACKOFF_MULTIPLIER")
    expect(SUBAGENT_ENV_VAR_NAMES.defaultModel).toBe("NAUGHTY_SUBAGENT_DEFAULT_MODEL")
    expect(SUBAGENT_ENV_VAR_NAMES.customAgentsDir).toBe("NAUGHTY_SUBAGENT_CUSTOM_AGENTS_DIR")
  })
})

// ============================================================================
// SUBAGENT_CONFIG_FILE_NAME Tests
// ============================================================================

describe("SUBAGENT_CONFIG_FILE_NAME", () => {
  it("should be .naughty/config.json", () => {
    expect(SUBAGENT_CONFIG_FILE_NAME).toBe(".naughty/config.json")
  })
})
