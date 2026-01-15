/**
 * Session 持久化存储
 *
 * 将会话保存到文件系统，支持加载恢复
 */

import * as fs from "fs/promises"
import * as path from "path"
import type { Session, SessionID } from "./session"
import type { Message } from "./message"

/**
 * 存储目录名
 */
const STORAGE_DIR = ".naught"
const SESSIONS_DIR = "sessions"

/**
 * 会话元数据（不含消息）
 */
interface SessionMeta {
  id: string
  status: Session["status"]
  cwd: string
  agentType: Session["agentType"]
  createdAt: number
  updatedAt: number
  usage: Session["usage"]
}

/**
 * 获取会话存储目录
 */
function getSessionDir(baseDir: string, sessionId: SessionID): string {
  return path.join(baseDir, STORAGE_DIR, SESSIONS_DIR, sessionId)
}

/**
 * 获取会话元数据文件路径
 */
function getMetaPath(sessionDir: string): string {
  return path.join(sessionDir, "session.json")
}

/**
 * 获取消息文件路径
 */
function getMessagesPath(sessionDir: string): string {
  return path.join(sessionDir, "messages.jsonl")
}

/**
 * 保存会话到文件
 */
export async function saveSession(
  session: Session,
  baseDir?: string
): Promise<void> {
  const base = baseDir || session.cwd
  const sessionDir = getSessionDir(base, session.id)

  // 确保目录存在
  await fs.mkdir(sessionDir, { recursive: true })

  // 保存元数据
  const meta: SessionMeta = {
    id: session.id,
    status: session.status,
    cwd: session.cwd,
    agentType: session.agentType,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    usage: session.usage,
  }
  await fs.writeFile(getMetaPath(sessionDir), JSON.stringify(meta, null, 2))

  // 保存消息（JSONL 格式）
  const messagesContent = session.messages
    .map((msg) => JSON.stringify(msg))
    .join("\n")
  await fs.writeFile(getMessagesPath(sessionDir), messagesContent)
}

/**
 * 加载会话
 */
export async function loadSession(
  sessionId: SessionID,
  baseDir: string
): Promise<Session> {
  const sessionDir = getSessionDir(baseDir, sessionId)

  // 读取元数据
  const metaContent = await fs.readFile(getMetaPath(sessionDir), "utf-8")
  const meta: SessionMeta = JSON.parse(metaContent)

  // 读取消息
  let messages: Message[] = []
  try {
    const messagesContent = await fs.readFile(getMessagesPath(sessionDir), "utf-8")
    if (messagesContent.trim()) {
      messages = messagesContent
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line))
    }
  } catch (err) {
    // 消息文件可能不存在或为空
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err
    }
  }

  return {
    ...meta,
    messages,
  }
}

/**
 * 删除会话存储
 */
export async function deleteSessionStorage(
  sessionId: SessionID,
  baseDir: string
): Promise<void> {
  const sessionDir = getSessionDir(baseDir, sessionId)
  await fs.rm(sessionDir, { recursive: true, force: true })
}

/**
 * 列出所有已保存的会话 ID
 */
export async function listSavedSessions(baseDir: string): Promise<SessionID[]> {
  const sessionsDir = path.join(baseDir, STORAGE_DIR, SESSIONS_DIR)

  try {
    const entries = await fs.readdir(sessionsDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return []
    }
    throw err
  }
}

/**
 * 检查会话是否已保存
 */
export async function isSessionSaved(
  sessionId: SessionID,
  baseDir: string
): Promise<boolean> {
  const sessionDir = getSessionDir(baseDir, sessionId)
  try {
    await fs.access(getMetaPath(sessionDir))
    return true
  } catch {
    return false
  }
}

/**
 * 追加消息到已保存的会话
 */
export async function appendMessage(
  sessionId: SessionID,
  message: Message,
  baseDir: string
): Promise<void> {
  const sessionDir = getSessionDir(baseDir, sessionId)
  const messagesPath = getMessagesPath(sessionDir)

  // 追加消息
  await fs.appendFile(messagesPath, JSON.stringify(message) + "\n")

  // 更新元数据的 updatedAt
  const metaPath = getMetaPath(sessionDir)
  const metaContent = await fs.readFile(metaPath, "utf-8")
  const meta: SessionMeta = JSON.parse(metaContent)
  meta.updatedAt = message.timestamp
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2))
}
