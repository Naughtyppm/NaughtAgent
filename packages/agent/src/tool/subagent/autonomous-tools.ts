/**
 * Autonomous Agent Tools（s11）
 *
 * 全局任务板工具，使用 Zod schema + 对象风格定义。
 */

import { z } from "zod"
import { Tool } from "../tool"
import {
  createGlobalTask,
  scanUnclaimedTasks,
  claimTask,
  updateGlobalTask,
  listGlobalTasks,
  type GlobalTaskStatus,
} from "../../subtask/autonomous"

// ============================================================================
// scan_tasks
// ============================================================================

export const scanTasksTool = Tool.define({
  id: "scan_tasks",
  description: "扫描全局任务板，返回所有 pending 且无 owner 的可认领任务。",
  parameters: z.object({}),
  async execute() {
    const tasks = scanUnclaimedTasks()
    return {
      title: "scan_tasks",
      output: tasks.length === 0 ? "No unclaimed tasks available." : JSON.stringify(tasks, null, 2),
      metadata: { count: tasks.length },
    }
  },
})

// ============================================================================
// claim_task
// ============================================================================

export const claimTaskTool = Tool.define({
  id: "claim_task",
  description: "认领一个 pending 任务。认领成功后任务状态变为 in_progress，owner 设为当前 Agent。",
  parameters: z.object({
    task_id: z.string().describe("任务 ID"),
    owner: z.string().describe("认领者名称（Agent 名）"),
  }),
  async execute(params) {
    const task = claimTask(params.task_id, params.owner)
    return {
      title: "claim_task",
      output: task
        ? JSON.stringify(task, null, 2)
        : `Task ${params.task_id} not found or already claimed.`,
      metadata: { success: !!task },
    }
  },
})

// ============================================================================
// complete_task
// ============================================================================

export const completeTaskTool = Tool.define({
  id: "complete_task",
  description: "将任务标记为 completed。只有任务 owner 才应调用此工具。",
  parameters: z.object({
    task_id: z.string().describe("任务 ID"),
  }),
  async execute(params) {
    const task = updateGlobalTask(params.task_id, { status: "completed" as GlobalTaskStatus })
    return {
      title: "complete_task",
      output: task ? JSON.stringify(task, null, 2) : `Task ${params.task_id} not found.`,
      metadata: { success: !!task },
    }
  },
})

// ============================================================================
// create_team_task
// ============================================================================

export const createTeamTaskTool = Tool.define({
  id: "create_team_task",
  description: "在全局任务板上创建一个新任务，供其他 Agent 认领执行。",
  parameters: z.object({
    subject: z.string().describe("任务标题"),
    description: z.string().optional().describe("任务详细描述（可选）"),
  }),
  async execute(params) {
    const task = createGlobalTask(params.subject, params.description)
    return {
      title: "create_team_task",
      output: JSON.stringify(task, null, 2),
      metadata: { taskId: task.id },
    }
  },
})

// ============================================================================
// list_team_tasks
// ============================================================================

export const listTeamTasksTool = Tool.define({
  id: "list_team_tasks",
  description: "列出全局任务板上的任务，可按状态过滤（pending/in_progress/completed/cancelled）。",
  parameters: z.object({
    status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional().describe("状态过滤（可选）"),
  }),
  async execute(params) {
    const tasks = listGlobalTasks(params.status as GlobalTaskStatus | undefined)
    return {
      title: "list_team_tasks",
      output: tasks.length === 0 ? "No tasks found." : JSON.stringify(tasks, null, 2),
      metadata: { count: tasks.length },
    }
  },
})
