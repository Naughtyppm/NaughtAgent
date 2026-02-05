/**
 * Daemon 测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"

// Mock fs 模块
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof fs>("fs")
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
  }
})

// 导入被测模块
import {
  getDaemonStatus,
  getDefaultPort,
  getConfigDir,
  saveConfig,
  type DaemonStatus,
} from "../../src/cli/daemon"

describe("Daemon", () => {
  const NAUGHT_DIR = path.join(os.homedir(), ".naughtyagent")
  const PID_FILE = path.join(NAUGHT_DIR, "daemon.pid")
  const PORT_FILE = path.join(NAUGHT_DIR, "daemon.port")
  const CONFIG_FILE = path.join(NAUGHT_DIR, "config.json")

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("getDefaultPort", () => {
    it("should return default port 31415", () => {
      expect(getDefaultPort()).toBe(31415)
    })
  })

  describe("getConfigDir", () => {
    it("should return ~/.naughtagent", () => {
      expect(getConfigDir()).toBe(NAUGHT_DIR)
    })
  })

  describe("getDaemonStatus", () => {
    it("should return not running when no PID file", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const status = getDaemonStatus()

      expect(status.running).toBe(false)
      expect(status.pid).toBeUndefined()
    })

    it("should return not running when PID file exists but process is dead", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if (filePath === PID_FILE) return "99999999" // 不存在的 PID
        if (filePath === PORT_FILE) return "31415"
        return ""
      })

      const status = getDaemonStatus()

      // 进程不存在时应该返回 not running
      expect(status.running).toBe(false)
    })
  })

  describe("saveConfig", () => {
    it("should save config to file", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)

      saveConfig({ port: 8080, host: "0.0.0.0" })

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        CONFIG_FILE,
        JSON.stringify({ port: 8080, host: "0.0.0.0" }, null, 2)
      )
    })

    it("should create directory if not exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      saveConfig({ port: 8080 })

      expect(fs.mkdirSync).toHaveBeenCalledWith(NAUGHT_DIR, { recursive: true })
    })
  })

  describe("DaemonStatus type", () => {
    it("should have correct structure", () => {
      const status: DaemonStatus = {
        running: true,
        pid: 12345,
        port: 31415,
        host: "127.0.0.1",
        url: "http://127.0.0.1:31415",
        uptime: 100,
        sessions: 2,
        version: "0.1.0",
      }

      expect(status.running).toBe(true)
      expect(status.pid).toBe(12345)
      expect(status.port).toBe(31415)
      expect(status.uptime).toBe(100)
      expect(status.sessions).toBe(2)
    })
  })
})
