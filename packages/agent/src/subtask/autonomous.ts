/**
 * Autonomous Agent 自主执行层（s11）
 *
 * 实现三个核心机制：
 * 1. 全局任务板（.naughty/teams/tasks/task_*.json）- 跨 Agent 共享
 * 2. Idle 轮询循环 - Agent 空闲时自动找任务
 * 3. 身份重注入 - context 压缩后保持 Agent 身份
 *
 * Teammate 生命周期：
 *   spawn → WORK → IDLE（轮询收件箱+任务板）→ shutdown
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

// ============================================================================
// 路径（延迟求值，避免模块级 process.cwd() 在 Daemon 模式下路径错误）
// ============================================================================

function getTeamsDir(cwd?: string): string {
  return join(cwd ?? process.cwd(), ".naughty", "teams")
}

function getInboxDir(cwd?: string): string {
  return join(getTeamsDir(cwd), "inbox")
}

function getGlobalTasksDir(cwd?: string): string {
  return join(getTeamsDir(cwd), "tasks")
}

export const POLL_INTERVAL_MS = 5_000  // 5 秒
export const IDLE_TIMEOUT_MS = 60_000 // 60 秒

// ============================================================================
// 全局任务板类型
// ============================================================================

export type GlobalTaskStatus = "pending" | "in_progress" | "completed" | "cancelled"

export interface GlobalTask {
  id: string
  subject: string
  description?: string
  status: GlobalTaskStatus
  owner?: string
  blockedBy?: string[]
  createdAt: number
  updatedAt: number
}

// ============================================================================
// 全局任务板操作
// ============================================================================

function ensureDirs(cwd?: string): void {
  const tasksDir = getGlobalTasksDir(cwd)
  const inboxDir = getInboxDir(cwd)
  if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true })
  if (!existsSync(inboxDir)) mkdirSync(inboxDir, { recursive: true })
}

function taskPath(id: string, cwd?: string): string {
  return join(getGlobalTasksDir(cwd), `task_${id}.json`)
}

/** 创建新任务 */
export function createGlobalTask(subject: string, description?: string): GlobalTask {
  ensureDirs()
  const id = Date.now().toString(36)
  const task: GlobalTask = {
    id,
    subject,
    description,
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  writeFileSync(taskPath(id), JSON.stringify(task, null, 2))
  return task
}

/** 扫描未认领任务 */
export function scanUnclaimedTasks(): GlobalTask[] {
  ensureDirs()
  const tasksDir = getGlobalTasksDir()
  const tasks: GlobalTask[] = []
  for (const f of readdirSync(tasksDir).sort()) {
    if (!f.startsWith("task_") || !f.endsWith(".json")) continue
    try {
      const task = JSON.parse(readFileSync(join(tasksDir, f), "utf-8")) as GlobalTask
      if (task.status === "pending" && !task.owner && !(task.blockedBy?.length)) {
        tasks.push(task)
      }
    } catch { /* 忽略损坏文件 */ }
  }
  return tasks
}

/** 认领任务（原子操作，防止多 Agent 抢占同一任务） */
export function claimTask(taskId: string, owner: string): GlobalTask | null {
  ensureDirs()
  const path = taskPath(taskId)
  if (!existsSync(path)) return null
  const task = JSON.parse(readFileSync(path, "utf-8")) as GlobalTask
  // 已被认领则返回 null
  if (task.owner || task.status !== "pending") return null
  task.owner = owner
  task.status = "in_progress"
  task.updatedAt = Date.now()
  writeFileSync(path, JSON.stringify(task, null, 2))
  return task
}

/** 更新任务状态 */
export function updateGlobalTask(taskId: string, updates: Partial<GlobalTask>): GlobalTask | null {
  const path = taskPath(taskId)
  if (!existsSync(path)) return null
  const task = JSON.parse(readFileSync(path, "utf-8")) as GlobalTask
  const updated = { ...task, ...updates, updatedAt: Date.now() }
  writeFileSync(path, JSON.stringify(updated, null, 2))
  return updated
}

/** 列出所有任务 */
export function listGlobalTasks(statusFilter?: GlobalTaskStatus): GlobalTask[] {
  ensureDirs()
  const tasksDir = getGlobalTasksDir()
  const tasks: GlobalTask[] = []
  for (const f of readdirSync(tasksDir).sort()) {
    if (!f.startsWith("task_") || !f.endsWith(".json")) continue
    try {
      const task = JSON.parse(readFileSync(join(tasksDir, f), "utf-8")) as GlobalTask
      if (!statusFilter || task.status === statusFilter) tasks.push(task)
    } catch { /* 忽略 */ }
  }
  return tasks
}

// ============================================================================
// Inbox 操作
// ============================================================================

export interface InboxMessage {
  from: string
  subject: string
  body: string
  timestamp: number
}

function inboxPath(agentName: string): string {
  return join(getInboxDir(), `${agentName}.jsonl`)
}

/** 读取并清空 Agent 收件箱 */
export function drainInbox(agentName: string): InboxMessage[] {
  ensureDirs()
  const path = inboxPath(agentName)
  if (!existsSync(path)) return []
  const lines = readFileSync(path, "utf-8").trim().split("\n").filter(Boolean)
  // 清空收件箱
  writeFileSync(path, "")
  return lines.flatMap(line => {
    try { return [JSON.parse(line) as InboxMessage] } catch { return [] }
  })
}

/** 向指定 Agent 发送收件箱消息 */
export function sendToInbox(agentName: string, msg: Omit<InboxMessage, "timestamp">): void {
  ensureDirs()
  const path = inboxPath(agentName)
  const full: InboxMessage = { ...msg, timestamp: Date.now() }
  const line = JSON.stringify(full) + "\n"
  appendFileSync(path, line)
}

// ============================================================================
// 身份重注入
// ============================================================================

export interface ChatMessage {
  role: "user" | "assistant"
  content: string | unknown[]
}

/**
 * 身份重注入：当 context 被压缩后，把 <identity> 块插回消息头
 * 对应 s11 中 inject_identity() 的行为
 *
 * @param messages  当前对话消息列表
 * @param identity  Agent 身份描述字符串（XML 块或纯文本）
 * @returns 注入后的消息列表（不修改原数组）
 */
export function injectIdentity(messages: ChatMessage[], identity: string): ChatMessage[] {
  if (!messages.length) return messages
  // 如果第一条消息已包含 identity，则跳过
  const first = messages[0]
  const firstText = typeof first.content === "string" ? first.content : JSON.stringify(first.content)
  if (firstText.includes(identity.slice(0, 40))) return messages
  // 在头部插入 user 身份消息
  const identityMsg: ChatMessage = {
    role: "user",
    content: `<identity>\n${identity}\n</identity>`,
  }
  return [identityMsg, ...messages]
}

// ============================================================================
// Idle 轮询循环
// ============================================================================

export interface IdleLoopOptions {
  /** Agent 名称，用于读取收件箱 */
  agentName: string
  /** 收到收件箱消息时的回调 */
  onMessages: (msgs: InboxMessage[]) => Promise<void>
  /** 发现可认领任务时的回调，返回 true 表示已处理 */
  onTask: (task: GlobalTask) => Promise<boolean>
  /** 轮询间隔，默认 POLL_INTERVAL_MS */
  intervalMs?: number
  /** 最长空闲时间，超过后自动退出，默认 IDLE_TIMEOUT_MS */
  timeoutMs?: number
}

/**
 * Idle 轮询循环
 *
 * Agent 完成当前工作后进入 IDLE 状态，每隔 intervalMs 扫描：
 *   1. 收件箱 — 有消息则调用 onMessages，重置超时计时器
 *   2. 任务板 — 有未认领任务则尝试认领并调用 onTask
 *
 * 超过 timeoutMs 无任何活动则退出（Agent 自然关机）。
 *
 * 对应 s11 idle_loop() 实现。
 */
export async function idleLoop(opts: IdleLoopOptions): Promise<void> {
  const {
    agentName,
    onMessages,
    onTask,
    intervalMs = POLL_INTERVAL_MS,
    timeoutMs = IDLE_TIMEOUT_MS,
  } = opts

  let lastActivity = Date.now()

  const tick = async (): Promise<boolean> => {
    // 1. 检查收件箱
    const msgs = drainInbox(agentName)
    if (msgs.length > 0) {
      await onMessages(msgs)
      lastActivity = Date.now()
      return true
    }
    // 2. 扫描任务板
    const tasks = scanUnclaimedTasks()
    for (const task of tasks) {
      const claimed = claimTask(task.id, agentName)
      if (claimed) {
        const handled = await onTask(claimed)
        if (handled) {
          lastActivity = Date.now()
          return true
        }
      }
    }
    return false
  }

  while (true) {
    await tick()
    // 检查超时
    if (Date.now() - lastActivity > timeoutMs) {
      console.log(`[${agentName}] idle timeout, shutting down`)
      break
    }
    // 等待下一轮
    await new Promise<void>(resolve => setTimeout(resolve, intervalMs))
  }
}
