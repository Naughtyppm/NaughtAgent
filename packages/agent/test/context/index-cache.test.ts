/**
 * IndexCache 单元测试
 *
 * 测试索引缓存模块的核心功能：
 * - 缓存加载和保存
 * - 缓存有效性检查
 * - 带缓存逻辑的索引获取
 * - ProjectIndex 结构验证
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import {
  createIndexCache,
  createDefaultIndexCache,
  isValidProjectIndex,
  INDEX_VERSION,
  DEFAULT_TTL,
  type ProjectIndex,
  type IndexCache,
} from "../../src/context/index-cache"

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * 创建有效的 ProjectIndex 测试数据
 */
function createValidProjectIndex(overrides?: Partial<ProjectIndex>): ProjectIndex {
  return {
    version: INDEX_VERSION,
    updatedAt: Date.now(),
    hash: "a".repeat(64),
    root: "/test/project",
    structure: {
      tree: "├── src/\n│   └── index.ts\n└── package.json",
      keyFiles: ["package.json", "tsconfig.json"],
      techStack: {
        languages: ["TypeScript"],
        frameworks: ["Node.js"],
        packageManager: "pnpm",
        testFramework: "vitest",
        buildTool: "tsup",
      },
    },
    metadata: {
      generationTime: 100,
      fileCount: 10,
      dirCount: 3,
    },
    ...overrides,
  }
}

// ============================================================================
// isValidProjectIndex Tests
// ============================================================================

describe("isValidProjectIndex", () => {
  it("应该验证有效的 ProjectIndex", () => {
    const index = createValidProjectIndex()
    expect(isValidProjectIndex(index)).toBe(true)
  })

  it("应该拒绝 null", () => {
    expect(isValidProjectIndex(null)).toBe(false)
  })

  it("应该拒绝 undefined", () => {
    expect(isValidProjectIndex(undefined)).toBe(false)
  })

  it("应该拒绝非对象类型", () => {
    expect(isValidProjectIndex("string")).toBe(false)
    expect(isValidProjectIndex(123)).toBe(false)
    expect(isValidProjectIndex([])).toBe(false)
  })

  it("应该拒绝缺少 version 的对象", () => {
    const index = createValidProjectIndex()
    delete (index as Record<string, unknown>).version
    expect(isValidProjectIndex(index)).toBe(false)
  })

  it("应该拒绝缺少 updatedAt 的对象", () => {
    const index = createValidProjectIndex()
    delete (index as Record<string, unknown>).updatedAt
    expect(isValidProjectIndex(index)).toBe(false)
  })

  it("应该拒绝缺少 hash 的对象", () => {
    const index = createValidProjectIndex()
    delete (index as Record<string, unknown>).hash
    expect(isValidProjectIndex(index)).toBe(false)
  })

  it("应该拒绝缺少 root 的对象", () => {
    const index = createValidProjectIndex()
    delete (index as Record<string, unknown>).root
    expect(isValidProjectIndex(index)).toBe(false)
  })

  it("应该拒绝缺少 structure 的对象", () => {
    const index = createValidProjectIndex()
    delete (index as Record<string, unknown>).structure
    expect(isValidProjectIndex(index)).toBe(false)
  })

  it("应该拒绝缺少 metadata 的对象", () => {
    const index = createValidProjectIndex()
    delete (index as Record<string, unknown>).metadata
    expect(isValidProjectIndex(index)).toBe(false)
  })

  it("应该拒绝 structure.tree 不是字符串的对象", () => {
    const index = createValidProjectIndex()
    ;(index.structure as Record<string, unknown>).tree = 123
    expect(isValidProjectIndex(index)).toBe(false)
  })

  it("应该拒绝 structure.keyFiles 不是数组的对象", () => {
    const index = createValidProjectIndex()
    ;(index.structure as Record<string, unknown>).keyFiles = "not-array"
    expect(isValidProjectIndex(index)).toBe(false)
  })

  it("应该拒绝 structure.techStack 不是对象的对象", () => {
    const index = createValidProjectIndex()
    ;(index.structure as Record<string, unknown>).techStack = "not-object"
    expect(isValidProjectIndex(index)).toBe(false)
  })

  it("应该拒绝 techStack.languages 不是数组的对象", () => {
    const index = createValidProjectIndex()
    ;(index.structure.techStack as Record<string, unknown>).languages = "not-array"
    expect(isValidProjectIndex(index)).toBe(false)
  })

  it("应该拒绝 techStack.frameworks 不是数组的对象", () => {
    const index = createValidProjectIndex()
    ;(index.structure.techStack as Record<string, unknown>).frameworks = "not-array"
    expect(isValidProjectIndex(index)).toBe(false)
  })

  it("应该拒绝 metadata.generationTime 不是数字的对象", () => {
    const index = createValidProjectIndex()
    ;(index.metadata as Record<string, unknown>).generationTime = "not-number"
    expect(isValidProjectIndex(index)).toBe(false)
  })

  it("应该拒绝 metadata.fileCount 不是数字的对象", () => {
    const index = createValidProjectIndex()
    ;(index.metadata as Record<string, unknown>).fileCount = "not-number"
    expect(isValidProjectIndex(index)).toBe(false)
  })

  it("应该拒绝 metadata.dirCount 不是数字的对象", () => {
    const index = createValidProjectIndex()
    ;(index.metadata as Record<string, unknown>).dirCount = "not-number"
    expect(isValidProjectIndex(index)).toBe(false)
  })

  it("应该接受可选字段缺失的 techStack", () => {
    const index = createValidProjectIndex()
    delete index.structure.techStack.packageManager
    delete index.structure.techStack.testFramework
    delete index.structure.techStack.buildTool
    expect(isValidProjectIndex(index)).toBe(true)
  })
})


// ============================================================================
// IndexCache Integration Tests (with temp directory)
// ============================================================================

describe("IndexCache", () => {
  let tempDir: string
  let cacheDir: string
  let indexCache: IndexCache

  beforeEach(async () => {
    // 创建临时目录
    tempDir = path.join(process.cwd(), ".test-temp", `index-cache-${Date.now()}`)
    cacheDir = path.join(tempDir, ".naught", "cache")
    await fs.mkdir(cacheDir, { recursive: true })

    // 创建测试项目结构
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({
        name: "test-project",
        version: "1.0.0",
        dependencies: { typescript: "^5.0.0" },
        devDependencies: { vitest: "^1.0.0" },
      })
    )

    indexCache = createIndexCache({
      cacheDir,
      cacheFile: "project-index.json",
      ttl: DEFAULT_TTL,
    })
  })

  afterEach(async () => {
    // 清理临时目录
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {
      // 忽略清理错误
    }
  })

  describe("load()", () => {
    it("当缓存不存在时应该返回 null", async () => {
      const result = await indexCache.load()
      expect(result).toBeNull()
    })

    it("当缓存存在且有效时应该返回 ProjectIndex", async () => {
      const index = createValidProjectIndex({ root: tempDir })
      const cachePath = path.join(cacheDir, "project-index.json")
      await fs.writeFile(cachePath, JSON.stringify(index))

      const result = await indexCache.load()
      expect(result).not.toBeNull()
      expect(result?.version).toBe(INDEX_VERSION)
      expect(result?.root).toBe(tempDir)
    })

    it("当缓存文件损坏时应该返回 null", async () => {
      const cachePath = path.join(cacheDir, "project-index.json")
      await fs.writeFile(cachePath, "invalid json {{{")

      const result = await indexCache.load()
      expect(result).toBeNull()
    })

    it("当缓存结构无效时应该返回 null", async () => {
      const cachePath = path.join(cacheDir, "project-index.json")
      await fs.writeFile(cachePath, JSON.stringify({ invalid: "structure" }))

      const result = await indexCache.load()
      expect(result).toBeNull()
    })
  })

  describe("save()", () => {
    it("应该保存 ProjectIndex 到缓存文件", async () => {
      const index = createValidProjectIndex({ root: tempDir })
      await indexCache.save(index)

      const cachePath = path.join(cacheDir, "project-index.json")
      const content = await fs.readFile(cachePath, "utf-8")
      const saved = JSON.parse(content)

      expect(saved.version).toBe(INDEX_VERSION)
      expect(saved.root).toBe(tempDir)
    })

    it("应该自动创建缓存目录", async () => {
      // 删除缓存目录
      await fs.rm(cacheDir, { recursive: true, force: true })

      const index = createValidProjectIndex({ root: tempDir })
      await indexCache.save(index)

      const cachePath = path.join(cacheDir, "project-index.json")
      const exists = await fs
        .access(cachePath)
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(true)
    })
  })

  describe("clear()", () => {
    it("应该删除缓存文件", async () => {
      const index = createValidProjectIndex({ root: tempDir })
      await indexCache.save(index)

      await indexCache.clear()

      const cachePath = path.join(cacheDir, "project-index.json")
      const exists = await fs
        .access(cachePath)
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(false)
    })

    it("当缓存不存在时不应该抛出错误", async () => {
      await expect(indexCache.clear()).resolves.not.toThrow()
    })
  })

  describe("isValid()", () => {
    it("当版本不匹配时应该返回 false", async () => {
      const index = createValidProjectIndex({
        root: tempDir,
        version: "0.0.1",
      })

      const result = await indexCache.isValid(index)
      expect(result).toBe(false)
    })

    it("当 TTL 过期时应该返回 false", async () => {
      const expiredCache = createIndexCache({
        cacheDir,
        cacheFile: "project-index.json",
        ttl: 1, // 1ms TTL
      })

      const index = createValidProjectIndex({
        root: tempDir,
        updatedAt: Date.now() - 1000, // 1 秒前
      })

      const result = await expiredCache.isValid(index)
      expect(result).toBe(false)
    })

    it("当哈希匹配时应该返回 true", async () => {
      // 首先生成一个索引来获取正确的哈希
      const generated = await indexCache.getOrCreate(tempDir)

      // 使用相同的哈希创建测试索引
      const index = createValidProjectIndex({
        root: tempDir,
        hash: generated.hash,
        updatedAt: Date.now(),
      })

      const result = await indexCache.isValid(index)
      expect(result).toBe(true)
    })

    it("当哈希不匹配时应该返回 false", async () => {
      const index = createValidProjectIndex({
        root: tempDir,
        hash: "different-hash-" + "x".repeat(50),
        updatedAt: Date.now(),
      })

      const result = await indexCache.isValid(index)
      expect(result).toBe(false)
    })
  })

  describe("getOrCreate()", () => {
    it("当缓存不存在时应该生成新索引", async () => {
      const result = await indexCache.getOrCreate(tempDir)

      expect(result).not.toBeNull()
      expect(result.version).toBe(INDEX_VERSION)
      expect(result.root).toBe(tempDir)
      expect(result.hash).toBeTruthy()
      expect(result.structure.tree).toBeTruthy()
    })

    it("应该将生成的索引保存到缓存", async () => {
      await indexCache.getOrCreate(tempDir)

      const cachePath = path.join(cacheDir, "project-index.json")
      const exists = await fs
        .access(cachePath)
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(true)
    })

    it("当缓存有效时应该返回缓存的索引", async () => {
      // 第一次调用生成索引
      const first = await indexCache.getOrCreate(tempDir)

      // 第二次调用应该返回缓存
      const second = await indexCache.getOrCreate(tempDir)

      expect(second.updatedAt).toBe(first.updatedAt)
      expect(second.hash).toBe(first.hash)
    })

    it("当项目变更时应该重新生成索引", async () => {
      // 第一次调用生成索引
      const first = await indexCache.getOrCreate(tempDir)

      // 修改项目文件
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          version: "2.0.0", // 版本变更
          dependencies: { typescript: "^5.0.0" },
        })
      )

      // 等待一小段时间确保文件系统更新
      await new Promise((resolve) => setTimeout(resolve, 100))

      // 第二次调用应该检测到变更并重新生成
      const second = await indexCache.getOrCreate(tempDir)

      // 哈希应该不同
      expect(second.hash).not.toBe(first.hash)
    })

    it("生成的索引应该包含正确的技术栈信息", async () => {
      const result = await indexCache.getOrCreate(tempDir)

      expect(result.structure.techStack.languages).toContain("JavaScript")
      expect(result.structure.techStack.languages).toContain("TypeScript")
      expect(result.structure.techStack.testFramework).toBe("Vitest")
    })

    it("生成的索引应该包含元数据", async () => {
      const result = await indexCache.getOrCreate(tempDir)

      expect(result.metadata.generationTime).toBeGreaterThanOrEqual(0)
      expect(result.metadata.fileCount).toBeGreaterThanOrEqual(0)
      expect(result.metadata.dirCount).toBeGreaterThanOrEqual(0)
    })
  })
})

// ============================================================================
// createDefaultIndexCache Tests
// ============================================================================

describe("createDefaultIndexCache", () => {
  it("应该使用默认配置创建缓存实例", () => {
    const cache = createDefaultIndexCache("/test/project")
    expect(cache).toBeDefined()
    expect(cache.load).toBeDefined()
    expect(cache.save).toBeDefined()
    expect(cache.isValid).toBeDefined()
    expect(cache.clear).toBeDefined()
    expect(cache.getOrCreate).toBeDefined()
  })
})
