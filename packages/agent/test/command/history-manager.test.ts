/**
 * 历史管理器测试
 *
 * 需求: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import {
  createHistoryManager,
  type HistoryManager,
  DEFAULT_MAX_ENTRIES,
} from "../../src/command/history-manager"

// ============================================================================
// 测试辅助函数
// ============================================================================

let testDir: string
let historyFile: string
let manager: HistoryManager

async function setupTestDir(): Promise<void> {
  testDir = path.join(os.tmpdir(), `history-test-${Date.now()}`)
  await fs.mkdir(testDir, { recursive: true })
  historyFile = path.join(testDir, "history.json")
  manager = createHistoryManager({ historyFile })
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

describe("HistoryManager", () => {
  beforeEach(async () => {
    await setupTestDir()
  })

  afterEach(async () => {
    await cleanupTestDir()
  })

  describe("load()", () => {
    it("文件不存在时返回空数组", async () => {
      const entries = await manager.load()
      expect(entries).toEqual([])
    })

    it("加载已存在的历史文件", async () => {
      await fs.mkdir(path.dirname(historyFile), { recursive: true })
      await fs.writeFile(historyFile, JSON.stringify([
        { command: "/help", timestamp: Date.now() }
      ]))

      const entries = await manager.load()
      expect(entries.length).toBe(1)
      expect(entries[0].command).toBe("/help")
    })
  })

  describe("add()", () => {
    it("添加新历史条目", async () => {
      await manager.add("/help")
      const entries = await manager.load()
      expect(entries.length).toBe(1)
      expect(entries[0].command).toBe("/help")
    })

    it("去重连续相同命令", async () => {
      await manager.add("/help")
      await manager.add("/help")
      const entries = await manager.load()
      expect(entries.length).toBe(1)
    })

    it("不去重不同命令", async () => {
      await manager.add("/help")
      await manager.add("/exit")
      const entries = await manager.load()
      expect(entries.length).toBe(2)
    })

    it("记录执行结果", async () => {
      await manager.add("/help", true)
      const entries = await manager.load()
      expect(entries[0].success).toBe(true)
    })
  })

  describe("recent()", () => {
    it("获取最近 N 条历史", async () => {
      await manager.add("/cmd1")
      await manager.add("/cmd2")
      await manager.add("/cmd3")

      const recent = await manager.recent(2)
      expect(recent.length).toBe(2)
      expect(recent[0].command).toBe("/cmd2")
      expect(recent[1].command).toBe("/cmd3")
    })

    it("请求数量超过总数时返回全部", async () => {
      await manager.add("/cmd1")
      const recent = await manager.recent(10)
      expect(recent.length).toBe(1)
    })
  })

  describe("search()", () => {
    it("搜索匹配的命令", async () => {
      await manager.add("/help")
      await manager.add("/history")
      await manager.add("/exit")

      const results = await manager.search("h")
      expect(results.length).toBe(2)
    })

    it("支持通配符 *", async () => {
      await manager.add("/help")
      await manager.add("/history")
      await manager.add("/exit")

      const results = await manager.search("h*")
      expect(results.length).toBe(2)
    })

    it("大小写不敏感", async () => {
      await manager.add("/HELP")
      const results = await manager.search("help")
      expect(results.length).toBe(1)
    })

    it("无匹配返回空数组", async () => {
      await manager.add("/help")
      const results = await manager.search("xyz")
      expect(results).toEqual([])
    })
  })

  describe("clear()", () => {
    it("清除所有历史", async () => {
      await manager.add("/help")
      await manager.add("/exit")
      await manager.clear()

      const entries = await manager.load()
      expect(entries).toEqual([])
    })
  })

  describe("maxEntries", () => {
    it("超过最大条目数时截断", async () => {
      const smallManager = createHistoryManager({
        historyFile,
        maxEntries: 3,
      })

      await smallManager.add("/cmd1")
      await smallManager.add("/cmd2")
      await smallManager.add("/cmd3")
      await smallManager.add("/cmd4")

      const entries = await smallManager.load()
      expect(entries.length).toBe(3)
      expect(entries[0].command).toBe("/cmd2") // 最旧的被删除
    })
  })
})


// ============================================================================
// 属性测试
// ============================================================================

describe("历史属性测试", () => {
  beforeEach(async () => {
    await setupTestDir()
  })

  afterEach(async () => {
    await cleanupTestDir()
  })

  /**
   * 属性 15: 历史追加带去重
   * 验证需求: 6.2
   */
  describe("属性 15: 历史追加带去重", () => {
    it("连续相同命令只保留一条", async () => {
      let testIndex = 0
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^\/[a-z]+$/),
          fc.integer({ min: 2, max: 5 }),
          async (command, repeatCount) => {
            // 每次测试使用唯一的文件
            const uniqueFile = path.join(testDir, `history-${testIndex++}.json`)
            const testManager = createHistoryManager({ historyFile: uniqueFile })

            for (let i = 0; i < repeatCount; i++) {
              await testManager.add(command)
            }

            const entries = await testManager.load()
            return entries.length === 1 && entries[0].command === command
          }
        ),
        { numRuns: 20 }
      )
    })
  })

  /**
   * 属性 16: 历史最大条目数
   * 验证需求: 6.3
   */
  describe("属性 16: 历史最大条目数", () => {
    it("历史条目数不超过最大值", async () => {
      let testIndex = 0
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 20 }),
          fc.integer({ min: 3, max: 10 }),
          async (addCount, maxEntries) => {
            const uniqueFile = path.join(testDir, `history-max-${testIndex++}.json`)
            const testManager = createHistoryManager({
              historyFile: uniqueFile,
              maxEntries,
              deduplicate: false, // 禁用去重以便测试
            })

            for (let i = 0; i < addCount; i++) {
              await testManager.add(`/cmd${i}`)
            }

            const entries = await testManager.load()
            return entries.length <= maxEntries
          }
        ),
        { numRuns: 20 }
      )
    })
  })

  /**
   * 属性 17: 历史模式搜索
   * 验证需求: 6.5
   */
  describe("属性 17: 历史模式搜索", () => {
    it("搜索结果应该包含匹配的命令", async () => {
      let testIndex = 0
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-z]{3,6}$/),
          async (keyword) => {
            const uniqueFile = path.join(testDir, `history-search-${testIndex++}.json`)
            const testManager = createHistoryManager({ historyFile: uniqueFile })

            // 添加包含关键词的命令
            await testManager.add(`/${keyword}`)
            await testManager.add("/other")

            const results = await testManager.search(keyword)
            return results.some(r => r.command.includes(keyword))
          }
        ),
        { numRuns: 20 }
      )
    })

    it("搜索结果不应包含不匹配的命令", async () => {
      let testIndex = 0
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-z]{3,6}$/),
          async (keyword) => {
            const uniqueFile = path.join(testDir, `history-nomatch-${testIndex++}.json`)
            const testManager = createHistoryManager({ historyFile: uniqueFile })

            // 添加不包含关键词的命令
            await testManager.add("/xyz123")

            const results = await testManager.search(keyword)
            // 如果关键词不在命令中，结果应该为空
            if (!"/xyz123".toLowerCase().includes(keyword.toLowerCase())) {
              return results.length === 0
            }
            return true
          }
        ),
        { numRuns: 20 }
      )
    })
  })
})
