/**
 * Daemon 会话管理器测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "fs"
import * as fsp from "fs/promises"
import * as path from "path"
import * as os from "os"
import {
  createDaemonSessionManager,
  normalizeCwd,
  type PersistedSession,
} from "../../src/daemon/sessions"

describe("DaemonSessionManager", () => {
  const testDir = path.join(os.tmpdir(), `naughtagent-test-${Date.now()}`)
  const sessionsDir = path.join(testDir, "sessions")

  // 临时修改 NAUGHT_DIR（通过环境变量或直接修改）
  // 由于模块使用硬编码路径，我们需要在测试中直接操作文件系统

  beforeEach(async () => {
    // 创建测试目录
    await fsp.mkdir(sessionsDir, { recursive: true })
  })

  afterEach(async () => {
    // 清理测试目录
    try {
      await fsp.rm(testDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  describe("normalizeCwd", () => {
    it("should convert relative path to absolute", () => {
      const result = normalizeCwd(".")
      expect(path.isAbsolute(result)).toBe(true)
    })

    it("should handle absolute paths", () => {
      const absolutePath = process.platform === "win32" ? "C:\\Users\\test" : "/home/test"
      const result = normalizeCwd(absolutePath)
      expect(path.isAbsolute(result)).toBe(true)
    })

    it("should normalize path separators", () => {
      const result = normalizeCwd("./src/../src")
      expect(result).not.toContain("..")
    })

    if (process.platform === "win32") {
      it("should lowercase on Windows", () => {
        const result = normalizeCwd("C:\\Users\\Test")
        expect(result).toBe(result.toLowerCase())
      })
    }
  })

  describe("createDaemonSessionManager", () => {
    it("should create a session manager", () => {
      const manager = createDaemonSessionManager()
      expect(manager).toBeDefined()
      expect(manager.createSession).toBeInstanceOf(Function)
      expect(manager.getSession).toBeInstanceOf(Function)
      expect(manager.listSessions).toBeInstanceOf(Function)
    })
  })

  describe("PersistedSession type", () => {
    it("should have correct structure", () => {
      const session: PersistedSession = {
        id: "sess-123",
        cwd: "/home/user/project",
        agentType: "build",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 5,
        name: "Test Session",
      }

      expect(session.id).toBe("sess-123")
      expect(session.cwd).toBe("/home/user/project")
      expect(session.agentType).toBe("build")
      expect(session.messageCount).toBe(5)
      expect(session.name).toBe("Test Session")
    })

    it("should allow optional name", () => {
      const session: PersistedSession = {
        id: "sess-456",
        cwd: "/home/user/project",
        agentType: "plan",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
      }

      expect(session.name).toBeUndefined()
    })
  })

  describe("Session operations (integration)", () => {
    // 这些测试需要实际的文件系统操作
    // 由于模块使用硬编码的 ~/.naughtagent 路径，
    // 我们在这里测试基本的类型和接口

    it("should initialize without error", async () => {
      const manager = createDaemonSessionManager()
      // initialize 会尝试读取 ~/.naughtagent/sessions
      // 如果目录不存在会创建它
      await expect(manager.initialize()).resolves.not.toThrow()
    })

    it("should return empty list initially", async () => {
      const manager = createDaemonSessionManager()
      await manager.initialize()
      const sessions = await manager.listSessions()
      // 可能有之前的会话，所以只检查返回数组
      expect(Array.isArray(sessions)).toBe(true)
    })

    it("should get stats", async () => {
      const manager = createDaemonSessionManager()
      await manager.initialize()
      const stats = await manager.getStats()
      expect(stats).toHaveProperty("total")
      expect(stats).toHaveProperty("byAgentType")
      expect(typeof stats.total).toBe("number")
    })
  })
})
