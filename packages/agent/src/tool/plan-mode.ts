/**
 * plan-mode 工具 - 计划模式切换
 *
 * 提供 EnterPlanMode / ExitPlanMode 两个工具，
 * 控制 LLM 在"计划模式"和"正常模式"之间切换。
 *
 * 计划模式下 LLM 只能使用只读工具（read/glob/grep）进行探索，
 * 不能执行写入操作（write/edit/bash）。
 *
 * 状态存储在 ctx.meta.planMode 中，
 * 实际的权限拦截由 runner 层负责，本模块只做状态切换。
 */

import { z } from "zod"
import { Tool } from "./tool"

/**
 * 检查当前是否处于计划模式
 *
 * @param meta - 工具上下文的 meta 对象
 * @returns 是否处于计划模式
 */
export function isPlanMode(meta?: Record<string, unknown>): boolean {
  return meta?.planMode === true
}

/**
 * EnterPlanMode - 进入计划模式
 *
 * 标记当前会话进入计划模式，LLM 将只能使用只读工具进行探索。
 * 实际权限限制由 runner 层根据 meta.planMode 状态执行。
 */
export const EnterPlanModeTool = Tool.define({
  id: "enter_plan_mode",
  description: `Enter Plan Mode. In this mode, you can only explore the codebase using read-only tools (read, glob, grep) but cannot make any modifications (write, edit, bash).

Use this when you want to:
- Analyze and understand code before making changes
- Create a detailed plan of what needs to be modified
- Explore dependencies and impact of proposed changes

Call exit_plan_mode when you're ready to execute your plan.`,
  parameters: z.object({}),
  isConcurrencySafe: true,
  isReadOnly: true,

  async execute(_params, ctx) {
    // 确保 meta 存在
    if (!ctx.meta) {
      ctx.meta = {}
    }

    // 如果已经在计划模式中，提示重复进入
    if (ctx.meta.planMode === true) {
      return {
        title: "enter_plan_mode",
        output: "Already in Plan Mode. Use read, glob, grep to explore. Call exit_plan_mode when ready to execute.",
      }
    }

    // 设置计划模式标记
    ctx.meta.planMode = true

    return {
      title: "enter_plan_mode",
      output: "Entered Plan Mode. You can now only use read-only tools (read, glob, grep) to explore the codebase. Write, edit, and bash are blocked until you call exit_plan_mode.",
      metadata: {
        planMode: true,
      },
    }
  },
})

/**
 * ExitPlanMode - 退出计划模式
 *
 * 退出计划模式，恢复正常操作权限（写入、编辑、执行命令）。
 */
export const ExitPlanModeTool = Tool.define({
  id: "exit_plan_mode",
  description: `Exit Plan Mode and return to normal operation mode where all tools are available.

Call this after you have finished exploring and planning, and are ready to make changes.`,
  parameters: z.object({}),
  isConcurrencySafe: true,
  isReadOnly: true,

  async execute(_params, ctx) {
    // 确保 meta 存在
    if (!ctx.meta) {
      ctx.meta = {}
    }

    // 如果不在计划模式中，提示无需退出
    if (!ctx.meta.planMode) {
      return {
        title: "exit_plan_mode",
        output: "Not in Plan Mode. All tools are already available.",
      }
    }

    // 清除计划模式标记
    ctx.meta.planMode = false

    return {
      title: "exit_plan_mode",
      output: "Exited Plan Mode. All tools are now available. You can proceed with write, edit, and bash operations.",
      metadata: {
        planMode: false,
      },
    }
  },
})
