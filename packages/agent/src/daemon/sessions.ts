/**
 * Daemon 会话管理器
 *
 * 全局会话管理，支持：
 * - 按 cwd 路由会话
 * - 会话持久化到 ~/.naughtagent/sessions/
 * - 多客户端共享会话
 */

import * as fs from "fs"
import * as fsp from "fs/promises"
import * as path from "path"
import * as os from "os"
import type { AgentType } from "../agent"

// ============================================================================
// 配置
// ============================================================================

const NAUGHT_DIR = path.join(os.homedir(), ".naughtagent")
const SESSIONS_DIR = path.join(NAUGHT_DIR, "sessions")

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 持久化的会话元数据
 */
export interface PersistedSession {
  /** 会话 ID */
  id: string
  /** 工作目录（规范化后的绝对路径） */
  cwd: string
  /** Agent 类型 */
  agentType: AgentType
  /** 创建时间 */
  createdAt: number
  /** 最后更新时间 */
  updatedAt: number
  /** 会话名称（可选） */
  name?: string
  /** 消息数量 */
  messageCount: number
}

/**
 * 会话索引（快速查找）
 */
interface SessionIndex {
  /** 按 ID 索引 */
  byId: Map<string, PersistedSession>
  /** 按 cwd 索引（一个 cwd 可能有多个会话） */
  byCwd: Map<string, string[]>
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 确保目录存在
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * 规范化路径（统一格式，便于比较）
 */
export function normalizeCwd(cwd: string): string {
  // 转为绝对路径
  const absolute = path.resolve(cwd)
  // Windows 下统一为小写（路径不区分大小写）
  if (process.platform === "win32") {
    return absolute.toLowerCase()
  }
  return absolute
}

/**
 * 生成会话 ID
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `sess-${timestamp}-${random}`
}

/**
 * 获取会话目录
 */
function getSessionDir(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId)
}

/**
 * 获取会话元数据文件路径
 */
function getMetaPath(sessionId: string): string {
  return path.join(getSessionDir(sessionId), "meta.json")
}

/**
 * 获取会话消息文件路径
 */
function getMessagesPath(sessionId: string): string {
  return path.join(getSessionDir(sessionId), "messages.jsonl")
}

// ============================================================================
// 会话管理器
// ============================================================================

/**
 * 创建 Daemon 会话管理器
 */
export function createDaemonSessionManager() {
  // 内存索引
  const index: SessionIndex = {
    byId: new Map(),
    byCwd: new Map(),
  }

  // 初始化时加载索引
  let initialized = false

  /**
   * 初始化：加载所有会话元数据
   */
  async function initialize(): Promise<void> {
    if (initialized) return

    ensureDir(SESSIONS_DIR)

    try {
      const entries = await fsp.readdir(SESSIONS_DIR, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const sessionId = entry.name
        const metaPath = getMetaPath(sessionId)

        try {
          const content = await fsp.readFile(metaPath, "utf-8")
          const meta: PersistedSession = JSON.parse(content)

          // 添加到索引
          index.byId.set(meta.id, meta)

          const normalizedCwd = normalizeCwd(meta.cwd)
          const cwdSessions = index.byCwd.get(normalizedCwd) || []
          cwdSessions.push(meta.id)
          index.byCwd.set(normalizedCwd, cwdSessions)
        } catch {
          // 跳过损坏的会话
          console.warn(`Skipping corrupted session: ${sessionId}`)
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err
      }
    }

    initialized = true
  }

  /**
   * 创建新会话
   */
  async function createSession(
    cwd: string,
    agentType: AgentType = "build",
    name?: string
  ): Promise<PersistedSession> {
    await initialize()

    const id = generateSessionId()
    const normalizedCwd = normalizeCwd(cwd)
    const now = Date.now()

    const session: PersistedSession = {
      id,
      cwd: normalizedCwd,
      agentType,
      createdAt: now,
      updatedAt: now,
      name,
      messageCount: 0,
    }

    // 保存到文件
    const sessionDir = getSessionDir(id)
    ensureDir(sessionDir)
    await fsp.writeFile(getMetaPath(id), JSON.stringify(session, null, 2))

    // 更新索引
    index.byId.set(id, session)
    const cwdSessions = index.byCwd.get(normalizedCwd) || []
    cwdSessions.push(id)
    index.byCwd.set(normalizedCwd, cwdSessions)

    return session
  }

  /**
   * 获取会话
   */
  async function getSession(sessionId: string): Promise<PersistedSession | null> {
    await initialize()
    return index.byId.get(sessionId) || null
  }

  /**
   * 按 cwd 查找会话（返回最近的）
   */
  async function findSessionByCwd(cwd: string): Promise<PersistedSession | null> {
    await initialize()

    const normalizedCwd = normalizeCwd(cwd)
    const sessionIds = index.byCwd.get(normalizedCwd)

    if (!sessionIds || sessionIds.length === 0) {
      return null
    }

    // 返回最近更新的会话
    let latest: PersistedSession | null = null
    for (const id of sessionIds) {
      const session = index.byId.get(id)
      if (session && (!latest || session.updatedAt > latest.updatedAt)) {
        latest = session
      }
    }

    return latest
  }

  /**
   * 获取或创建会话（按 cwd）
   */
  async function getOrCreateSession(
    cwd: string,
    agentType: AgentType = "build"
  ): Promise<PersistedSession> {
    const existing = await findSessionByCwd(cwd)
    if (existing) {
      return existing
    }
    return createSession(cwd, agentType)
  }

  /**
   * 列出所有会话
   */
  async function listSessions(filterCwd?: string): Promise<PersistedSession[]> {
    await initialize()

    const sessions = Array.from(index.byId.values())

    if (filterCwd) {
      const normalizedCwd = normalizeCwd(filterCwd)
      return sessions.filter((s) => normalizeCwd(s.cwd) === normalizedCwd)
    }

    // 按更新时间倒序
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /**
   * 更新会话元数据
   */
  async function updateSession(
    sessionId: string,
    updates: Partial<Pick<PersistedSession, "name" | "messageCount" | "updatedAt">>
  ): Promise<PersistedSession | null> {
    await initialize()

    const session = index.byId.get(sessionId)
    if (!session) {
      return null
    }

    // 更新字段
    if (updates.name !== undefined) session.name = updates.name
    if (updates.messageCount !== undefined) session.messageCount = updates.messageCount
    session.updatedAt = updates.updatedAt || Date.now()

    // 保存到文件
    await fsp.writeFile(getMetaPath(sessionId), JSON.stringify(session, null, 2))

    return session
  }

  /**
   * 删除会话
   */
  async function deleteSession(sessionId: string): Promise<boolean> {
    await initialize()

    const session = index.byId.get(sessionId)
    if (!session) {
      return false
    }

    // 从索引删除
    index.byId.delete(sessionId)

    const normalizedCwd = normalizeCwd(session.cwd)
    const cwdSessions = index.byCwd.get(normalizedCwd)
    if (cwdSessions) {
      const idx = cwdSessions.indexOf(sessionId)
      if (idx !== -1) {
        cwdSessions.splice(idx, 1)
      }
      if (cwdSessions.length === 0) {
        index.byCwd.delete(normalizedCwd)
      }
    }

    // 删除文件
    const sessionDir = getSessionDir(sessionId)
    try {
      await fsp.rm(sessionDir, { recursive: true, force: true })
    } catch {
      // ignore
    }

    return true
  }

  /**
   * 获取会话消息文件路径（供外部读写）
   */
  function getSessionMessagesPath(sessionId: string): string {
    return getMessagesPath(sessionId)
  }

  /**
   * 获取会话目录（供外部使用）
   */
  function getSessionDirectory(sessionId: string): string {
    return getSessionDir(sessionId)
  }

  /**
   * 获取统计信息
   */
  async function getStats(): Promise<{ total: number; byAgentType: Record<string, number> }> {
    await initialize()

    const byAgentType: Record<string, number> = {}
    for (const session of index.byId.values()) {
      byAgentType[session.agentType] = (byAgentType[session.agentType] || 0) + 1
    }

    return {
      total: index.byId.size,
      byAgentType,
    }
  }

  return {
    initialize,
    createSession,
    getSession,
    findSessionByCwd,
    getOrCreateSession,
    listSessions,
    updateSession,
    deleteSession,
    getSessionMessagesPath,
    getSessionDirectory,
    getStats,
  }
}

export type DaemonSessionManager = ReturnType<typeof createDaemonSessionManager>
