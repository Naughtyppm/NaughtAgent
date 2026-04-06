/**
 * Worktree Tools（s12）
 *
 * Git Worktree 任务隔离工具，Zod schema + 对象风格。
 */

import { z } from "zod"
import { Tool } from "../tool"
import {
  createWorktree,
  runInWorktree,
  closeoutWorktree,
  listWorktrees,
  getWorktreeStatus,
  readWorktreeEvents,
  isGitRepo,
  type WorktreeStatus,
} from "../../subtask/worktree"

// ============================================================================
// worktree_create
// ============================================================================

export const worktreeCreateTool = Tool.define({
  id: "worktree_create",
  description: "创建一个新的 Git Worktree 隔离通道，关联指定任务 ID。每个任务对应独立目录，并行执行互不干扰。",
  parameters: z.object({
    name: z.string().describe("worktree 名称（用作目录名和分支名后缀，如 auth-refactor）"),
    task_id: z.string().optional().describe("关联的任务 ID（可选）"),
    branch_from: z.string().optional().describe("基于哪个 commit/branch 创建，默认 HEAD"),
  }),
  async execute(params) {
    if (!isGitRepo()) {
      return { title: "worktree_create", output: "Error: Not in a git repository.", isError: true, metadata: { error: true } }
    }
    try {
      const wt = createWorktree(params.name, params.task_id, params.branch_from)
      return { title: "worktree_create", output: JSON.stringify(wt, null, 2), metadata: { name: wt.name, path: wt.path } }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { title: "worktree_create", output: `Error: ${msg}`, isError: true, metadata: { error: true } }
    }
  },
})

// ============================================================================
// worktree_run
// ============================================================================

export const worktreeRunTool = Tool.define({
  id: "worktree_run",
  description: "在指定 worktree 目录内执行 shell 命令，输出结果。命令在隔离目录中运行，不影响主工作区。",
  parameters: z.object({
    name: z.string().describe("目标 worktree 名称"),
    command: z.string().describe("要执行的 shell 命令"),
  }),
  async execute(params) {
    try {
      const output = runInWorktree(params.name, params.command)
      return { title: "worktree_run", output: output || "(no output)", metadata: { name: params.name } }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { title: "worktree_run", output: `Error: ${msg}`, isError: true, metadata: { error: true } }
    }
  },
})

// ============================================================================
// worktree_closeout
// ============================================================================

export const worktreeCloseoutTool = Tool.define({
  id: "worktree_closeout",
  description: "关闭 worktree。keep：保留分支待合并；remove：删除目录和分支。",
  parameters: z.object({
    name: z.string().describe("worktree 名称"),
    action: z.enum(["keep", "remove"]).describe("keep 保留分支 | remove 删除一切"),
  }),
  async execute(params) {
    try {
      const wt = closeoutWorktree(params.name, params.action)
      return { title: "worktree_closeout", output: JSON.stringify(wt, null, 2), metadata: { name: params.name, action: params.action } }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { title: "worktree_closeout", output: `Error: ${msg}`, isError: true, metadata: { error: true } }
    }
  },
})

// ============================================================================
// worktree_list
// ============================================================================

export const worktreeListTool = Tool.define({
  id: "worktree_list",
  description: "列出所有 worktree 及其状态，可按 active/closed/error 过滤。",
  parameters: z.object({
    status: z.enum(["active", "closed", "error"]).optional().describe("状态过滤（可选）"),
  }),
  async execute(params) {
    const wts = listWorktrees(params.status as WorktreeStatus | undefined)
    return {
      title: "worktree_list",
      output: wts.length === 0 ? "No worktrees found." : JSON.stringify(wts, null, 2),
      metadata: { count: wts.length },
    }
  },
})

// ============================================================================
// worktree_status
// ============================================================================

export const worktreeStatusTool = Tool.define({
  id: "worktree_status",
  description: "查询单个 worktree 的详细状态。",
  parameters: z.object({
    name: z.string().describe("worktree 名称"),
  }),
  async execute(params) {
    const wt = getWorktreeStatus(params.name)
    return {
      title: "worktree_status",
      output: wt ? JSON.stringify(wt, null, 2) : `Worktree not found: ${params.name}`,
      metadata: { found: !!wt },
    }
  },
})

// ============================================================================
// worktree_events
// ============================================================================

export const worktreeEventsTool = Tool.define({
  id: "worktree_events",
  description: "读取 worktree 生命周期事件日志，用于调试和观测。",
  parameters: z.object({
    limit: z.number().optional().describe("返回最近 N 条事件，默认 50"),
  }),
  async execute(params) {
    const events = readWorktreeEvents(params.limit ?? 50)
    return {
      title: "worktree_events",
      output: events.length === 0 ? "No events." : JSON.stringify(events, null, 2),
      metadata: { count: events.length },
    }
  },
})
