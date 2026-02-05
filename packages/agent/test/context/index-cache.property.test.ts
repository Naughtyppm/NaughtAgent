/**
 * IndexCache 属性测试
 *
 * 使用 fast-check 进行属性测试，验证索引缓存的核心属性：
 * - 属性 1: 索引缓存有效性和加载
 * - 属性 2: 项目索引结构完整性
 * - 属性 7: 项目索引序列化往返
 *
 * 测试框架：fast-check
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fc from "fast-check"
import * as fs from "fs/promises"
import * as path from "path"
import {
  createIndexCache,
  isValidProjectIndex,
  INDEX_VERSION,
  DEFAULT_TTL,
  type ProjectIndex,
  type IndexCache,
} from "../../src/context/index-cache"
import { createTempDir, cleanupTempDir, sleep } from "../helpers/context"

// ============================================================================
// Arbitraries (数据生成器)
// ============================================================================

/**
 * TechStack 生成器
 */
const techStackArb = fc.record({
  languages: fc.array(
    fc.constantFrom("TypeScript", "JavaScript", "Python", "Rust", "Go", "Java"),
    { minLength: 1, maxLength: 5 }
  ),
  frameworks: fc.array(
    fc.constantFrom("React", "Vue", "Node.js", "Express", "FastAPI", "Actix"),
    { minLength: 0, maxLength: 3 }
  ),
  packageManager: fc.option(
    fc.constantFrom("npm", "yarn", "pnpm", "bun") as fc.Arbitrary<"npm" | "yarn" | "pnpm" | "bun">,
    { nil: undefined }
  ),
  testFramework: fc.option(fc.constantFrom("vitest", "jest", "pytest", "cargo test"), {
    nil: undefined,
  }),
  buildTool: fc.option(fc.constantFrom("tsup", "esbuild", "webpack", "vite"), {
    nil: undefined,
  }),
})

/**
 * ProjectIndex 结构生成器
 */
const projectIndexStructureArb = fc.record({
  tree: fc.string({ minLength: 0, maxLength: 500 }),
  keyFiles: fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
    minLength: 0,
    maxLength: 10,
  }),
  techStack: techStackArb,
})

/**
 * ProjectIndex 元数据生成器
 */
const projectIndexMetadataArb = fc.record({
  generationTime: fc.integer({ min: 0, max: 100000 }),
  fileCount: fc.integer({ min: 0, max: 10000 }),
  dirCount: fc.integer({ min: 0, max: 1000 }),
})

/**
 * 完整 ProjectIndex 生成器
 */
const projectIndexArb: fc.Arbitrary<ProjectIndex> = fc.record({
  version: fc.constant(INDEX_VERSION),
  updatedAt: fc.integer({ min: 0, max: Date.now() + 1000000 }),
  hash: fc.hexaString({ minLength: 64, maxLength: 64 }),
  root: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  structure: projectIndexStructureArb,
  metadata: projectIndexMetadataArb,
})

/**
 * 有效 JSON 内容生成器（用于 package.json 等）
 */
const jsonContentArb = fc
  .record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    version: fc.string({ minLength: 1, maxLength: 10 }),
    value: fc.integer({ min: 0, max: 1000 }),
  })
  .map((obj) => JSON.stringify(obj, null, 2))

/**
 * 关键文件名生成器
 */
const keyFileNameArb = fc.constantFrom(
  "package.json",
  "tsconfig.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml"
)

// ============================================================================
// 属性 1: 索引缓存有效性和加载
// ============================================================================

describe("IndexCache Property Tests", () => {
  let tempDir: string
  let cacheDir: string
  let indexCache: IndexCache

  beforeEach(async () => {
    tempDir = await createTempDir("index-cache-prop-")
    cacheDir = path.join(tempDir, ".naught", "cache")
    await fs.mkdir(cacheDir, { recursive: true })

    // 创建基本的项目结构
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({
        name: "test-project",
        version: "1.0.0",
        dependencies: { typescript: "^5.0.0" },
      })
    )

    indexCache = createIndexCache({
      cacheDir,
      cacheFile: "project-index.json",
      ttl: DEFAULT_TTL,
    })
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  // 功能: context-token-optimization, 属性 1: 索引缓存有效性和加载
  // 验证: 需求 1.1, 1.2, 1.3
  describe("属性 1: 索引缓存有效性和加载", () => {
    /**
     * **Validates: Requirements 1.1, 1.2**
     *
     * 对于任何具有缓存 Project_Index 的项目目录，如果缓存存在且项目哈希匹配，
     * 加载缓存应返回缓存的索引。
     */
    it("缓存存在且哈希匹配时应返回缓存的索引", async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 10 }), async (iterations) => {
          // 首先生成一个索引
          const originalIndex = await indexCache.getOrCreate(tempDir)

          // 多次调用 getOrCreate，应该返回相同的缓存索引
          for (let i = 0; i < iterations; i++) {
            const cachedIndex = await indexCache.getOrCreate(tempDir)

            // 断言：应该返回相同的索引（updatedAt 和 hash 相同）
            expect(cachedIndex.updatedAt).toBe(originalIndex.updatedAt)
            expect(cachedIndex.hash).toBe(originalIndex.hash)
            expect(cachedIndex.version).toBe(originalIndex.version)
          }
        }),
        { numRuns: 20 }
      )
    })

    /**
     * **Validates: Requirements 1.3**
     *
     * 对于任何项目目录，如果缓存缺失，应生成新索引并持久化。
     */
    it("缓存缺失时应生成新索引并持久化", async () => {
      await fc.assert(
        fc.asyncProperty(jsonContentArb, async (packageContent) => {
          // 创建新的临时目录
          const newTempDir = await createTempDir("index-cache-new-")
          const newCacheDir = path.join(newTempDir, ".naught", "cache")

          try {
            // 创建项目文件
            await fs.writeFile(path.join(newTempDir, "package.json"), packageContent)

            const newCache = createIndexCache({
              cacheDir: newCacheDir,
              cacheFile: "project-index.json",
              ttl: DEFAULT_TTL,
            })

            // 确认缓存不存在
            const beforeLoad = await newCache.load()
            expect(beforeLoad).toBeNull()

            // 调用 getOrCreate
            const index = await newCache.getOrCreate(newTempDir)

            // 断言：应该生成有效的索引
            expect(index).not.toBeNull()
            expect(index.version).toBe(INDEX_VERSION)
            expect(index.root).toBe(newTempDir)

            // 断言：索引应该被持久化
            const afterLoad = await newCache.load()
            expect(afterLoad).not.toBeNull()
            expect(afterLoad?.hash).toBe(index.hash)
          } finally {
            await cleanupTempDir(newTempDir)
          }
        }),
        { numRuns: 15 }
      )
    })

    /**
     * **Validates: Requirements 1.2, 1.3**
     *
     * 对于任何项目目录，如果哈希不同（项目已变更），应生成新索引并持久化。
     */
    it("哈希不匹配时应重新生成索引", async () => {
      await fc.assert(
        fc.asyncProperty(
          jsonContentArb,
          jsonContentArb,
          async (content1, content2) => {
            // 前提条件：两个内容必须不同
            fc.pre(content1 !== content2)

            // 生成初始索引
            await fs.writeFile(path.join(tempDir, "package.json"), content1)
            const index1 = await indexCache.getOrCreate(tempDir)

            // 修改项目文件
            await fs.writeFile(path.join(tempDir, "package.json"), content2)

            // 再次调用 getOrCreate
            const index2 = await indexCache.getOrCreate(tempDir)

            // 断言：应该生成新的索引（哈希不同）
            expect(index2.hash).not.toBe(index1.hash)
            // 断言：updatedAt 应该更新
            expect(index2.updatedAt).toBeGreaterThanOrEqual(index1.updatedAt)
          }
        ),
        { numRuns: 20 }
      )
    })

    /**
     * **Validates: Requirements 1.1, 1.2**
     *
     * 对于任何有效的缓存，isValid 应该正确判断缓存有效性。
     */
    it("isValid 应正确判断缓存有效性", async () => {
      await fc.assert(
        fc.asyncProperty(fc.boolean(), async (shouldBeValid) => {
          // 生成索引
          const index = await indexCache.getOrCreate(tempDir)

          if (!shouldBeValid) {
            // 修改项目使缓存失效
            await fs.writeFile(
              path.join(tempDir, "package.json"),
              JSON.stringify({ name: "modified", version: Date.now().toString() })
            )
          }

          const isValid = await indexCache.isValid(index)

          // 断言：isValid 应该正确反映缓存状态
          expect(isValid).toBe(shouldBeValid)
        }),
        { numRuns: 20 }
      )
    })
  })


  // ============================================================================
  // 属性 2: 项目索引结构完整性
  // ============================================================================

  // 功能: context-token-optimization, 属性 2: 项目索引结构完整性
  // 验证: 需求 1.4
  describe("属性 2: 项目索引结构完整性", () => {
    /**
     * **Validates: Requirements 1.4**
     *
     * 对于任何生成的 Project_Index，它应包含所有必需字段：
     * version、updatedAt、hash、root、structure.tree、structure.keyFiles、
     * structure.techStack 和 metadata。
     */
    it("生成的索引应包含所有必需字段", async () => {
      await fc.assert(
        fc.asyncProperty(
          keyFileNameArb,
          jsonContentArb,
          async (keyFileName, content) => {
            // 创建新的临时目录
            const newTempDir = await createTempDir("index-struct-")
            const newCacheDir = path.join(newTempDir, ".naught", "cache")

            try {
              // 创建项目文件
              await fs.writeFile(path.join(newTempDir, keyFileName), content)

              const newCache = createIndexCache({
                cacheDir: newCacheDir,
                cacheFile: "project-index.json",
                ttl: DEFAULT_TTL,
              })

              // 生成索引
              const index = await newCache.getOrCreate(newTempDir)

              // 断言：顶级字段存在且类型正确
              expect(typeof index.version).toBe("string")
              expect(index.version).toBe(INDEX_VERSION)
              expect(typeof index.updatedAt).toBe("number")
              expect(index.updatedAt).toBeGreaterThan(0)
              expect(typeof index.hash).toBe("string")
              expect(index.hash.length).toBeGreaterThan(0)
              expect(typeof index.root).toBe("string")
              expect(index.root).toBe(newTempDir)

              // 断言：structure 字段存在且类型正确
              expect(index.structure).toBeDefined()
              expect(typeof index.structure.tree).toBe("string")
              expect(Array.isArray(index.structure.keyFiles)).toBe(true)
              expect(index.structure.techStack).toBeDefined()

              // 断言：techStack 字段存在且类型正确
              expect(Array.isArray(index.structure.techStack.languages)).toBe(true)
              expect(Array.isArray(index.structure.techStack.frameworks)).toBe(true)

              // 断言：metadata 字段存在且类型正确
              expect(index.metadata).toBeDefined()
              expect(typeof index.metadata.generationTime).toBe("number")
              expect(index.metadata.generationTime).toBeGreaterThanOrEqual(0)
              expect(typeof index.metadata.fileCount).toBe("number")
              expect(index.metadata.fileCount).toBeGreaterThanOrEqual(0)
              expect(typeof index.metadata.dirCount).toBe("number")
              expect(index.metadata.dirCount).toBeGreaterThanOrEqual(0)
            } finally {
              await cleanupTempDir(newTempDir)
            }
          }
        ),
        { numRuns: 20 }
      )
    })

    /**
     * **Validates: Requirements 1.4**
     *
     * 对于任何生成的 Project_Index，isValidProjectIndex 验证应该通过。
     */
    it("生成的索引应通过 isValidProjectIndex 验证", async () => {
      await fc.assert(
        fc.asyncProperty(jsonContentArb, async (content) => {
          // 创建新的临时目录
          const newTempDir = await createTempDir("index-valid-")
          const newCacheDir = path.join(newTempDir, ".naught", "cache")

          try {
            // 创建项目文件
            await fs.writeFile(path.join(newTempDir, "package.json"), content)

            const newCache = createIndexCache({
              cacheDir: newCacheDir,
              cacheFile: "project-index.json",
              ttl: DEFAULT_TTL,
            })

            // 生成索引
            const index = await newCache.getOrCreate(newTempDir)

            // 断言：应该通过验证
            expect(isValidProjectIndex(index)).toBe(true)
          } finally {
            await cleanupTempDir(newTempDir)
          }
        }),
        { numRuns: 20 }
      )
    })

    /**
     * **Validates: Requirements 1.4**
     *
     * 对于任何随机生成的有效 ProjectIndex 结构，isValidProjectIndex 应该返回 true。
     */
    it("有效的 ProjectIndex 结构应通过验证", async () => {
      await fc.assert(
        fc.property(projectIndexArb, (index) => {
          // 断言：有效结构应该通过验证
          expect(isValidProjectIndex(index)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 1.4**
     *
     * 对于任何缺少必需字段的对象，isValidProjectIndex 应该返回 false。
     */
    it("缺少必需字段的对象应验证失败", async () => {
      const requiredFields = [
        "version",
        "updatedAt",
        "hash",
        "root",
        "structure",
        "metadata",
      ]

      await fc.assert(
        fc.property(
          projectIndexArb,
          fc.constantFrom(...requiredFields),
          (index, fieldToRemove) => {
            // 创建副本并删除字段
            const invalidIndex = { ...index }
            delete (invalidIndex as Record<string, unknown>)[fieldToRemove]

            // 断言：应该验证失败
            expect(isValidProjectIndex(invalidIndex)).toBe(false)
          }
        ),
        { numRuns: 50 }
      )
    })
  })


  // ============================================================================
  // 属性 7: 项目索引序列化往返
  // ============================================================================

  // 功能: context-token-optimization, 属性 7: 项目索引序列化往返
  // 验证: 需求 2.4
  describe("属性 7: 项目索引序列化往返", () => {
    /**
     * **Validates: Requirements 2.4**
     *
     * 对于任何有效的 Project_Index 对象，序列化为 JSON 然后反序列化
     * 应产生与原始对象等价的对象。
     */
    it("序列化后反序列化应产生等价对象", async () => {
      await fc.assert(
        fc.property(projectIndexArb, (originalIndex) => {
          // 序列化
          const serialized = JSON.stringify(originalIndex)

          // 反序列化
          const deserialized = JSON.parse(serialized) as ProjectIndex

          // 断言：反序列化后的对象应该与原始对象等价
          expect(deserialized).toEqual(originalIndex)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 2.4**
     *
     * 对于任何有效的 Project_Index 对象，多次序列化/反序列化应该保持一致。
     */
    it("多次序列化/反序列化应保持一致", async () => {
      await fc.assert(
        fc.property(
          projectIndexArb,
          fc.integer({ min: 2, max: 5 }),
          (originalIndex, iterations) => {
            let current: ProjectIndex = originalIndex

            // 多次序列化/反序列化
            for (let i = 0; i < iterations; i++) {
              const serialized = JSON.stringify(current)
              current = JSON.parse(serialized) as ProjectIndex
            }

            // 断言：最终结果应该与原始对象等价
            expect(current).toEqual(originalIndex)
          }
        ),
        { numRuns: 50 }
      )
    })

    /**
     * **Validates: Requirements 2.4**
     *
     * 对于任何有效的 Project_Index 对象，序列化后反序列化应该通过验证。
     */
    it("序列化后反序列化的对象应通过验证", async () => {
      await fc.assert(
        fc.property(projectIndexArb, (originalIndex) => {
          // 序列化
          const serialized = JSON.stringify(originalIndex)

          // 反序列化
          const deserialized = JSON.parse(serialized)

          // 断言：反序列化后的对象应该通过验证
          expect(isValidProjectIndex(deserialized)).toBe(true)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 2.4**
     *
     * 对于任何通过 save/load 的 Project_Index，应该保持等价。
     */
    it("通过 save/load 的索引应保持等价", async () => {
      await fc.assert(
        fc.asyncProperty(projectIndexArb, async (originalIndex) => {
          // 使用真实的 root 路径
          const indexWithValidRoot = {
            ...originalIndex,
            root: tempDir,
          }

          // 保存
          await indexCache.save(indexWithValidRoot)

          // 加载
          const loaded = await indexCache.load()

          // 断言：加载的索引应该与保存的索引等价
          expect(loaded).not.toBeNull()
          expect(loaded).toEqual(indexWithValidRoot)
        }),
        { numRuns: 30 }
      )
    })

    /**
     * **Validates: Requirements 2.4**
     *
     * 对于任何有效的 Project_Index，序列化应该产生有效的 JSON 字符串。
     */
    it("序列化应产生有效的 JSON 字符串", async () => {
      await fc.assert(
        fc.property(projectIndexArb, (index) => {
          // 序列化
          const serialized = JSON.stringify(index)

          // 断言：应该是有效的 JSON 字符串
          expect(typeof serialized).toBe("string")
          expect(serialized.length).toBeGreaterThan(0)

          // 断言：应该能够解析
          expect(() => JSON.parse(serialized)).not.toThrow()
        }),
        { numRuns: 100 }
      )
    })

    /**
     * **Validates: Requirements 2.4**
     *
     * 对于任何有效的 Project_Index，序列化后的 JSON 应该包含所有必需字段。
     */
    it("序列化后的 JSON 应包含所有必需字段", async () => {
      await fc.assert(
        fc.property(projectIndexArb, (index) => {
          // 序列化
          const serialized = JSON.stringify(index)
          const parsed = JSON.parse(serialized)

          // 断言：应该包含所有顶级字段
          expect(parsed).toHaveProperty("version")
          expect(parsed).toHaveProperty("updatedAt")
          expect(parsed).toHaveProperty("hash")
          expect(parsed).toHaveProperty("root")
          expect(parsed).toHaveProperty("structure")
          expect(parsed).toHaveProperty("metadata")

          // 断言：应该包含所有 structure 字段
          expect(parsed.structure).toHaveProperty("tree")
          expect(parsed.structure).toHaveProperty("keyFiles")
          expect(parsed.structure).toHaveProperty("techStack")

          // 断言：应该包含所有 metadata 字段
          expect(parsed.metadata).toHaveProperty("generationTime")
          expect(parsed.metadata).toHaveProperty("fileCount")
          expect(parsed.metadata).toHaveProperty("dirCount")
        }),
        { numRuns: 50 }
      )
    })
  })
})
