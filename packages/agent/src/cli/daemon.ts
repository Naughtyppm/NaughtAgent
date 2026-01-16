/**
 * NaughtyAgent Daemon - 后台服务
 *
 * 提供 HTTP API 和 WebSocket，支持多客户端连接
 *
 * 架构：
 * - Daemon 是独立后台进程
 * - CLI 和 VS Code 都是客户端
 * - 会话按 cwd 隔离，支持共享
 */

import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { createServer } from "../server"
import type { ServerConfig } from "../server/types"

// ============================================================================
// 配置
// ============================================================================

const DEFAULT_PORT = 31415  // 用 π 的前几位，好记又不容易冲突
const NAUGHT_DIR = path.join(os.homedir(), ".naughtyagent")
const PID_FILE = path.join(NAUGHT_DIR, "daemon.pid")
const LOG_FILE = path.join(NAUGHT_DIR, "daemon.log")
const PORT_FILE = path.join(NAUGHT_DIR, "daemon.port")
const CONFIG_FILE = path.join(NAUGHT_DIR, "config.json")

export interface DaemonConfig {
  port: number
  host: string
}

export interface DaemonFullConfig extends DaemonConfig {
  apiKey?: string
  claudeApiKey?: string
  claudeBaseURL?: string
  autoConfirm?: boolean
}

export interface DaemonStatus {
  running: boolean
  pid?: number
  port?: number
  host?: string
  url?: string
  uptime?: number        // 运行时长（秒）
  sessions?: number      // 活跃会话数
  version?: string
}

// ============================================================================
// 工具函数
// ============================================================================

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function writePidFile(pid: number, port: number): void {
  ensureDir(NAUGHT_DIR)
  fs.writeFileSync(PID_FILE, String(pid))
  fs.writeFileSync(PORT_FILE, String(port))
}

function readPidFile(): { pid: number; port: number } | null {
  try {
    if (fs.existsSync(PID_FILE) && fs.existsSync(PORT_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10)
      const port = parseInt(fs.readFileSync(PORT_FILE, "utf-8").trim(), 10)
      return { pid, port }
    }
  } catch {
    // ignore
  }
  return null
}

function removePidFile(): void {
  try {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE)
    if (fs.existsSync(PORT_FILE)) fs.unlinkSync(PORT_FILE)
  } catch {
    // ignore
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function log(message: string): void {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] ${message}\n`
  console.log(message)

  try {
    ensureDir(NAUGHT_DIR)
    fs.appendFileSync(LOG_FILE, line)
  } catch {
    // ignore
  }
}

/**
 * 加载配置文件
 */
function loadConfig(): Partial<DaemonFullConfig> {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, "utf-8")
      return JSON.parse(content)
    }
  } catch {
    // ignore
  }
  return {}
}

/**
 * 保存配置文件
 */
export function saveConfig(config: Partial<DaemonFullConfig>): void {
  ensureDir(NAUGHT_DIR)
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

// ============================================================================
// Daemon 控制
// ============================================================================

// 记录启动时间，用于计算 uptime
let daemonStartTime: number | null = null
let serverInstance: ReturnType<typeof createServer> | null = null

/**
 * 启动 Daemon
 */
export async function startDaemon(config?: Partial<DaemonFullConfig>): Promise<void> {
  const savedConfig = loadConfig()
  const port = config?.port || savedConfig.port || DEFAULT_PORT
  const host = config?.host || savedConfig.host || "127.0.0.1"

  // 检查是否已运行
  const existing = readPidFile()
  if (existing && isProcessRunning(existing.pid)) {
    console.log(`✓ Daemon already running`)
    console.log(`  PID:  ${existing.pid}`)
    console.log(`  URL:  http://${host}:${existing.port}`)
    return
  }

  // 清理旧的 PID 文件
  removePidFile()

  log(`Starting NaughtyAgent Daemon...`)

  // 获取 API Key
  const claudeApiKey = config?.claudeApiKey || savedConfig.claudeApiKey || process.env.ANTHROPIC_API_KEY || ""
  const claudeBaseURL = config?.claudeBaseURL || savedConfig.claudeBaseURL || process.env.ANTHROPIC_BASE_URL

  const serverConfig: ServerConfig = {
    port,
    host,
    apiKey: config?.apiKey || savedConfig.apiKey || "",  // 服务认证 key（可选）
    claudeApiKey,
    claudeBaseURL,
    cors: true,
    autoConfirm: config?.autoConfirm || savedConfig.autoConfirm || false,
  }

  try {
    serverInstance = createServer(serverConfig)

    await serverInstance.start()

    daemonStartTime = Date.now()
    writePidFile(process.pid, port)

    console.log(``)
    console.log(`  ╭─────────────────────────────────────╮`)
    console.log(`  │       NaughtyAgent Daemon            │`)
    console.log(`  ├─────────────────────────────────────┤`)
    console.log(`  │  Status:  Running                   │`)
    console.log(`  │  PID:     ${String(process.pid).padEnd(27)}│`)
    console.log(`  │  URL:     http://${host}:${port}`.padEnd(40) + `│`)
    console.log(`  ╰─────────────────────────────────────╯`)
    console.log(``)
    log(`Daemon started (PID: ${process.pid}, Port: ${port})`)

    // 优雅关闭
    const shutdown = async () => {
      log("Shutting down...")
      removePidFile()
      if (serverInstance) {
        await serverInstance.stop()
      }
      log("Daemon stopped")
      process.exit(0)
    }

    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)

  } catch (err) {
    const error = err as NodeJS.ErrnoException
    if (error.code === "EADDRINUSE") {
      console.error(`✗ Port ${port} is already in use`)
      console.error(`  Try: naughtagent daemon start --port ${port + 1}`)
      process.exit(1)
    } else {
      console.error(`✗ Failed to start: ${err}`)
      process.exit(1)
    }
  }
}

/**
 * 停止 Daemon
 */
export function stopDaemon(): void {
  const info = readPidFile()

  if (!info) {
    console.log("✓ Daemon is not running")
    return
  }

  if (!isProcessRunning(info.pid)) {
    console.log("✓ Daemon is not running (cleaning stale files)")
    removePidFile()
    return
  }

  console.log(`Stopping daemon (PID: ${info.pid})...`)

  try {
    process.kill(info.pid, "SIGTERM")

    let attempts = 0
    const check = setInterval(() => {
      attempts++
      if (!isProcessRunning(info.pid)) {
        clearInterval(check)
        removePidFile()
        console.log("✓ Daemon stopped")
      } else if (attempts > 10) {
        clearInterval(check)
        try { process.kill(info.pid, "SIGKILL") } catch {}
        removePidFile()
        console.log("✓ Daemon killed")
      }
    }, 500)
  } catch (err) {
    console.error(`✗ Failed to stop: ${err}`)
    removePidFile()
  }
}

/**
 * 重启 Daemon
 */
export async function restartDaemon(config?: Partial<DaemonFullConfig>): Promise<void> {
  stopDaemon()
  await new Promise(r => setTimeout(r, 1000))
  await startDaemon(config)
}

/**
 * 获取 Daemon 状态
 */
export function getDaemonStatus(): DaemonStatus {
  const info = readPidFile()

  if (!info) {
    return { running: false }
  }

  if (!isProcessRunning(info.pid)) {
    removePidFile()
    return { running: false }
  }

  // 计算 uptime（仅当前进程有效）
  const uptime = daemonStartTime ? Math.floor((Date.now() - daemonStartTime) / 1000) : undefined

  return {
    running: true,
    pid: info.pid,
    port: info.port,
    host: "127.0.0.1",
    url: `http://127.0.0.1:${info.port}`,
    version: "0.1.0",
    uptime,
    sessions: serverInstance?.getSessionCount(),
  }
}

/**
 * 获取详细状态（通过 HTTP API）
 */
export async function getDaemonStatusDetailed(): Promise<DaemonStatus> {
  const basic = getDaemonStatus()

  if (!basic.running || !basic.url) {
    return basic
  }

  try {
    // 调用 /health 获取详细信息
    const response = await fetch(`${basic.url}/health`)
    if (response.ok) {
      const data = await response.json() as { status: string; version: string }
      basic.version = data.version
    }
  } catch {
    // 服务可能还在启动中
  }

  return basic
}

/**
 * 打印状态
 */
export async function printStatus(): Promise<void> {
  const status = await getDaemonStatusDetailed()

  console.log(``)
  if (status.running) {
    console.log(`  ╭─────────────────────────────────────╮`)
    console.log(`  │       NaughtyAgent Daemon            │`)
    console.log(`  ├─────────────────────────────────────┤`)
    console.log(`  │  Status:  Running ✓                 │`)
    console.log(`  │  PID:     ${String(status.pid).padEnd(27)}│`)
    console.log(`  │  URL:     ${status.url}`.padEnd(40) + `│`)
    console.log(`  │  Version: ${(status.version || "unknown").padEnd(27)}│`)
    console.log(`  ╰─────────────────────────────────────╯`)
  } else {
    console.log(`  ╭─────────────────────────────────────╮`)
    console.log(`  │       NaughtyAgent Daemon            │`)
    console.log(`  ├─────────────────────────────────────┤`)
    console.log(`  │  Status:  Stopped                   │`)
    console.log(`  │                                     │`)
    console.log(`  │  Run: naughtagent daemon start      │`)
    console.log(`  ╰─────────────────────────────────────╯`)
  }
  console.log(``)
}

/**
 * 确保 Daemon 运行
 */
export async function ensureDaemon(): Promise<DaemonStatus> {
  let status = getDaemonStatus()

  if (status.running) {
    return status
  }

  // 在后台启动
  const { spawn } = await import("child_process")

  // 找到当前脚本路径
  const scriptPath = process.argv[1]

  const child = spawn(process.execPath, [scriptPath, "daemon", "start"], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  })
  child.unref()

  // 等待启动
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 300))
    status = getDaemonStatus()
    if (status.running) {
      return status
    }
  }

  throw new Error("Failed to start daemon")
}

/**
 * 获取配置目录
 */
export function getConfigDir(): string {
  return NAUGHT_DIR
}

/**
 * 获取默认端口
 */
export function getDefaultPort(): number {
  return DEFAULT_PORT
}
