/**
 * HashCalculator 属性测试
 *
 * 使用 fast-check 进行属性测试，验证哈希计算器的核心属性：
 * - 属性 4: 哈希计算包含关键文件
 * - 属性 5: 哈希包含时间戳
 * - 属性 6: 哈希排除忽略文件
 *
 * 测试框架：fast-check
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fc from "fast-check"
import * as fs from "fs/promises"
import * as path from "path"
import { createHashCalculator } from "../../src/context/hash-calculator"
import { createTempDir, cleanupTempDir, sleep } from "../helpers/context"

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * 关键文件名生成器
 * 生成常见的项目关键文件名
 */
const keyFileNameArb = fc.constantFrom(
  "package.json",
  "tsconfig.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "requirements.txt",
  "Makefile",
  "justfile"
)

/**
 * 有效 JSON 内容生成器
 */
const jsonContentArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }),
  version: fc.string({ minLength: 1, maxLength: 10 }),
  value: fc.integer({ min: 0, max: 1000 }),
}).map((obj) => JSON.stringify(obj, null, 2))

/**
 * 简单文本内容生成器
 */
const textContentArb = fc.string({ minLength: 1, maxLength: 500 })

/**
 * 被忽略的目录名生成器
 */
const ignoredDirNameArb = fc.constantFrom(
  "node_modules",
  "dist",
  "build",
  ".git",
  "coverage",
  "__pycache__",
  "target",
  ".next"
)

/**
 * 被忽略的文件模式生成器
 */
const ignoredFilePatternArb = fc.constantFrom(
  "*.log",
  "*.tmp",
  "*.temp",
  ".env",
  ".env.*",
  ".DS_Store"
)

// ============================================================================
// 属性 4: 哈希计算包含关键文件
// ============================================================================

describe("HashCalculator Property Tests", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir("hash-calc-prop-")
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  // 功能: context-token-optimization, 属性 4: 哈希计算包含关键文件
  // 验证: 需求 2.1
  describe("属性 4: 哈希计算包含关键文件", () => {
    /**
     * **Validates: Requirements 2.1**
     *
     * 对于任何项目目录，如果关键项目文件（package.json、tsconfig.json、Cargo.toml 等）
     * 被修改，计算的项目哈希应与之前的哈希不同。
     */
    it("修改关键文件内容应导致哈希变化", async () => {
      await fc.assert(
        fc.asyncProperty(
          keyFileNameArb,
          jsonContentArb,
          jsonContentArb,
          async (keyFileName, content1, content2) => {
            // 前提条件：两个内容必须不同
            fc.pre(content1 !== content2)

            const calculator = createHashCalculator({ includeTimestamps: false })
            const filePath = path.join(tempDir, keyFileName)

            // 写入初始内容
            await fs.writeFile(filePath, content1)
            const hash1 = await calculator.computeProjectHash(tempDir)

            // 修改内容
            await fs.writeFile(filePath, content2)
            const hash2 = await calculator.computeProjectHash(tempDir)

            // 断言：哈希应该不同
            expect(hash1).not.toBe(hash2)
          }
        ),
        { numRuns: 50 }
      )
    })

    /**
     * **Validates: Requirements 2.1**
     *
     * 对于任何关键文件，添加新的关键文件应导致哈希变化
     */
    it("添加新的关键文件应导致哈希变化", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(keyFileNameArb, keyFileNameArb).filter(([a, b]) => a !== b),
          jsonContentArb,
          jsonContentArb,
          async ([keyFile1, keyFile2], content1, content2) => {
            const calculator = createHashCalculator({ includeTimestamps: false })

            // 只有第一个关键文件
            await fs.writeFile(path.join(tempDir, keyFile1), content1)
            const hash1 = await calculator.computeProjectHash(tempDir)

            // 添加第二个关键文件
            await fs.writeFile(path.join(tempDir, keyFile2), content2)
            const hash2 = await calculator.computeProjectHash(tempDir)

            // 断言：哈希应该不同
            expect(hash1).not.toBe(hash2)
          }
        ),
        { numRuns: 30 }
      )
    })

    /**
     * **Validates: Requirements 2.1**
     *
     * 删除关键文件应导致哈希变化
     */
    it("删除关键文件应导致哈希变化", async () => {
      await fc.assert(
        fc.asyncProperty(
          keyFileNameArb,
          jsonContentArb,
          async (keyFileName, content) => {
            const calculator = createHashCalculator({ includeTimestamps: false })
            const filePath = path.join(tempDir, keyFileName)

            // 创建关键文件
            await fs.writeFile(filePath, content)
            const hash1 = await calculator.computeProjectHash(tempDir)

            // 删除关键文件
            await fs.unlink(filePath)
            const hash2 = await calculator.computeProjectHash(tempDir)

            // 断言：哈希应该不同
            expect(hash1).not.toBe(hash2)
          }
        ),
        { numRuns: 30 }
      )
    })
  })


  // ============================================================================
  // 属性 5: 哈希包含时间戳
  // ============================================================================

  // 功能: context-token-optimization, 属性 5: 哈希包含时间戳
  // 验证: 需求 2.2
  describe("属性 5: 哈希包含时间戳", () => {
    /**
     * **Validates: Requirements 2.2**
     *
     * 对于任何项目目录，如果仅关键文件的修改时间戳改变（内容不变），
     * 计算的项目哈希应与之前的哈希不同。
     */
    it("仅修改时间戳（内容不变）应导致哈希变化", async () => {
      await fc.assert(
        fc.asyncProperty(
          keyFileNameArb,
          jsonContentArb,
          async (keyFileName, content) => {
            const calculator = createHashCalculator({ includeTimestamps: true })
            const filePath = path.join(tempDir, keyFileName)

            // 写入初始内容
            await fs.writeFile(filePath, content)
            const hash1 = await calculator.computeProjectHash(tempDir)

            // 等待一段时间，然后重写相同内容（时间戳会变化）
            await sleep(50)
            await fs.writeFile(filePath, content)
            const hash2 = await calculator.computeProjectHash(tempDir)

            // 断言：启用时间戳时，哈希应该不同
            expect(hash1).not.toBe(hash2)
          }
        ),
        { numRuns: 20 }
      )
    })

    /**
     * **Validates: Requirements 2.2**
     *
     * 当禁用时间戳时，仅修改时间戳不应导致哈希变化
     */
    it("禁用时间戳时，仅修改时间戳不应导致哈希变化", async () => {
      await fc.assert(
        fc.asyncProperty(
          keyFileNameArb,
          jsonContentArb,
          async (keyFileName, content) => {
            const calculator = createHashCalculator({ includeTimestamps: false })
            const filePath = path.join(tempDir, keyFileName)

            // 写入初始内容
            await fs.writeFile(filePath, content)
            const hash1 = await calculator.computeProjectHash(tempDir)

            // 等待一段时间，然后重写相同内容
            await sleep(50)
            await fs.writeFile(filePath, content)
            const hash2 = await calculator.computeProjectHash(tempDir)

            // 断言：禁用时间戳时，哈希应该相同
            expect(hash1).toBe(hash2)
          }
        ),
        { numRuns: 20 }
      )
    })

    /**
     * **Validates: Requirements 2.2**
     *
     * 使用 utimes 直接修改时间戳应导致哈希变化
     */
    it("使用 utimes 修改时间戳应导致哈希变化", async () => {
      await fc.assert(
        fc.asyncProperty(
          keyFileNameArb,
          jsonContentArb,
          fc.integer({ min: 1000, max: 100000 }),
          async (keyFileName, content, timeOffset) => {
            const calculator = createHashCalculator({ includeTimestamps: true })
            const filePath = path.join(tempDir, keyFileName)

            // 写入内容
            await fs.writeFile(filePath, content)
            const hash1 = await calculator.computeProjectHash(tempDir)

            // 使用 utimes 修改时间戳
            const now = new Date()
            const newTime = new Date(now.getTime() + timeOffset)
            await fs.utimes(filePath, newTime, newTime)
            const hash2 = await calculator.computeProjectHash(tempDir)

            // 断言：哈希应该不同
            expect(hash1).not.toBe(hash2)
          }
        ),
        { numRuns: 20 }
      )
    })
  })


  // ============================================================================
  // 属性 6: 哈希排除忽略文件
  // ============================================================================

  // 功能: context-token-optimization, 属性 6: 哈希排除忽略文件
  // 验证: 需求 2.3
  describe("属性 6: 哈希排除忽略文件", () => {
    /**
     * **Validates: Requirements 2.3**
     *
     * 对于任何项目目录，如果匹配常见排除模式（node_modules、dist 等）的文件被修改，
     * 计算的项目哈希应保持不变。
     */
    it("修改被排除目录中的文件不应导致哈希变化", async () => {
      await fc.assert(
        fc.asyncProperty(
          ignoredDirNameArb,
          keyFileNameArb,
          jsonContentArb,
          textContentArb,
          textContentArb,
          async (ignoredDir, keyFileName, keyContent, ignoredContent1, ignoredContent2) => {
            // 前提条件：两个被忽略的内容必须不同
            fc.pre(ignoredContent1 !== ignoredContent2)

            const calculator = createHashCalculator({ includeTimestamps: false })

            // 创建关键文件
            await fs.writeFile(path.join(tempDir, keyFileName), keyContent)

            // 创建被忽略目录和文件
            const ignoredDirPath = path.join(tempDir, ignoredDir)
            await fs.mkdir(ignoredDirPath, { recursive: true })
            const ignoredFilePath = path.join(ignoredDirPath, "ignored-file.txt")
            await fs.writeFile(ignoredFilePath, ignoredContent1)

            const hash1 = await calculator.computeProjectHash(tempDir)

            // 修改被忽略目录中的文件
            await fs.writeFile(ignoredFilePath, ignoredContent2)
            const hash2 = await calculator.computeProjectHash(tempDir)

            // 断言：哈希应该相同
            expect(hash1).toBe(hash2)
          }
        ),
        { numRuns: 30 }
      )
    })

    /**
     * **Validates: Requirements 2.3**
     *
     * 在被排除目录中添加新文件不应导致哈希变化
     */
    it("在被排除目录中添加新文件不应导致哈希变化", async () => {
      await fc.assert(
        fc.asyncProperty(
          ignoredDirNameArb,
          keyFileNameArb,
          jsonContentArb,
          textContentArb,
          async (ignoredDir, keyFileName, keyContent, newFileContent) => {
            const calculator = createHashCalculator({ includeTimestamps: false })

            // 创建关键文件
            await fs.writeFile(path.join(tempDir, keyFileName), keyContent)

            // 创建被忽略目录
            const ignoredDirPath = path.join(tempDir, ignoredDir)
            await fs.mkdir(ignoredDirPath, { recursive: true })

            const hash1 = await calculator.computeProjectHash(tempDir)

            // 在被忽略目录中添加新文件
            await fs.writeFile(path.join(ignoredDirPath, "new-file.txt"), newFileContent)
            const hash2 = await calculator.computeProjectHash(tempDir)

            // 断言：哈希应该相同
            expect(hash1).toBe(hash2)
          }
        ),
        { numRuns: 30 }
      )
    })

    /**
     * **Validates: Requirements 2.3**
     *
     * 匹配 .gitignore 模式的文件被修改不应导致哈希变化
     */
    it("修改 .gitignore 中指定的文件不应导致哈希变化", async () => {
      // 使用预定义的有效文件名，避免生成无效文件名
      const validIgnoredFileNameArb = fc.constantFrom(
        "ignored.txt",
        "temp.log",
        "cache.dat",
        "debug.tmp",
        "local.config",
        "secret.env",
        "backup.bak"
      )

      await fc.assert(
        fc.asyncProperty(
          keyFileNameArb,
          jsonContentArb,
          validIgnoredFileNameArb,
          textContentArb,
          textContentArb,
          async (keyFileName, keyContent, ignoredFileName, content1, content2) => {
            // 前提条件：两个内容必须不同
            fc.pre(content1 !== content2)
            // 前提条件：被忽略的文件名不能是关键文件
            fc.pre(ignoredFileName !== keyFileName)

            const calculator = createHashCalculator({
              keyFiles: [keyFileName, ignoredFileName],
              includeTimestamps: false,
            })

            // 创建 .gitignore
            await fs.writeFile(path.join(tempDir, ".gitignore"), `${ignoredFileName}\n`)

            // 创建关键文件
            await fs.writeFile(path.join(tempDir, keyFileName), keyContent)

            // 创建被忽略的文件
            await fs.writeFile(path.join(tempDir, ignoredFileName), content1)

            const hash1 = await calculator.computeProjectHash(tempDir)

            // 修改被忽略的文件
            await fs.writeFile(path.join(tempDir, ignoredFileName), content2)
            const hash2 = await calculator.computeProjectHash(tempDir)

            // 断言：哈希应该相同
            expect(hash1).toBe(hash2)
          }
        ),
        { numRuns: 30 }
      )
    })

    /**
     * **Validates: Requirements 2.3**
     *
     * 删除被排除目录中的文件不应导致哈希变化
     */
    it("删除被排除目录中的文件不应导致哈希变化", async () => {
      await fc.assert(
        fc.asyncProperty(
          ignoredDirNameArb,
          keyFileNameArb,
          jsonContentArb,
          textContentArb,
          async (ignoredDir, keyFileName, keyContent, ignoredContent) => {
            const calculator = createHashCalculator({ includeTimestamps: false })

            // 创建关键文件
            await fs.writeFile(path.join(tempDir, keyFileName), keyContent)

            // 创建被忽略目录和文件
            const ignoredDirPath = path.join(tempDir, ignoredDir)
            await fs.mkdir(ignoredDirPath, { recursive: true })
            const ignoredFilePath = path.join(ignoredDirPath, "to-delete.txt")
            await fs.writeFile(ignoredFilePath, ignoredContent)

            const hash1 = await calculator.computeProjectHash(tempDir)

            // 删除被忽略目录中的文件
            await fs.unlink(ignoredFilePath)
            const hash2 = await calculator.computeProjectHash(tempDir)

            // 断言：哈希应该相同
            expect(hash1).toBe(hash2)
          }
        ),
        { numRuns: 30 }
      )
    })

    /**
     * **Validates: Requirements 2.3**
     *
     * 修改非关键文件（不在 keyFiles 列表中）不应导致哈希变化
     */
    it("修改非关键文件不应导致哈希变化", async () => {
      await fc.assert(
        fc.asyncProperty(
          keyFileNameArb,
          jsonContentArb,
          textContentArb,
          textContentArb,
          async (keyFileName, keyContent, nonKeyContent1, nonKeyContent2) => {
            // 前提条件：两个内容必须不同
            fc.pre(nonKeyContent1 !== nonKeyContent2)

            const calculator = createHashCalculator({ includeTimestamps: false })

            // 创建关键文件
            await fs.writeFile(path.join(tempDir, keyFileName), keyContent)

            // 创建非关键文件
            const nonKeyFilePath = path.join(tempDir, "random-file.txt")
            await fs.writeFile(nonKeyFilePath, nonKeyContent1)

            const hash1 = await calculator.computeProjectHash(tempDir)

            // 修改非关键文件
            await fs.writeFile(nonKeyFilePath, nonKeyContent2)
            const hash2 = await calculator.computeProjectHash(tempDir)

            // 断言：哈希应该相同
            expect(hash1).toBe(hash2)
          }
        ),
        { numRuns: 30 }
      )
    })
  })
})
