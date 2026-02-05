/**
 * ContextInjector 属性测试
 *
 * 使用 fast-check 进行属性测试，验证上下文注入器的核心属性：
 * - 属性 8: 上下文注入完整性
 * - 属性 9: 上下文注入在缓存过期时触发重新生成
 *
 * 测试框架：fast-check
 *
 * 功能: context-token-optimization
 * 验证: 需求 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fc from "fast-check"
import * as fs from "fs/promises"
import * as path from "path"
import {
  createContextInjector,
  PROJECT_CONTEXT_TAG_OPEN,
  PROJECT_CONTEXT_TAG_CLOSE,
  type ContextInjector,
} from "../../src/context/context-injector"
import {
  createIndexCache,
  INDEX_VERSION,
  DEFAULT_TTL,
  type ProjectIndex,
  type IndexCache,
} from "../../src/context/index-cache"
import { createTempDir, cleanupTempDir } from "../helpers/context"

// ============================================================================
// Arbitraries (数据生成器)
// ============================================================================

/**
 * TechStack 生成器
 */
const techStackArb = fc.record({
  languages: fc.array(
    fc.constantFrom("TypeScript", "JavaScript", "Python", "Rust", "Go", "Java"),
    { minLength: 0, maxLength: 5 }
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
 * 非空 TechStack 生成器（至少有一个语言）
 */
const nonEmptyTechStackArb = fc.record({
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
 * 项目结构树生成器
 */
const treeArb = fc.array(
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9._-]+$/.test(s)),
    isDir: fc.boolean(),
  }),
  { minLength: 1, maxLength: 10 }
).map(items => {
  return items.map((item, index) => {
    const prefix = index === items.length - 1 ? "└── " : "├── "
    return prefix + item.name + (item.isDir ? "/" : "")
  }).join("\n")
})

/**
 * 非空项目结构树生成器
 */
const nonEmptyTreeArb = fc.array(
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9._-]+$/.test(s)),
    isDir: fc.boolean(),
  }),
  { minLength: 1, maxLength: 10 }
).map(items => {
  return items.map((item, index) => {
    const prefix = index === items.length - 1 ? "└── " : "├── "
    return prefix + item.name + (item.isDir ? "/" : "")
  }).join("\n")
})

/**
 * 关键文件列表生成器
 */
const keyFilesArb = fc.array(
  fc.constantFrom(
    "package.json",
    "tsconfig.json",
    "README.md",
    "Cargo.toml",
    "go.mod",
    "pyproject.toml",
    ".gitignore",
    "Makefile"
  ),
  { minLength: 0, maxLength: 5 }
).map(files => [...new Set(files)]) // 去重

/**
 * 非空关键文件列表生成器
 */
const nonEmptyKeyFilesArb = fc.array(
  fc.constantFrom(
    "package.json",
    "tsconfig.json",
    "README.md",
    "Cargo.toml",
    "go.mod",
    "pyproject.toml",
    ".gitignore",
    "Makefile"
  ),
  { minLength: 1, maxLength: 5 }
).map(files => [...new Set(files)]) // 去重

/**
 * ProjectIndex 结构生成器
 */
const projectIndexStructureArb = fc.record({
  tree: treeArb,
  keyFiles: keyFilesArb,
  techStack: techStackArb,
})

/**
 * 非空 ProjectIndex 结构生成器（确保至少有一个内容）
 */
const nonEmptyProjectIndexStructureArb = fc.record({
  tree: nonEmptyTreeArb,
  keyFiles: nonEmptyKeyFilesArb,
  techStack: nonEmptyTechStackArb,
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
 * 非空 ProjectIndex 生成器（确保有内容可注入）
 */
const nonEmptyProjectIndexArb: fc.Arbitrary<ProjectIndex> = fc.record({
  version: fc.constant(INDEX_VERSION),
  updatedAt: fc.integer({ min: 0, max: Date.now() + 1000000 }),
  hash: fc.hexaString({ minLength: 64, maxLength: 64 }),
  root: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  structure: nonEmptyProjectIndexStructureArb,
  metadata: projectIndexMetadataArb,
})

/**
 * 基础提示生成器
 */
const basePromptArb = fc.string({ minLength: 0, maxLength: 500 })

/**
 * 非空基础提示生成器
 */
const nonEmptyBasePromptArb = fc.string({ minLength: 10, maxLength: 500 })

/**
 * 有效 JSON 内容生成器（用于 package.json 等）
 */
const jsonContentArb = fc
  .record({
    name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
    version: fc.constantFrom("1.0.0", "2.0.0", "0.1.0"),
    value: fc.integer({ min: 0, max: 1000 }),
  })
  .map((obj) => JSON.stringify(obj, null, 2))

// ============================================================================
// 属性 8: 上下文注入完整性
// ============================================================================

describe("ContextInjector Property Tests", () => {
  let injector: ContextInjector

  beforeEach(() => {
    injector = createContextInjector()
  })

  // 功能: context-token-optimization, 属性 8: 上下文注入完整性
  // 验证: 需求 3.1, 3.2, 3.3, 3.4
  describe("属性 8: 上下文注入完整性", () => {
    /**
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
     *
     * 对于任何有效的 Project_Index，注入的上下文字符串应包含项目结构树、
     * 技术栈信息、关键文件列表，并包装在 `<project-context>` 标签内。
     */
    it("注入的上下文应包含项目结构树", async () => {
      await fc.assert(
        fc.property(nonEmptyProjectIndexArb, (index) => {
          const context = injector.buildProjectContext(index)

          // 断言：应包含项目结构部分
          expect(context).toContain("## Project Structure")
          // 断言：应包含树结构内容
          expect(context).toContain("```")
          // 断言：树结构内容应该在上下文中
          if (index.structure.tree) {
            // 树结构的某些部分应该出现在上下文中
            const treeLines = index.structure.tree.split("\n").filter(l => l.trim())
            if (treeLines.length > 0) {
              // 至少第一行应该出现
              expect(context).toContain(treeLines[0])
            }
          }
        }),
        { numRuns: 50 }
      )
    })

    /**
     * **Validates: Requirements 3.2**
     *
     * 对于任何有效的 Project_Index，注入的上下文应包含技术栈信息。
     */
    it("注入的上下文应包含技术栈信息", async () => {
      await fc.assert(
        fc.property(nonEmptyProjectIndexArb, (index) => {
          const context = injector.buildProjectContext(index)

          // 断言：应包含技术栈部分
          expect(context).toContain("## Tech Stack")

          // 断言：应包含语言信息
          if (index.structure.techStack.languages.length > 0) {
            expect(context).toContain("**Languages**")
            // 至少一个语言应该出现
            const hasLanguage = index.structure.techStack.languages.some(
              lang => context.includes(lang)
            )
            expect(hasLanguage).toBe(true)
          }

          // 断言：应包含框架信息（如果有）
          if (index.structure.techStack.frameworks.length > 0) {
            expect(context).toContain("**Frameworks**")
          }

          // 断言：应包含包管理器信息（如果有）
          if (index.structure.techStack.packageManager) {
            expect(context).toContain("**Package Manager**")
            expect(context).toContain(index.structure.techStack.packageManager)
          }

          // 断言：应包含测试框架信息（如果有）
          if (index.structure.techStack.testFramework) {
            expect(context).toContain("**Test Framework**")
            expect(context).toContain(index.structure.techStack.testFramework)
          }

          // 断言：应包含构建工具信息（如果有）
          if (index.structure.techStack.buildTool) {
            expect(context).toContain("**Build Tool**")
            expect(context).toContain(index.structure.techStack.buildTool)
          }
        }),
        { numRuns: 50 }
      )
    })

    /**
     * **Validates: Requirements 3.3**
     *
     * 对于任何有效的 Project_Index，注入的上下文应包含关键文件列表。
     */
    it("注入的上下文应包含关键文件列表", async () => {
      await fc.assert(
        fc.property(nonEmptyProjectIndexArb, (index) => {
          const context = injector.buildProjectContext(index)

          // 断言：应包含关键文件部分
          expect(context).toContain("## Key Files")

          // 断言：每个关键文件都应该出现在上下文中
          for (const keyFile of index.structure.keyFiles) {
            expect(context).toContain(keyFile)
          }
        }),
        { numRuns: 50 }
      )
    })

    /**
     * **Validates: Requirements 3.4**
     *
     * 对于任何有效的 Project_Index，注入的上下文应包装在 `<project-context>` 标签内。
     */
    it("注入的上下文应包装在 <project-context> 标签内", async () => {
      await fc.assert(
        fc.property(nonEmptyProjectIndexArb, (index) => {
          const context = injector.buildProjectContext(index)

          // 断言：应以开始标签开头
          expect(context.startsWith(PROJECT_CONTEXT_TAG_OPEN)).toBe(true)

          // 断言：应以结束标签结尾
          expect(context.endsWith(PROJECT_CONTEXT_TAG_CLOSE)).toBe(true)

          // 断言：应包含开始和结束标签
          expect(context).toContain(PROJECT_CONTEXT_TAG_OPEN)
          expect(context).toContain(PROJECT_CONTEXT_TAG_CLOSE)

          // 断言：开始标签应该在结束标签之前
          const openIndex = context.indexOf(PROJECT_CONTEXT_TAG_OPEN)
          const closeIndex = context.indexOf(PROJECT_CONTEXT_TAG_CLOSE)
          expect(openIndex).toBeLessThan(closeIndex)
        }),
        { numRuns: 50 }
      )
    })

    /**
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
     *
     * 对于任何有效的 Project_Index，injectIntoSystemPrompt 应正确注入上下文。
     */
    it("injectIntoSystemPrompt 应正确注入上下文到系统提示", async () => {
      await fc.assert(
        fc.property(
          nonEmptyProjectIndexArb,
          nonEmptyBasePromptArb,
          (index, basePrompt) => {
            const result = injector.injectIntoSystemPrompt(basePrompt, index)

            // 断言：结果应包含原始提示
            expect(result).toContain(basePrompt)

            // 断言：结果应包含项目上下文标签
            expect(result).toContain(PROJECT_CONTEXT_TAG_OPEN)
            expect(result).toContain(PROJECT_CONTEXT_TAG_CLOSE)

            // 断言：原始提示应该在项目上下文之前
            const promptIndex = result.indexOf(basePrompt)
            const contextIndex = result.indexOf(PROJECT_CONTEXT_TAG_OPEN)
            expect(promptIndex).toBeLessThan(contextIndex)
          }
        ),
        { numRuns: 50 }
      )
    })

    /**
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
     *
     * 对于任何有效的 Project_Index，构建的上下文应该是非空的（如果有内容）。
     */
    it("有内容的索引应产生非空上下文", async () => {
      await fc.assert(
        fc.property(nonEmptyProjectIndexArb, (index) => {
          const context = injector.buildProjectContext(index)

          // 断言：上下文应该是非空的
          expect(context.length).toBeGreaterThan(0)

          // 断言：上下文应该包含实际内容（不只是标签）
          const contentLength = context.length -
            PROJECT_CONTEXT_TAG_OPEN.length -
            PROJECT_CONTEXT_TAG_CLOSE.length - 2 // 减去换行符
          expect(contentLength).toBeGreaterThan(0)
        }),
        { numRuns: 50 }
      )
    })

    /**
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
     *
     * 对于任何空的 Project_Index 结构，构建的上下文应该是空的。
     */
    it("空索引结构应产生空上下文", async () => {
      await fc.assert(
        fc.property(
          fc.record({
            version: fc.constant(INDEX_VERSION),
            updatedAt: fc.integer({ min: 0, max: Date.now() }),
            hash: fc.hexaString({ minLength: 64, maxLength: 64 }),
            root: fc.string({ minLength: 1, maxLength: 50 }),
            structure: fc.constant({
              tree: "",
              keyFiles: [] as string[],
              techStack: {
                languages: [] as string[],
                frameworks: [] as string[],
                packageManager: undefined,
                testFramework: undefined,
                buildTool: undefined,
              },
            }),
            metadata: projectIndexMetadataArb,
          }),
          (index) => {
            const context = injector.buildProjectContext(index)

            // 断言：空索引应产生空上下文
            expect(context).toBe("")
          }
        ),
        { numRuns: 30 }
      )
    })

    /**
     * **Validates: Requirements 3.4**
     *
     * 对于任何有效的 Project_Index，标签应该正确嵌套。
     */
    it("项目上下文标签应正确嵌套", async () => {
      await fc.assert(
        fc.property(nonEmptyProjectIndexArb, (index) => {
          const context = injector.buildProjectContext(index)

          // 断言：开始标签只出现一次
          const openCount = (context.match(new RegExp(PROJECT_CONTEXT_TAG_OPEN, "g")) || []).length
          expect(openCount).toBe(1)

          // 断言：结束标签只出现一次
          const closeCount = (context.match(new RegExp(PROJECT_CONTEXT_TAG_CLOSE, "g")) || []).length
          expect(closeCount).toBe(1)
        }),
        { numRuns: 50 }
      )
    })
  })


  // ============================================================================
  // 属性 9: 上下文注入在缓存过期时触发重新生成
  // ============================================================================

  // 功能: context-token-optimization, 属性 9: 上下文注入在缓存过期时触发重新生成
  // 验证: 需求 3.5
  describe("属性 9: 上下文注入在缓存过期时触发重新生成", () => {
    let tempDir: string
    let cacheDir: string
    let indexCache: IndexCache

    beforeEach(async () => {
      tempDir = await createTempDir("context-injector-prop-")
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

    /**
     * **Validates: Requirements 3.5**
     *
     * 对于任何过期或缺失的 Project_Index 缓存，在构建系统提示时，
     * Context_Injector 应在注入前触发索引重新生成，产生有效的注入上下文。
     */
    it("缓存缺失时应触发索引生成并产生有效上下文", async () => {
      await fc.assert(
        fc.asyncProperty(jsonContentArb, async (packageContent) => {
          // 创建新的临时目录（确保没有缓存）
          const newTempDir = await createTempDir("context-inject-new-")
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

            // 通过 getOrCreate 获取索引（模拟缓存缺失时的重新生成）
            const index = await newCache.getOrCreate(newTempDir)

            // 使用注入器构建上下文
            const context = injector.buildProjectContext(index)

            // 断言：应该产生有效的上下文
            if (index.structure.tree || 
                index.structure.keyFiles.length > 0 || 
                index.structure.techStack.languages.length > 0) {
              expect(context).toContain(PROJECT_CONTEXT_TAG_OPEN)
              expect(context).toContain(PROJECT_CONTEXT_TAG_CLOSE)
            }

            // 断言：索引应该被持久化
            const afterLoad = await newCache.load()
            expect(afterLoad).not.toBeNull()
          } finally {
            await cleanupTempDir(newTempDir)
          }
        }),
        { numRuns: 20 }
      )
    })

    /**
     * **Validates: Requirements 3.5**
     *
     * 对于任何过期的缓存，getOrCreate 应重新生成索引。
     */
    it("缓存过期时应重新生成索引", async () => {
      await fc.assert(
        fc.asyncProperty(
          jsonContentArb,
          jsonContentArb,
          async (content1, content2) => {
            // 前提条件：两个内容必须不同
            fc.pre(content1 !== content2)

            // 创建新的临时目录
            const newTempDir = await createTempDir("context-inject-expire-")
            const newCacheDir = path.join(newTempDir, ".naught", "cache")

            try {
              // 创建初始项目文件
              await fs.writeFile(path.join(newTempDir, "package.json"), content1)

              // 使用非常短的 TTL 创建缓存
              const shortTtlCache = createIndexCache({
                cacheDir: newCacheDir,
                cacheFile: "project-index.json",
                ttl: 1, // 1 毫秒 TTL，几乎立即过期
              })

              // 生成初始索引
              const index1 = await shortTtlCache.getOrCreate(newTempDir)
              const context1 = injector.buildProjectContext(index1)

              // 等待缓存过期
              await new Promise(resolve => setTimeout(resolve, 10))

              // 修改项目文件
              await fs.writeFile(path.join(newTempDir, "package.json"), content2)

              // 再次获取索引（应该重新生成）
              const index2 = await shortTtlCache.getOrCreate(newTempDir)
              const context2 = injector.buildProjectContext(index2)

              // 断言：两次生成的索引哈希应该不同
              expect(index2.hash).not.toBe(index1.hash)

              // 断言：两次生成的上下文都应该有效
              if (index1.structure.tree || 
                  index1.structure.keyFiles.length > 0 || 
                  index1.structure.techStack.languages.length > 0) {
                expect(context1.length).toBeGreaterThan(0)
              }
              if (index2.structure.tree || 
                  index2.structure.keyFiles.length > 0 || 
                  index2.structure.techStack.languages.length > 0) {
                expect(context2.length).toBeGreaterThan(0)
              }
            } finally {
              await cleanupTempDir(newTempDir)
            }
          }
        ),
        { numRuns: 15 }
      )
    })

    /**
     * **Validates: Requirements 3.5**
     *
     * 对于任何项目变更（哈希不匹配），应重新生成索引并产生更新的上下文。
     */
    it("项目变更时应重新生成索引并更新上下文", async () => {
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
            const context1 = injector.buildProjectContext(index1)

            // 修改项目文件
            await fs.writeFile(path.join(tempDir, "package.json"), content2)

            // 再次获取索引（应该检测到变更并重新生成）
            const index2 = await indexCache.getOrCreate(tempDir)
            const context2 = injector.buildProjectContext(index2)

            // 断言：哈希应该不同
            expect(index2.hash).not.toBe(index1.hash)

            // 断言：updatedAt 应该更新
            expect(index2.updatedAt).toBeGreaterThanOrEqual(index1.updatedAt)

            // 断言：两次生成的上下文都应该有效（如果有内容）
            if (index1.structure.tree || 
                index1.structure.keyFiles.length > 0 || 
                index1.structure.techStack.languages.length > 0) {
              expect(context1).toContain(PROJECT_CONTEXT_TAG_OPEN)
            }
            if (index2.structure.tree || 
                index2.structure.keyFiles.length > 0 || 
                index2.structure.techStack.languages.length > 0) {
              expect(context2).toContain(PROJECT_CONTEXT_TAG_OPEN)
            }
          }
        ),
        { numRuns: 20 }
      )
    })

    /**
     * **Validates: Requirements 3.5**
     *
     * 对于任何有效缓存，不应触发重新生成。
     */
    it("有效缓存时不应重新生成索引", async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (iterations) => {
          // 生成初始索引
          const originalIndex = await indexCache.getOrCreate(tempDir)
          const originalContext = injector.buildProjectContext(originalIndex)

          // 多次调用 getOrCreate，应该返回相同的缓存索引
          for (let i = 0; i < iterations; i++) {
            const cachedIndex = await indexCache.getOrCreate(tempDir)
            const cachedContext = injector.buildProjectContext(cachedIndex)

            // 断言：应该返回相同的索引
            expect(cachedIndex.updatedAt).toBe(originalIndex.updatedAt)
            expect(cachedIndex.hash).toBe(originalIndex.hash)

            // 断言：上下文应该相同
            expect(cachedContext).toBe(originalContext)
          }
        }),
        { numRuns: 15 }
      )
    })

    /**
     * **Validates: Requirements 3.5**
     *
     * 对于任何清除缓存后的调用，应重新生成索引。
     */
    it("清除缓存后应重新生成索引", async () => {
      await fc.assert(
        fc.asyncProperty(jsonContentArb, async (packageContent) => {
          // 创建新的临时目录
          const newTempDir = await createTempDir("context-inject-clear-")
          const newCacheDir = path.join(newTempDir, ".naught", "cache")

          try {
            // 创建项目文件
            await fs.writeFile(path.join(newTempDir, "package.json"), packageContent)

            const newCache = createIndexCache({
              cacheDir: newCacheDir,
              cacheFile: "project-index.json",
              ttl: DEFAULT_TTL,
            })

            // 生成初始索引
            const index1 = await newCache.getOrCreate(newTempDir)
            const context1 = injector.buildProjectContext(index1)

            // 清除缓存
            await newCache.clear()

            // 确认缓存已清除
            const afterClear = await newCache.load()
            expect(afterClear).toBeNull()

            // 再次获取索引（应该重新生成）
            const index2 = await newCache.getOrCreate(newTempDir)
            const context2 = injector.buildProjectContext(index2)

            // 断言：哈希应该相同（项目未变更）
            expect(index2.hash).toBe(index1.hash)

            // 断言：updatedAt 应该更新（因为重新生成了）
            expect(index2.updatedAt).toBeGreaterThanOrEqual(index1.updatedAt)

            // 断言：两次生成的上下文都应该有效
            // 注意：由于项目结构树生成可能有细微差异，我们验证关键属性而非完全相等
            if (context1.length > 0) {
              expect(context1).toContain(PROJECT_CONTEXT_TAG_OPEN)
              expect(context1).toContain(PROJECT_CONTEXT_TAG_CLOSE)
            }
            if (context2.length > 0) {
              expect(context2).toContain(PROJECT_CONTEXT_TAG_OPEN)
              expect(context2).toContain(PROJECT_CONTEXT_TAG_CLOSE)
            }

            // 断言：索引应该被重新持久化
            const afterRegen = await newCache.load()
            expect(afterRegen).not.toBeNull()
            expect(afterRegen?.hash).toBe(index2.hash)
          } finally {
            await cleanupTempDir(newTempDir)
          }
        }),
        { numRuns: 15 }
      )
    })

    /**
     * **Validates: Requirements 3.5**
     *
     * 对于任何重新生成的索引，产生的上下文应该是有效的。
     */
    it("重新生成的索引应产生有效上下文", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(jsonContentArb, { minLength: 2, maxLength: 5 }),
          async (contents) => {
            // 创建新的临时目录
            const newTempDir = await createTempDir("context-inject-regen-")
            const newCacheDir = path.join(newTempDir, ".naught", "cache")

            try {
              const newCache = createIndexCache({
                cacheDir: newCacheDir,
                cacheFile: "project-index.json",
                ttl: 1, // 非常短的 TTL
              })

              for (const content of contents) {
                // 更新项目文件
                await fs.writeFile(path.join(newTempDir, "package.json"), content)

                // 等待缓存过期
                await new Promise(resolve => setTimeout(resolve, 5))

                // 获取索引
                const index = await newCache.getOrCreate(newTempDir)
                const context = injector.buildProjectContext(index)

                // 断言：索引应该有效
                expect(index.version).toBe(INDEX_VERSION)
                expect(index.root).toBe(newTempDir)
                expect(index.hash.length).toBeGreaterThan(0)

                // 断言：如果有内容，上下文应该有效
                if (index.structure.tree || 
                    index.structure.keyFiles.length > 0 || 
                    index.structure.techStack.languages.length > 0) {
                  expect(context).toContain(PROJECT_CONTEXT_TAG_OPEN)
                  expect(context).toContain(PROJECT_CONTEXT_TAG_CLOSE)
                }
              }
            } finally {
              await cleanupTempDir(newTempDir)
            }
          }
        ),
        { numRuns: 10 }
      )
    })
  })
})
