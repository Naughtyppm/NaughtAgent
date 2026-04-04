/**
 * Worktree Task Isolation（s12）
 *
 * 用 Git Worktree 为每个任务分配独立执行目录，实现并行任务互不干扰。
 *
 * 控制面：.naughty/teams/worktrees/index.json
 * 执行面：.naughty/worktrees/<name>/（实际 git worktree 目录）
 */

import { execSync, spawnSync } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

// ============================================================================
// 路径（延迟求值，避免模块级 process.cwd() 在 Daemon 模式下路径错误）
// ============================================================================

function getWorktreesMetaDir(cwd?: string): string {
  return join(cwd ?? process.cwd(), ".naughty", "teams", "worktrees")
}

function getWorktreesMetaFile(cwd?: string): string {
  return join(getWorktreesMetaDir(cwd), "index.json")
}

function getWorktreesDir(cwd?: string): string {
  return join(cwd ?? process.cwd(), ".naughty", "worktrees")
}

function getEventsFile(cwd?: string): string {
  return join(getWorktreesMetaDir(cwd), "events.jsonl")
}

// ============================================================================
// 类型
// ============================================================================

export type WorktreeStatus = "active" | "closed" | "error"

export interface WorktreeInfo {
  name: string
  path: string
  branch: string
  taskId?: string
  status: WorktreeStatus
  createdAt: number
  closedAt?: number
}

export interface WorktreeIndex {
  worktrees: WorktreeInfo[]
}

export interface WorktreeEvent {
  type: string
  name: string
  data?: Record<string, unknown>
  timestamp: number
}

// ============================================================================
// 工具函数
// ============================================================================

function ensureDirs(): void {
  const metaDir = getWorktreesMetaDir()
  const wtDir = getWorktreesDir()
  if (!existsSync(metaDir)) mkdirSync(metaDir, { recursive: true })
  if (!existsSync(wtDir)) mkdirSync(wtDir, { recursive: true })
}

function readIndex(): WorktreeIndex {
  ensureDirs()
  const metaFile = getWorktreesMetaFile()
  if (!existsSync(metaFile)) return { worktrees: [] }
  try {
    return JSON.parse(readFileSync(metaFile, "utf-8")) as WorktreeIndex
  } catch { return { worktrees: [] } }
}

function writeIndex(index: WorktreeIndex): void {
  ensureDirs()
  writeFileSync(getWorktreesMetaFile(), JSON.stringify(index, null, 2))
}

/** 检查当前目录是否在 git 仓库中 */
export function isGitRepo(): boolean {
  try {
    const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf-8" })
    return r.status === 0
  } catch { return false }
}

// ============================================================================
// EventBus
// ============================================================================

/** 记录 worktree 生命周期事件 */
export function emitWorktreeEvent(type: string, name: string, data?: Record<string, unknown>): void {
  ensureDirs()
  const event: WorktreeEvent = { type, name, data, timestamp: Date.now() }
  appendFileSync(getEventsFile(), JSON.stringify(event) + "\n")
}

/** 读取最近 N 条事件 */
export function readWorktreeEvents(limit = 50): WorktreeEvent[] {
  ensureDirs()
  const eventsFile = getEventsFile()
  if (!existsSync(eventsFile)) return []
  const lines = readFileSync(eventsFile, "utf-8").trim().split("\n").filter(Boolean)
  return lines.slice(-limit).flatMap(l => {
    try { return [JSON.parse(l) as WorktreeEvent] } catch { return [] }
  })
}

// ============================================================================
// Worktree CRUD
// ============================================================================

/** 创建新 worktree 并关联任务 */
export function createWorktree(name: string, taskId?: string, branchFrom = "HEAD"): WorktreeInfo {
  ensureDirs()
  if (!isGitRepo()) throw new Error("Not in a git repository")
  const worktreePath = resolve(getWorktreesDir(), name)
  const branch = `wt/${name}`
  // git worktree add
  execSync(`git worktree add "${worktreePath}" -b "${branch}" ${branchFrom}`, { stdio: "pipe" })
  const info: WorktreeInfo = {
    name,
    path: worktreePath,
    branch,
    taskId,
    status: "active",
    createdAt: Date.now(),
  }
  const index = readIndex()
  index.worktrees.push(info)
  writeIndex(index)
  emitWorktreeEvent("worktree_created", name, { taskId, branch, path: worktreePath })
  return info
}

/** 在指定 worktree 内执行 shell 命令 */
export function runInWorktree(name: string, command: string): string {
  const index = readIndex()
  const wt = index.worktrees.find(w => w.name === name)
  if (!wt) throw new Error(`Worktree not found: ${name}`)
  if (wt.status !== "active") throw new Error(`Worktree ${name} is not active`)
  try {
    const output = execSync(command, { cwd: wt.path, encoding: "utf-8", stdio: "pipe" })
    emitWorktreeEvent("command_run", name, { command, success: true })
    return output
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    emitWorktreeEvent("command_run", name, { command, success: false, error: msg })
    throw new Error(`Command failed in worktree ${name}: ${msg}`)
  }
}

/** 关闭 worktree（keep 保留分支 | remove 删除） */
export function closeoutWorktree(name: string, action: "keep" | "remove"): WorktreeInfo {
  const index = readIndex()
  const wt = index.worktrees.find(w => w.name === name)
  if (!wt) throw new Error(`Worktree not found: ${name}`)
  if (action === "remove") {
    try {
      execSync(`git worktree remove --force "${wt.path}"`, { stdio: "pipe" })
      execSync(`git branch -D "${wt.branch}"`, { stdio: "pipe" })
    } catch { /* 忽略已删除的情况 */ }
  } else {
    // keep：仅从 git worktree 列表移除目录，保留分支
    try {
      execSync(`git worktree remove --force "${wt.path}"`, { stdio: "pipe" })
    } catch { /* 忽略 */ }
  }
  wt.status = "closed"
  wt.closedAt = Date.now()
  writeIndex(index)
  emitWorktreeEvent("worktree_closed", name, { action, branch: wt.branch })
  return wt
}

/** 列出所有 worktree */
export function listWorktrees(statusFilter?: WorktreeStatus): WorktreeInfo[] {
  const index = readIndex()
  if (!statusFilter) return index.worktrees
  return index.worktrees.filter(w => w.status === statusFilter)
}

/** 查询单个 worktree 状态 */
export function getWorktreeStatus(name: string): WorktreeInfo | null {
  const index = readIndex()
  return index.worktrees.find(w => w.name === name) ?? null
}
