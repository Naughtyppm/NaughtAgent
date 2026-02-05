/**
 * IndexCache 增强功能测试
 *
 * 测试缓存统计和增量更新功能
 * 需求: 3.1, 3.2, 3.3
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fc from "fast-check"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import {
  createIndexCache,
  type IndexCache,
  type CacheStats,
  type FileChange,
  _isKeyFile,
  _createInitialStats,
  _updateHitRate,
} from "../../src/context/index-cache"

// ============================================================================
// 测试辅助函数
// ============================================================================

let testDir: string
let cache: IndexCache

async function setupTestDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `index-cache-test-${Date.now()}`)
  await fs.mkdir(dir, { recursive: true })
  
  // 创建基本项目结构
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "test" }))
  await fs.writeFile(path.join(dir, "index.ts"), "export const x = 1")
  await fs.mkdir(path.join(dir, "src"), { recursive: true })
  await fs.writeFile(path.join(dir, "src", "main.ts"), "console.log('hello')")
  
  return dir
}

async function cleanupTestDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true })
  } catch {
    // 忽略清理错误
  }
}

// ============================================================================
// 单元测试
// ============================================================================

describe("CacheStats", () => {
  beforeEach(async () => {
    testDir = await setupTestDir()
    cache = createIndexCache({
      cacheDir: path.join(testDir, ".naught", "cache"),
      cacheFile: "project-index.json",
      ttl: 24 * 60 * 60 * 1000,
    })
  })

  afterEach(async () => {
    await cleanupTestDir(testDir)
  })

  describe("getStats()", () => {
    it("初始统计应该为零", () => {
      const stats = cache.getStats()
      
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.hitRate).toBe(0)
      expect(stats.incrementalUpdates).toBe(0)
      expect(stats.fullRebuilds).toBe(0)
    })

    it("首次获取索引应该记录 miss 和 fullRebuild", async () => {
      await cache.getOrCreate(testDir)
      const stats = cache.getStats()
      
      expect(stats.misses).toBe(1)
      expect(stats.fullRebuilds).toBe(1)
      expect(stats.hits).toBe(0)
    })

    it("第二次获取索引应该记录 hit", async () => {
      await cache.getOrCreate(testDir)
      await cache.getOrCreate(testDir)
      const stats = cache.getStats()
      
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBe(0.5)
    })
  })

  describe("resetStats()", () => {
    it("重置后统计应该归零", async () => {
      await cache.getOrCreate(testDir)
      await cache.getOrCreate(testDir)
      
      cache.resetStats()
      const stats = cache.getStats()
      
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.hitRate).toBe(0)
    })
  })
})

describe("updateIncremental()", () => {
  beforeEach(async () => {
    testDir = await setupTestDir()
    cache = createIndexCache({
      cacheDir: path.join(testDir, ".naught", "cache"),
      cacheFile: "project-index.json",
      ttl: 24 * 60 * 60 * 1000,
    })
  })

  afterEach(async () => {
    await cleanupTestDir(testDir)
  })

  it("无缓存时返回 null", async () => {
    const changes: FileChange[] = [
      { path: "new-file.ts", type: "added", timestamp: Date.now() },
    ]
    
    const result = await cache.updateIncremental(changes)
    expect(result).toBeNull()
  })

  it("有缓存时应该更新索引", async () => {
    // 先创建缓存
    await cache.getOrCreate(testDir)
    
    // 添加新文件
    const newFilePath = path.join(testDir, "new-file.ts")
    await fs.writeFile(newFilePath, "export const y = 2")
    
    const changes: FileChange[] = [
      { path: "new-file.ts", type: "added", timestamp: Date.now() },
    ]
    
    const result = await cache.updateIncremental(changes)
    expect(result).not.toBeNull()
    expect(result!.updatedAt).toBeGreaterThan(0)
  })

  it("删除文件应该从关键文件列表中移除", async () => {
    await cache.getOrCreate(testDir)
    
    const changes: FileChange[] = [
      { path: "package.json", type: "deleted", timestamp: Date.now() },
    ]
    
    const result = await cache.updateIncremental(changes)
    expect(result).not.toBeNull()
    expect(result!.structure.keyFiles).not.toContain("package.json")
  })

  it("变更过多时返回 null（建议完整重建）", async () => {
    await cache.getOrCreate(testDir)
    
    // 创建超过 50 个变更
    const changes: FileChange[] = Array.from({ length: 51 }, (_, i) => ({
      path: `file-${i}.ts`,
      type: "added" as const,
      timestamp: Date.now(),
    }))
    
    const result = await cache.updateIncremental(changes)
    expect(result).toBeNull()
  })

  it("增量更新应该更新统计", async () => {
    await cache.getOrCreate(testDir)
    
    const changes: FileChange[] = [
      { path: "new-file.ts", type: "added", timestamp: Date.now() },
    ]
    
    await cache.updateIncremental(changes)
    const stats = cache.getStats()
    
    expect(stats.incrementalUpdates).toBe(1)
  })
})

describe("_isKeyFile()", () => {
  it("识别 package.json 为关键文件", () => {
    expect(_isKeyFile("package.json")).toBe(true)
    expect(_isKeyFile("src/package.json")).toBe(true)
  })

  it("识别 tsconfig.json 为关键文件", () => {
    expect(_isKeyFile("tsconfig.json")).toBe(true)
  })

  it("识别 README.md 为关键文件（不区分大小写）", () => {
    expect(_isKeyFile("README.md")).toBe(true)
    expect(_isKeyFile("readme.md")).toBe(true)
  })

  it("普通源文件不是关键文件", () => {
    expect(_isKeyFile("src/index.ts")).toBe(false)
    expect(_isKeyFile("lib/utils.js")).toBe(false)
  })
})

describe("_createInitialStats()", () => {
  it("创建初始统计对象", () => {
    const stats = _createInitialStats()
    
    expect(stats.hits).toBe(0)
    expect(stats.misses).toBe(0)
    expect(stats.hitRate).toBe(0)
    expect(stats.incrementalUpdates).toBe(0)
    expect(stats.fullRebuilds).toBe(0)
    expect(stats.lastAccessTime).toBeNull()
    expect(stats.lastUpdateTime).toBeNull()
  })
})

describe("_updateHitRate()", () => {
  it("正确计算命中率", () => {
    const stats = _createInitialStats()
    stats.hits = 3
    stats.misses = 1
    
    _updateHitRate(stats)
    
    expect(stats.hitRate).toBe(0.75)
  })

  it("总数为零时命中率为零", () => {
    const stats = _createInitialStats()
    
    _updateHitRate(stats)
    
    expect(stats.hitRate).toBe(0)
  })
})


// ============================================================================
// 属性测试
// ============================================================================

describe("缓存增强属性测试", () => {
  /**
   * 属性 7: 缓存统计准确性
   * 验证需求: 3.2
   */
  describe("属性 7: 缓存统计准确性", () => {
    it("命中率应该等于 hits / (hits + misses)", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          (hits, misses) => {
            const stats = _createInitialStats()
            stats.hits = hits
            stats.misses = misses
            
            _updateHitRate(stats)
            
            const total = hits + misses
            const expectedRate = total > 0 ? hits / total : 0
            
            return Math.abs(stats.hitRate - expectedRate) < 0.0001
          }
        ),
        { numRuns: 100 }
      )
    })

    it("命中率应该在 0 到 1 之间", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          (hits, misses) => {
            const stats = _createInitialStats()
            stats.hits = hits
            stats.misses = misses
            
            _updateHitRate(stats)
            
            return stats.hitRate >= 0 && stats.hitRate <= 1
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  /**
   * 属性 8: 增量更新正确性
   * 验证需求: 3.1
   */
  describe("属性 8: 增量更新正确性", () => {
    it("关键文件检测应该一致", () => {
      const keyFilePatterns = [
        "package.json",
        "tsconfig.json",
        "README.md",
        "Cargo.toml",
        "go.mod",
        "requirements.txt",
        "pyproject.toml",
        "Makefile",
        "Dockerfile",
        ".gitignore",
      ]

      fc.assert(
        fc.property(
          fc.constantFrom(...keyFilePatterns),
          fc.constantFrom("", "src/", "lib/", "packages/app/"),
          (filename, prefix) => {
            const fullPath = prefix + filename
            return _isKeyFile(fullPath) === true
          }
        ),
        { numRuns: 50 }
      )
    })

    it("非关键文件应该被正确识别", () => {
      const nonKeyFiles = [
        "index.ts",
        "main.js",
        "utils.py",
        "helper.go",
        "service.rs",
        "component.tsx",
      ]

      fc.assert(
        fc.property(
          fc.constantFrom(...nonKeyFiles),
          fc.constantFrom("", "src/", "lib/"),
          (filename, prefix) => {
            const fullPath = prefix + filename
            return _isKeyFile(fullPath) === false
          }
        ),
        { numRuns: 50 }
      )
    })
  })
})
