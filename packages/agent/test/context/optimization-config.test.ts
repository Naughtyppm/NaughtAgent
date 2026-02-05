/**
 * OptimizationConfig 单元测试
 *
 * 测试优化配置管理器的核心功能：
 * - 创建配置管理器
 * - 获取默认配置
 * - 从文件加载配置
 * - 配置合并（部分覆盖）
 * - 配置验证
 * - 属性测试：任何部分配置合并后都应产生完整有效的配置
 *
 * 测试框架：vitest + fast-check
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fc from "fast-check"
import * as fs from "fs/promises"
import * as path from "path"
import {
  createOptimizationConfigManager,
  DEFAULT_OPTIMIZATION_CONFIG,
  isValidOptimizationConfig,
  isValidCompressionStrategy,
  type OptimizationConfig,
} from "../../src/context/optimization-config"
import { createTempDir, cleanupTempDir } from "../helpers/context"

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * 创建 .naught 目录和配置文件
 */
async function createConfigFile(
  dir: string,
  config: Record<string, unknown>
): Promise<string> {
  const naughtDir = path.join(dir, ".naught")
  await fs.mkdir(naughtDir, { recursive: true })
  const configPath = path.join(naughtDir, "config.json")
  await fs.writeFile(configPath, JSON.stringify(config, null, 2))
  return configPath
}

// ============================================================================
// 单元测试
// ============================================================================

describe("OptimizationConfig", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir("opt-config-test-")
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  describe("createOptimizationConfigManager", () => {
    it("should create config manager with required methods", () => {
      const manager = createOptimizationConfigManager()

      expect(manager).toBeDefined()
      expect(manager.load).toBeTypeOf("function")
      expect(manager.getDefaults).toBeTypeOf("function")
      expect(manager.merge).toBeTypeOf("function")
    })
  })

  describe("getDefaults", () => {
    it("should return default configuration", () => {
      const manager = createOptimizationConfigManager()
      const defaults = manager.getDefaults()

      expect(defaults).toEqual(DEFAULT_OPTIMIZATION_CONFIG)
    })

    it("should return a new object each time (not reference)", () => {
      const manager = createOptimizationConfigManager()
      const defaults1 = manager.getDefaults()
      const defaults2 = manager.getDefaults()

      expect(defaults1).toEqual(defaults2)
      expect(defaults1).not.toBe(defaults2)
    })

    it("should have all required sections", () => {
      const manager = createOptimizationConfigManager()
      const defaults = manager.getDefaults()

      expect(defaults.compression).toBeDefined()
      expect(defaults.truncation).toBeDefined()
      expect(defaults.contentCache).toBeDefined()
      expect(defaults.contextInjection).toBeDefined()
      expect(defaults.indexCache).toBeDefined()
    })

    it("should have valid default compression config", () => {
      const manager = createOptimizationConfigManager()
      const defaults = manager.getDefaults()

      expect(defaults.compression.enabled).toBe(true)
      expect(defaults.compression.threshold).toBe(80000)
      expect(defaults.compression.targetTokens).toBe(50000)
      expect(defaults.compression.strategy).toBe("importance")
      expect(defaults.compression.keepRecentCount).toBe(10)
    })

    it("should have valid default truncation config", () => {
      const manager = createOptimizationConfigManager()
      const defaults = manager.getDefaults()

      expect(defaults.truncation.enabled).toBe(true)
      expect(defaults.truncation.maxLength).toBe(10000)
      expect(defaults.truncation.headLength).toBe(4000)
      expect(defaults.truncation.tailLength).toBe(2000)
    })

    it("should have valid default contentCache config", () => {
      const manager = createOptimizationConfigManager()
      const defaults = manager.getDefaults()

      expect(defaults.contentCache.enabled).toBe(true)
    })

    it("should have valid default contextInjection config", () => {
      const manager = createOptimizationConfigManager()
      const defaults = manager.getDefaults()

      expect(defaults.contextInjection.enabled).toBe(true)
      expect(defaults.contextInjection.maxTokens).toBe(2000)
    })

    it("should have valid default indexCache config", () => {
      const manager = createOptimizationConfigManager()
      const defaults = manager.getDefaults()

      expect(defaults.indexCache.enabled).toBe(true)
      expect(defaults.indexCache.ttl).toBe(24 * 60 * 60 * 1000) // 24 hours
    })
  })

  describe("load", () => {
    it("should return default config when config file does not exist", async () => {
      const manager = createOptimizationConfigManager()
      const config = await manager.load(tempDir)

      expect(config).toEqual(DEFAULT_OPTIMIZATION_CONFIG)
    })

    it("should return default config when .naught directory does not exist", async () => {
      const manager = createOptimizationConfigManager()
      const config = await manager.load(tempDir)

      expect(config).toEqual(DEFAULT_OPTIMIZATION_CONFIG)
    })

    it("should load config from .naught/config.json", async () => {
      const manager = createOptimizationConfigManager()

      await createConfigFile(tempDir, {
        optimization: {
          compression: {
            threshold: 100000,
          },
        },
      })

      const config = await manager.load(tempDir)

      expect(config.compression.threshold).toBe(100000)
      // Other values should be defaults
      expect(config.compression.enabled).toBe(true)
      expect(config.compression.targetTokens).toBe(50000)
    })

    it("should load config directly from root level", async () => {
      const manager = createOptimizationConfigManager()

      await createConfigFile(tempDir, {
        compression: {
          threshold: 90000,
        },
      })

      const config = await manager.load(tempDir)

      expect(config.compression.threshold).toBe(90000)
    })

    it("should handle invalid JSON gracefully", async () => {
      const manager = createOptimizationConfigManager()

      const naughtDir = path.join(tempDir, ".naught")
      await fs.mkdir(naughtDir, { recursive: true })
      await fs.writeFile(path.join(naughtDir, "config.json"), "{ invalid json }")

      const config = await manager.load(tempDir)

      expect(config).toEqual(DEFAULT_OPTIMIZATION_CONFIG)
    })

    it("should merge partial compression config", async () => {
      const manager = createOptimizationConfigManager()

      await createConfigFile(tempDir, {
        compression: {
          enabled: false,
          strategy: "sliding_window",
        },
      })

      const config = await manager.load(tempDir)

      expect(config.compression.enabled).toBe(false)
      expect(config.compression.strategy).toBe("sliding_window")
      expect(config.compression.threshold).toBe(80000) // default
      expect(config.compression.targetTokens).toBe(50000) // default
      expect(config.compression.keepRecentCount).toBe(10) // default
    })

    it("should merge partial truncation config", async () => {
      const manager = createOptimizationConfigManager()

      await createConfigFile(tempDir, {
        truncation: {
          maxLength: 20000,
        },
      })

      const config = await manager.load(tempDir)

      expect(config.truncation.maxLength).toBe(20000)
      expect(config.truncation.enabled).toBe(true) // default
      expect(config.truncation.headLength).toBe(4000) // default
      expect(config.truncation.tailLength).toBe(2000) // default
    })

    it("should merge multiple sections", async () => {
      const manager = createOptimizationConfigManager()

      await createConfigFile(tempDir, {
        compression: {
          threshold: 60000,
        },
        truncation: {
          enabled: false,
        },
        contentCache: {
          enabled: false,
        },
      })

      const config = await manager.load(tempDir)

      expect(config.compression.threshold).toBe(60000)
      expect(config.truncation.enabled).toBe(false)
      expect(config.contentCache.enabled).toBe(false)
      // Unchanged sections should be defaults
      expect(config.contextInjection.enabled).toBe(true)
      expect(config.indexCache.enabled).toBe(true)
    })
  })

  describe("merge", () => {
    it("should return base config when override is empty", () => {
      const manager = createOptimizationConfigManager()
      const base = manager.getDefaults()
      const merged = manager.merge(base, {})

      expect(merged).toEqual(base)
    })

    it("should not mutate base config", () => {
      const manager = createOptimizationConfigManager()
      const base = manager.getDefaults()
      const originalThreshold = base.compression.threshold

      manager.merge(base, {
        compression: { threshold: 999999 },
      })

      expect(base.compression.threshold).toBe(originalThreshold)
    })

    it("should merge compression section", () => {
      const manager = createOptimizationConfigManager()
      const base = manager.getDefaults()

      const merged = manager.merge(base, {
        compression: {
          enabled: false,
          threshold: 50000,
        },
      })

      expect(merged.compression.enabled).toBe(false)
      expect(merged.compression.threshold).toBe(50000)
      expect(merged.compression.targetTokens).toBe(base.compression.targetTokens)
      expect(merged.compression.strategy).toBe(base.compression.strategy)
    })

    it("should merge truncation section", () => {
      const manager = createOptimizationConfigManager()
      const base = manager.getDefaults()

      const merged = manager.merge(base, {
        truncation: {
          maxLength: 5000,
          headLength: 2000,
        },
      })

      expect(merged.truncation.maxLength).toBe(5000)
      expect(merged.truncation.headLength).toBe(2000)
      expect(merged.truncation.tailLength).toBe(base.truncation.tailLength)
    })

    it("should merge contentCache section", () => {
      const manager = createOptimizationConfigManager()
      const base = manager.getDefaults()

      const merged = manager.merge(base, {
        contentCache: { enabled: false },
      })

      expect(merged.contentCache.enabled).toBe(false)
    })

    it("should merge contextInjection section", () => {
      const manager = createOptimizationConfigManager()
      const base = manager.getDefaults()

      const merged = manager.merge(base, {
        contextInjection: {
          enabled: false,
          maxTokens: 5000,
        },
      })

      expect(merged.contextInjection.enabled).toBe(false)
      expect(merged.contextInjection.maxTokens).toBe(5000)
    })

    it("should merge indexCache section", () => {
      const manager = createOptimizationConfigManager()
      const base = manager.getDefaults()

      const merged = manager.merge(base, {
        indexCache: {
          ttl: 12 * 60 * 60 * 1000, // 12 hours
        },
      })

      expect(merged.indexCache.ttl).toBe(12 * 60 * 60 * 1000)
      expect(merged.indexCache.enabled).toBe(base.indexCache.enabled)
    })

    it("should handle undefined values in override", () => {
      const manager = createOptimizationConfigManager()
      const base = manager.getDefaults()

      const merged = manager.merge(base, {
        compression: {
          enabled: undefined,
          threshold: 70000,
        },
      })

      expect(merged.compression.enabled).toBe(base.compression.enabled)
      expect(merged.compression.threshold).toBe(70000)
    })
  })

  describe("isValidCompressionStrategy", () => {
    it("should return true for valid strategies", () => {
      expect(isValidCompressionStrategy("sliding_window")).toBe(true)
      expect(isValidCompressionStrategy("importance")).toBe(true)
      expect(isValidCompressionStrategy("summary")).toBe(true)
    })

    it("should return false for invalid strategies", () => {
      expect(isValidCompressionStrategy("invalid")).toBe(false)
      expect(isValidCompressionStrategy("")).toBe(false)
      expect(isValidCompressionStrategy("IMPORTANCE")).toBe(false)
    })
  })

  describe("isValidOptimizationConfig", () => {
    it("should return true for valid config", () => {
      const config = DEFAULT_OPTIMIZATION_CONFIG
      expect(isValidOptimizationConfig(config)).toBe(true)
    })

    it("should return false for null", () => {
      expect(isValidOptimizationConfig(null)).toBe(false)
    })

    it("should return false for undefined", () => {
      expect(isValidOptimizationConfig(undefined)).toBe(false)
    })

    it("should return false for non-object", () => {
      expect(isValidOptimizationConfig("string")).toBe(false)
      expect(isValidOptimizationConfig(123)).toBe(false)
      expect(isValidOptimizationConfig([])).toBe(false)
    })

    it("should return false for missing sections", () => {
      expect(isValidOptimizationConfig({})).toBe(false)
      expect(isValidOptimizationConfig({ compression: {} })).toBe(false)
    })

    it("should return false for invalid compression config", () => {
      const config = {
        ...DEFAULT_OPTIMIZATION_CONFIG,
        compression: {
          ...DEFAULT_OPTIMIZATION_CONFIG.compression,
          enabled: "true", // should be boolean
        },
      }
      expect(isValidOptimizationConfig(config)).toBe(false)
    })

    it("should return false for invalid compression strategy", () => {
      const config = {
        ...DEFAULT_OPTIMIZATION_CONFIG,
        compression: {
          ...DEFAULT_OPTIMIZATION_CONFIG.compression,
          strategy: "invalid_strategy",
        },
      }
      expect(isValidOptimizationConfig(config)).toBe(false)
    })

    it("should return false for invalid truncation config", () => {
      const config = {
        ...DEFAULT_OPTIMIZATION_CONFIG,
        truncation: {
          ...DEFAULT_OPTIMIZATION_CONFIG.truncation,
          maxLength: "10000", // should be number
        },
      }
      expect(isValidOptimizationConfig(config)).toBe(false)
    })

    it("should return false for invalid contentCache config", () => {
      const config = {
        ...DEFAULT_OPTIMIZATION_CONFIG,
        contentCache: {
          enabled: 1, // should be boolean
        },
      }
      expect(isValidOptimizationConfig(config)).toBe(false)
    })

    it("should return false for invalid contextInjection config", () => {
      const config = {
        ...DEFAULT_OPTIMIZATION_CONFIG,
        contextInjection: {
          enabled: true,
          maxTokens: "2000", // should be number
        },
      }
      expect(isValidOptimizationConfig(config)).toBe(false)
    })

    it("should return false for invalid indexCache config", () => {
      const config = {
        ...DEFAULT_OPTIMIZATION_CONFIG,
        indexCache: {
          enabled: true,
          ttl: "86400000", // should be number
        },
      }
      expect(isValidOptimizationConfig(config)).toBe(false)
    })
  })
})


// ============================================================================
// 属性测试
// ============================================================================

// ============================================================================
// 属性 18: 默认配置值
// ============================================================================

// 功能: context-token-optimization, 属性 18: 默认配置值
// 验证: 需求 7.5
describe("属性 18: 默认配置值", () => {
  /**
   * **Validates: Requirements 7.5**
   *
   * 对于任何缺失或部分配置，系统应对所有未指定设置使用定义的默认值，
   * 且结果配置应有效且完整。
   */

  // ============================================================================
  // Arbitrary Generators
  // ============================================================================

  /**
   * 压缩策略生成器
   */
  const compressionStrategyArb = fc.constantFrom(
    "sliding_window" as const,
    "importance" as const,
    "summary" as const
  )

  /**
   * 部分压缩配置生成器
   */
  const partialCompressionArb = fc.record(
    {
      enabled: fc.boolean(),
      threshold: fc.integer({ min: 1000, max: 200000 }),
      targetTokens: fc.integer({ min: 1000, max: 100000 }),
      strategy: compressionStrategyArb,
      keepRecentCount: fc.integer({ min: 1, max: 100 }),
    },
    { requiredKeys: [] }
  )

  /**
   * 部分截断配置生成器
   */
  const partialTruncationArb = fc.record(
    {
      enabled: fc.boolean(),
      maxLength: fc.integer({ min: 100, max: 100000 }),
      headLength: fc.integer({ min: 100, max: 50000 }),
      tailLength: fc.integer({ min: 100, max: 50000 }),
    },
    { requiredKeys: [] }
  )

  /**
   * 部分内容缓存配置生成器
   */
  const partialContentCacheArb = fc.record(
    {
      enabled: fc.boolean(),
    },
    { requiredKeys: [] }
  )

  /**
   * 部分上下文注入配置生成器
   */
  const partialContextInjectionArb = fc.record(
    {
      enabled: fc.boolean(),
      maxTokens: fc.integer({ min: 100, max: 10000 }),
    },
    { requiredKeys: [] }
  )

  /**
   * 部分索引缓存配置生成器
   */
  const partialIndexCacheArb = fc.record(
    {
      enabled: fc.boolean(),
      ttl: fc.integer({ min: 1000, max: 7 * 24 * 60 * 60 * 1000 }), // 1s to 7 days
    },
    { requiredKeys: [] }
  )

  /**
   * 部分优化配置生成器
   */
  const partialOptimizationConfigArb = fc.record(
    {
      compression: partialCompressionArb,
      truncation: partialTruncationArb,
      contentCache: partialContentCacheArb,
      contextInjection: partialContextInjectionArb,
      indexCache: partialIndexCacheArb,
    },
    { requiredKeys: [] }
  )

  it("任何部分配置合并后都应产生完整有效的配置", () => {
    fc.assert(
      fc.property(partialOptimizationConfigArb, (partialConfig) => {
        const manager = createOptimizationConfigManager()
        const base = manager.getDefaults()
        const merged = manager.merge(base, partialConfig)

        // 断言：合并后的配置应该是有效的
        expect(isValidOptimizationConfig(merged)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("空配置合并后应等于默认配置", () => {
    fc.assert(
      fc.property(fc.constant({}), () => {
        const manager = createOptimizationConfigManager()
        const base = manager.getDefaults()
        const merged = manager.merge(base, {})

        expect(merged).toEqual(DEFAULT_OPTIMIZATION_CONFIG)
        expect(isValidOptimizationConfig(merged)).toBe(true)
      }),
      { numRuns: 10 }
    )
  })

  it("只有 compression 部分配置时，其他部分应使用默认值", () => {
    fc.assert(
      fc.property(partialCompressionArb, (partialCompression) => {
        const manager = createOptimizationConfigManager()
        const base = manager.getDefaults()
        const merged = manager.merge(base, { compression: partialCompression })

        // 断言：其他部分应该是默认值
        expect(merged.truncation).toEqual(DEFAULT_OPTIMIZATION_CONFIG.truncation)
        expect(merged.contentCache).toEqual(DEFAULT_OPTIMIZATION_CONFIG.contentCache)
        expect(merged.contextInjection).toEqual(DEFAULT_OPTIMIZATION_CONFIG.contextInjection)
        expect(merged.indexCache).toEqual(DEFAULT_OPTIMIZATION_CONFIG.indexCache)

        // 断言：配置应该有效
        expect(isValidOptimizationConfig(merged)).toBe(true)
      }),
      { numRuns: 50 }
    )
  })

  it("只有 truncation 部分配置时，其他部分应使用默认值", () => {
    fc.assert(
      fc.property(partialTruncationArb, (partialTruncation) => {
        const manager = createOptimizationConfigManager()
        const base = manager.getDefaults()
        const merged = manager.merge(base, { truncation: partialTruncation })

        // 断言：其他部分应该是默认值
        expect(merged.compression).toEqual(DEFAULT_OPTIMIZATION_CONFIG.compression)
        expect(merged.contentCache).toEqual(DEFAULT_OPTIMIZATION_CONFIG.contentCache)
        expect(merged.contextInjection).toEqual(DEFAULT_OPTIMIZATION_CONFIG.contextInjection)
        expect(merged.indexCache).toEqual(DEFAULT_OPTIMIZATION_CONFIG.indexCache)

        // 断言：配置应该有效
        expect(isValidOptimizationConfig(merged)).toBe(true)
      }),
      { numRuns: 50 }
    )
  })

  it("部分配置中指定的值应覆盖默认值", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10000, max: 200000 }),
        fc.integer({ min: 100, max: 50000 }),
        (threshold, maxLength) => {
          const manager = createOptimizationConfigManager()
          const base = manager.getDefaults()
          const merged = manager.merge(base, {
            compression: { threshold },
            truncation: { maxLength },
          })

          // 断言：指定的值应该被使用
          expect(merged.compression.threshold).toBe(threshold)
          expect(merged.truncation.maxLength).toBe(maxLength)

          // 断言：未指定的值应该是默认值
          expect(merged.compression.enabled).toBe(DEFAULT_OPTIMIZATION_CONFIG.compression.enabled)
          expect(merged.compression.targetTokens).toBe(
            DEFAULT_OPTIMIZATION_CONFIG.compression.targetTokens
          )
          expect(merged.truncation.enabled).toBe(DEFAULT_OPTIMIZATION_CONFIG.truncation.enabled)
          expect(merged.truncation.headLength).toBe(DEFAULT_OPTIMIZATION_CONFIG.truncation.headLength)

          // 断言：配置应该有效
          expect(isValidOptimizationConfig(merged)).toBe(true)
        }
      ),
      { numRuns: 50 }
    )
  })

  it("合并后的配置应包含所有必需字段", () => {
    fc.assert(
      fc.property(partialOptimizationConfigArb, (partialConfig) => {
        const manager = createOptimizationConfigManager()
        const base = manager.getDefaults()
        const merged = manager.merge(base, partialConfig)

        // 断言：所有顶级字段都存在
        expect(merged.compression).toBeDefined()
        expect(merged.truncation).toBeDefined()
        expect(merged.contentCache).toBeDefined()
        expect(merged.contextInjection).toBeDefined()
        expect(merged.indexCache).toBeDefined()

        // 断言：compression 所有字段都存在
        expect(typeof merged.compression.enabled).toBe("boolean")
        expect(typeof merged.compression.threshold).toBe("number")
        expect(typeof merged.compression.targetTokens).toBe("number")
        expect(typeof merged.compression.strategy).toBe("string")
        expect(typeof merged.compression.keepRecentCount).toBe("number")

        // 断言：truncation 所有字段都存在
        expect(typeof merged.truncation.enabled).toBe("boolean")
        expect(typeof merged.truncation.maxLength).toBe("number")
        expect(typeof merged.truncation.headLength).toBe("number")
        expect(typeof merged.truncation.tailLength).toBe("number")

        // 断言：contentCache 所有字段都存在
        expect(typeof merged.contentCache.enabled).toBe("boolean")

        // 断言：contextInjection 所有字段都存在
        expect(typeof merged.contextInjection.enabled).toBe("boolean")
        expect(typeof merged.contextInjection.maxTokens).toBe("number")

        // 断言：indexCache 所有字段都存在
        expect(typeof merged.indexCache.enabled).toBe("boolean")
        expect(typeof merged.indexCache.ttl).toBe("number")
      }),
      { numRuns: 100 }
    )
  })

  it("合并操作应该是幂等的（多次合并相同配置结果相同）", () => {
    fc.assert(
      fc.property(partialOptimizationConfigArb, (partialConfig) => {
        const manager = createOptimizationConfigManager()
        const base = manager.getDefaults()

        const merged1 = manager.merge(base, partialConfig)
        const merged2 = manager.merge(base, partialConfig)

        expect(merged1).toEqual(merged2)
      }),
      { numRuns: 50 }
    )
  })

  it("合并不应修改原始基础配置", () => {
    fc.assert(
      fc.property(partialOptimizationConfigArb, (partialConfig) => {
        const manager = createOptimizationConfigManager()
        const base = manager.getDefaults()
        const baseCopy = JSON.parse(JSON.stringify(base))

        manager.merge(base, partialConfig)

        // 断言：原始配置未被修改
        expect(base).toEqual(baseCopy)
      }),
      { numRuns: 50 }
    )
  })

  it("压缩策略应该是有效的枚举值", () => {
    fc.assert(
      fc.property(partialOptimizationConfigArb, (partialConfig) => {
        const manager = createOptimizationConfigManager()
        const base = manager.getDefaults()
        const merged = manager.merge(base, partialConfig)

        // 断言：策略应该是有效值
        expect(isValidCompressionStrategy(merged.compression.strategy)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})
