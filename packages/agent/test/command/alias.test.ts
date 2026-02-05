/**
 * 别名管理器测试
 *
 * 需求: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import {
  createAliasManager,
  type AliasManager,
  DEFAULT_BUILTIN_COMMANDS,
} from "../../src/command/alias"

// ============================================================================
// 测试辅助函数
// ============================================================================

let testDir: string
let aliasFile: string
let manager: AliasManager

async function setupTestDir(): Promise<void> {
  testDir = path.join(os.tmpdir(), `alias-test-${Date.now()}`)
  await fs.mkdir(testDir, { recursive: true })
  aliasFile = path.join(testDir, "aliases.json")
  manager = createAliasManager({ aliasFile })
}

async function cleanupTestDir(): Promise<void> {
  try {
    await fs.rm(testDir, { recursive: true, force: true })
  } catch {
    // 忽略清理错误
  }
}

// ============================================================================
// 单元测试
// ============================================================================

describe("AliasManager", () => {
  beforeEach(async () => {
    await setupTestDir()
  })

  afterEach(async () => {
    await cleanupTestDir()
  })

  describe("load()", () => {
    it("文件不存在时返回空 Map", async () => {
      const aliases = await manager.load()
      expect(aliases.size).toBe(0)
    })

    it("加载已存在的别名文件", async () => {
      // 先创建别名文件
      await fs.mkdir(path.dirname(aliasFile), { recursive: true })
      await fs.writeFile(aliasFile, JSON.stringify({
        "ll": { name: "ll", command: "/list -l", createdAt: Date.now() }
      }))

      const aliases = await manager.load()
      expect(aliases.size).toBe(1)
      expect(aliases.get("ll")?.command).toBe("/list -l")
    })
  })

  describe("add()", () => {
    it("添加新别名", async () => {
      const result = await manager.add("ll", "/list -l", "List files")
      expect(result).toBe(true)

      const aliases = await manager.load()
      expect(aliases.has("ll")).toBe(true)
    })

    it("拒绝与内置命令冲突的别名", async () => {
      const result = await manager.add("help", "/custom-help")
      expect(result).toBe(false)
    })

    it("别名持久化到文件", async () => {
      await manager.add("ll", "/list -l")

      // 创建新的管理器实例
      const newManager = createAliasManager({ aliasFile })
      const aliases = await newManager.load()
      expect(aliases.has("ll")).toBe(true)
    })
  })

  describe("remove()", () => {
    it("移除已存在的别名", async () => {
      await manager.add("ll", "/list -l")
      const result = await manager.remove("ll")
      expect(result).toBe(true)

      const aliases = await manager.load()
      expect(aliases.has("ll")).toBe(false)
    })

    it("移除不存在的别名返回 false", async () => {
      const result = await manager.remove("nonexistent")
      expect(result).toBe(false)
    })
  })

  describe("resolve()", () => {
    it("解析已存在的别名", async () => {
      await manager.add("ll", "/list -l")
      const command = await manager.resolve("ll")
      expect(command).toBe("/list -l")
    })

    it("解析不存在的别名返回 null", async () => {
      const command = await manager.resolve("nonexistent")
      expect(command).toBeNull()
    })
  })

  describe("hasConflict()", () => {
    it("检测与内置命令的冲突", () => {
      expect(manager.hasConflict("help")).toBe(true)
      expect(manager.hasConflict("exit")).toBe(true)
      expect(manager.hasConflict("history")).toBe(true)
    })

    it("非内置命令不冲突", () => {
      expect(manager.hasConflict("ll")).toBe(false)
      expect(manager.hasConflict("myalias")).toBe(false)
    })

    it("大小写不敏感", () => {
      expect(manager.hasConflict("HELP")).toBe(true)
      expect(manager.hasConflict("Help")).toBe(true)
    })
  })

  describe("getAll()", () => {
    it("获取所有别名", async () => {
      await manager.add("ll", "/list -l")
      await manager.add("la", "/list -a")

      const all = await manager.getAll()
      expect(all.length).toBe(2)
    })

    it("空别名返回空数组", async () => {
      const all = await manager.getAll()
      expect(all).toEqual([])
    })
  })
})


// ============================================================================
// 属性测试
// ============================================================================

describe("别名属性测试", () => {
  beforeEach(async () => {
    await setupTestDir()
  })

  afterEach(async () => {
    await cleanupTestDir()
  })

  /**
   * 属性 12: 别名在查找前解析
   * 验证需求: 5.2
   */
  describe("属性 12: 别名在查找前解析", () => {
    it("添加的别名应该能被解析", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-z][a-z0-9]{2,10}$/),
          fc.stringMatching(/^\/[a-z]+( -[a-z])?$/),
          async (name, command) => {
            // 跳过内置命令
            if (DEFAULT_BUILTIN_COMMANDS.includes(name.toLowerCase())) {
              return true
            }

            const testManager = createAliasManager({ aliasFile })
            const added = await testManager.add(name, command)
            
            if (!added) return true // 冲突时跳过

            const resolved = await testManager.resolve(name)
            return resolved === command
          }
        ),
        { numRuns: 30 }
      )
    })
  })

  /**
   * 属性 13: 别名冲突拒绝
   * 验证需求: 5.6
   */
  describe("属性 13: 别名冲突拒绝", () => {
    it("内置命令名称应该被拒绝", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...DEFAULT_BUILTIN_COMMANDS),
          async (builtinName) => {
            const testManager = createAliasManager({ aliasFile })
            const result = await testManager.add(builtinName, "/some-command")
            return result === false
          }
        ),
        { numRuns: 20 }
      )
    })
  })

  /**
   * 属性 14: 别名持久化
   * 验证需求: 5.7
   */
  describe("属性 14: 别名持久化", () => {
    it("添加的别名应该在重新加载后仍然存在", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-z][a-z0-9]{2,8}$/),
          fc.stringMatching(/^\/[a-z]+$/),
          async (name, command) => {
            // 跳过内置命令
            if (DEFAULT_BUILTIN_COMMANDS.includes(name.toLowerCase())) {
              return true
            }

            // 使用第一个管理器添加
            const manager1 = createAliasManager({ aliasFile })
            const added = await manager1.add(name, command)
            
            if (!added) return true

            // 使用新的管理器实例加载
            const manager2 = createAliasManager({ aliasFile })
            const aliases = await manager2.load()
            
            return aliases.has(name) && aliases.get(name)?.command === command
          }
        ),
        { numRuns: 20 }
      )
    })
  })
})
