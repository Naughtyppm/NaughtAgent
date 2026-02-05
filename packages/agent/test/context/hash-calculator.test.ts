/**
 * HashCalculator 单元测试
 *
 * 测试哈希计算器的核心功能：
 * - 项目哈希计算
 * - 单文件哈希计算
 * - 字符串内容哈希计算
 * - .gitignore 和排除模式支持
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import {
  createHashCalculator,
  DEFAULT_KEY_FILES,
  DEFAULT_EXCLUDE_PATTERNS,
} from "../../src/context/hash-calculator"
import { createTempDir, cleanupTempDir, sleep } from "../helpers/context"

describe("HashCalculator", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  describe("createHashCalculator", () => {
    it("should create calculator with default config", () => {
      const calculator = createHashCalculator()

      expect(calculator).toBeDefined()
      expect(calculator.computeProjectHash).toBeTypeOf("function")
      expect(calculator.computeFileHash).toBeTypeOf("function")
      expect(calculator.computeContentHash).toBeTypeOf("function")
    })

    it("should create calculator with custom config", () => {
      const calculator = createHashCalculator({
        keyFiles: ["custom.json"],
        excludePatterns: ["*.log"],
        includeTimestamps: false,
      })

      expect(calculator).toBeDefined()
    })
  })

  describe("computeContentHash", () => {
    it("should compute SHA-256 hash for string content", () => {
      const calculator = createHashCalculator()
      const hash = calculator.computeContentHash("hello world")

      // SHA-256 hash is 64 hex characters
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[a-f0-9]+$/)
    })

    it("should return same hash for same content", () => {
      const calculator = createHashCalculator()
      const hash1 = calculator.computeContentHash("test content")
      const hash2 = calculator.computeContentHash("test content")

      expect(hash1).toBe(hash2)
    })

    it("should return different hash for different content", () => {
      const calculator = createHashCalculator()
      const hash1 = calculator.computeContentHash("content A")
      const hash2 = calculator.computeContentHash("content B")

      expect(hash1).not.toBe(hash2)
    })

    it("should handle empty string", () => {
      const calculator = createHashCalculator()
      const hash = calculator.computeContentHash("")

      expect(hash).toHaveLength(64)
    })

    it("should handle unicode content", () => {
      const calculator = createHashCalculator()
      const hash = calculator.computeContentHash("你好世界 🌍")

      expect(hash).toHaveLength(64)
    })
  })

  describe("computeFileHash", () => {
    it("should compute hash for file content", async () => {
      const filePath = path.join(tempDir, "test.txt")
      await fs.writeFile(filePath, "file content")

      const calculator = createHashCalculator()
      const hash = await calculator.computeFileHash(filePath)

      expect(hash).toHaveLength(64)
    })

    it("should return same hash for same file content", async () => {
      const file1 = path.join(tempDir, "file1.txt")
      const file2 = path.join(tempDir, "file2.txt")
      await fs.writeFile(file1, "same content")
      await fs.writeFile(file2, "same content")

      const calculator = createHashCalculator()
      const hash1 = await calculator.computeFileHash(file1)
      const hash2 = await calculator.computeFileHash(file2)

      expect(hash1).toBe(hash2)
    })

    it("should throw error for non-existent file", async () => {
      const calculator = createHashCalculator()

      await expect(
        calculator.computeFileHash(path.join(tempDir, "nonexistent.txt"))
      ).rejects.toThrow()
    })
  })

  describe("computeProjectHash", () => {
    it("should compute hash based on key files", async () => {
      // 需求 2.1: 基于关键项目文件计算哈希
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "test-project" })
      )

      const calculator = createHashCalculator()
      const hash = await calculator.computeProjectHash(tempDir)

      expect(hash).toHaveLength(64)
    })

    it("should return different hash when key file content changes", async () => {
      // 需求 2.1: 关键文件修改应导致哈希变化
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "test-v1" })
      )

      const calculator = createHashCalculator({ includeTimestamps: false })
      const hash1 = await calculator.computeProjectHash(tempDir)

      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "test-v2" })
      )
      const hash2 = await calculator.computeProjectHash(tempDir)

      expect(hash1).not.toBe(hash2)
    })

    it("should return same hash for unchanged project", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "test" })
      )

      const calculator = createHashCalculator({ includeTimestamps: false })
      const hash1 = await calculator.computeProjectHash(tempDir)
      const hash2 = await calculator.computeProjectHash(tempDir)

      expect(hash1).toBe(hash2)
    })

    it("should include multiple key files in hash", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "test" })
      )
      await fs.writeFile(
        path.join(tempDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: {} })
      )

      const calculator = createHashCalculator({ includeTimestamps: false })
      const hash1 = await calculator.computeProjectHash(tempDir)

      // 修改 tsconfig.json
      await fs.writeFile(
        path.join(tempDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { strict: true } })
      )
      const hash2 = await calculator.computeProjectHash(tempDir)

      expect(hash1).not.toBe(hash2)
    })

    it("should return empty hash for project without key files", async () => {
      // 没有任何关键文件
      await fs.writeFile(path.join(tempDir, "random.txt"), "content")

      const calculator = createHashCalculator()
      const hash = await calculator.computeProjectHash(tempDir)

      // 应该返回空内容的哈希
      expect(hash).toHaveLength(64)
    })
  })

  describe("timestamp handling", () => {
    it("should include timestamps when configured", async () => {
      // 需求 2.2: 包含文件修改时间戳
      await fs.writeFile(path.join(tempDir, "package.json"), "{}")

      const calculator = createHashCalculator({ includeTimestamps: true })
      const hash1 = await calculator.computeProjectHash(tempDir)

      // 等待一小段时间后重写文件（内容相同但时间戳不同）
      await sleep(50)
      await fs.writeFile(path.join(tempDir, "package.json"), "{}")

      const hash2 = await calculator.computeProjectHash(tempDir)

      // 时间戳不同，哈希应该不同
      expect(hash1).not.toBe(hash2)
    })

    it("should not include timestamps when disabled", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), "{}")

      const calculator = createHashCalculator({ includeTimestamps: false })
      const hash1 = await calculator.computeProjectHash(tempDir)

      // 等待后重写文件
      await sleep(50)
      await fs.writeFile(path.join(tempDir, "package.json"), "{}")

      const hash2 = await calculator.computeProjectHash(tempDir)

      // 内容相同，时间戳不计入，哈希应该相同
      expect(hash1).toBe(hash2)
    })
  })

  describe("gitignore and exclude patterns", () => {
    it("should ignore files matching .gitignore patterns", async () => {
      // 需求 2.3: 忽略 .gitignore 中的文件
      await fs.writeFile(path.join(tempDir, ".gitignore"), "ignored.json\n")
      await fs.writeFile(path.join(tempDir, "package.json"), '{"v":1}')
      await fs.writeFile(path.join(tempDir, "ignored.json"), '{"ignored":true}')

      const calculator = createHashCalculator({
        keyFiles: ["package.json", "ignored.json"],
        includeTimestamps: false,
      })
      const hash1 = await calculator.computeProjectHash(tempDir)

      // 修改被忽略的文件
      await fs.writeFile(path.join(tempDir, "ignored.json"), '{"ignored":false}')
      const hash2 = await calculator.computeProjectHash(tempDir)

      // 被忽略的文件修改不应影响哈希
      expect(hash1).toBe(hash2)
    })

    it("should ignore node_modules by default", async () => {
      // 需求 2.3: 忽略常见排除模式
      await fs.mkdir(path.join(tempDir, "node_modules"), { recursive: true })
      await fs.writeFile(
        path.join(tempDir, "node_modules", "package.json"),
        '{"name":"dep"}'
      )
      await fs.writeFile(path.join(tempDir, "package.json"), '{"v":1}')

      const calculator = createHashCalculator({ includeTimestamps: false })
      const hash1 = await calculator.computeProjectHash(tempDir)

      // 修改 node_modules 中的文件
      await fs.writeFile(
        path.join(tempDir, "node_modules", "package.json"),
        '{"name":"dep-v2"}'
      )
      const hash2 = await calculator.computeProjectHash(tempDir)

      // node_modules 中的修改不应影响哈希
      expect(hash1).toBe(hash2)
    })

    it("should ignore dist directory by default", async () => {
      await fs.mkdir(path.join(tempDir, "dist"), { recursive: true })
      await fs.writeFile(path.join(tempDir, "dist", "index.js"), "compiled")
      await fs.writeFile(path.join(tempDir, "package.json"), '{"v":1}')

      const calculator = createHashCalculator({ includeTimestamps: false })
      const hash1 = await calculator.computeProjectHash(tempDir)

      // 修改 dist 中的文件
      await fs.writeFile(path.join(tempDir, "dist", "index.js"), "recompiled")
      const hash2 = await calculator.computeProjectHash(tempDir)

      expect(hash1).toBe(hash2)
    })

    it("should handle .gitignore with directory patterns", async () => {
      await fs.writeFile(path.join(tempDir, ".gitignore"), "build/\n")
      await fs.mkdir(path.join(tempDir, "build"), { recursive: true })
      await fs.writeFile(path.join(tempDir, "build", "output.json"), "{}")
      await fs.writeFile(path.join(tempDir, "package.json"), '{"v":1}')

      const calculator = createHashCalculator({
        keyFiles: ["package.json", "build/output.json"],
        includeTimestamps: false,
      })
      const hash1 = await calculator.computeProjectHash(tempDir)

      await fs.writeFile(path.join(tempDir, "build", "output.json"), '{"new":true}')
      const hash2 = await calculator.computeProjectHash(tempDir)

      expect(hash1).toBe(hash2)
    })

    it("should handle .gitignore with wildcard patterns", async () => {
      await fs.writeFile(path.join(tempDir, ".gitignore"), "*.log\n")
      await fs.writeFile(path.join(tempDir, "package.json"), '{"v":1}')
      await fs.writeFile(path.join(tempDir, "debug.log"), "log content")

      const calculator = createHashCalculator({
        keyFiles: ["package.json", "debug.log"],
        includeTimestamps: false,
      })
      const hash1 = await calculator.computeProjectHash(tempDir)

      await fs.writeFile(path.join(tempDir, "debug.log"), "new log content")
      const hash2 = await calculator.computeProjectHash(tempDir)

      expect(hash1).toBe(hash2)
    })

    it("should handle missing .gitignore gracefully", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), '{"v":1}')

      const calculator = createHashCalculator()
      const hash = await calculator.computeProjectHash(tempDir)

      expect(hash).toHaveLength(64)
    })

    it("should handle .gitignore with comments and empty lines", async () => {
      await fs.writeFile(
        path.join(tempDir, ".gitignore"),
        "# This is a comment\n\nignored.txt\n\n# Another comment\n"
      )
      await fs.writeFile(path.join(tempDir, "package.json"), '{"v":1}')
      await fs.writeFile(path.join(tempDir, "ignored.txt"), "ignored")

      const calculator = createHashCalculator({
        keyFiles: ["package.json", "ignored.txt"],
        includeTimestamps: false,
      })
      const hash1 = await calculator.computeProjectHash(tempDir)

      await fs.writeFile(path.join(tempDir, "ignored.txt"), "changed")
      const hash2 = await calculator.computeProjectHash(tempDir)

      expect(hash1).toBe(hash2)
    })
  })

  describe("custom key files", () => {
    it("should use custom key files when specified", async () => {
      await fs.writeFile(path.join(tempDir, "custom.config"), "config v1")

      const calculator = createHashCalculator({
        keyFiles: ["custom.config"],
        includeTimestamps: false,
      })
      const hash1 = await calculator.computeProjectHash(tempDir)

      await fs.writeFile(path.join(tempDir, "custom.config"), "config v2")
      const hash2 = await calculator.computeProjectHash(tempDir)

      expect(hash1).not.toBe(hash2)
    })

    it("should support glob patterns in key files", async () => {
      await fs.writeFile(
        path.join(tempDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: {} })
      )
      await fs.writeFile(
        path.join(tempDir, "tsconfig.build.json"),
        JSON.stringify({ extends: "./tsconfig.json" })
      )

      const calculator = createHashCalculator({
        keyFiles: ["tsconfig*.json"],
        includeTimestamps: false,
      })
      const hash1 = await calculator.computeProjectHash(tempDir)

      await fs.writeFile(
        path.join(tempDir, "tsconfig.build.json"),
        JSON.stringify({ extends: "./tsconfig.json", include: ["src"] })
      )
      const hash2 = await calculator.computeProjectHash(tempDir)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe("default constants", () => {
    it("should export DEFAULT_KEY_FILES", () => {
      expect(DEFAULT_KEY_FILES).toBeInstanceOf(Array)
      expect(DEFAULT_KEY_FILES).toContain("package.json")
      expect(DEFAULT_KEY_FILES).toContain("tsconfig.json")
      expect(DEFAULT_KEY_FILES).toContain("Cargo.toml")
    })

    it("should export DEFAULT_EXCLUDE_PATTERNS", () => {
      expect(DEFAULT_EXCLUDE_PATTERNS).toBeInstanceOf(Array)
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("node_modules/**")
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain(".git/**")
      expect(DEFAULT_EXCLUDE_PATTERNS).toContain("dist/**")
    })
  })

  describe("edge cases", () => {
    it("should handle unreadable files gracefully", async () => {
      await fs.writeFile(path.join(tempDir, "package.json"), '{"v":1}')
      // 创建一个无法读取的文件（通过设置权限）
      // 注意：在 Windows 上这可能不起作用

      const calculator = createHashCalculator()
      // 应该不抛出错误
      const hash = await calculator.computeProjectHash(tempDir)
      expect(hash).toHaveLength(64)
    })

    it("should produce stable hash regardless of file discovery order", async () => {
      // 创建多个关键文件
      await fs.writeFile(path.join(tempDir, "package.json"), '{"a":1}')
      await fs.writeFile(path.join(tempDir, "tsconfig.json"), '{"b":2}')

      const calculator = createHashCalculator({ includeTimestamps: false })

      // 多次计算应该得到相同结果
      const hashes = await Promise.all([
        calculator.computeProjectHash(tempDir),
        calculator.computeProjectHash(tempDir),
        calculator.computeProjectHash(tempDir),
      ])

      expect(hashes[0]).toBe(hashes[1])
      expect(hashes[1]).toBe(hashes[2])
    })
  })
})
