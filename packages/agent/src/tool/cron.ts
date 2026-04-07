/**
 * Cron 定时任务工具 - CronCreate / CronDelete / CronList
 *
 * 内存中的简易调度器，setInterval 每分钟扫描一次。
 * 触发的 prompt 仅存储在此层，实际执行由外层 runner/loop 负责。
 */

import { z } from "zod"
import { Tool } from "./tool"

// ─── 数据结构 ────────────────────────────────────────

export interface CronJob {
  /** 任务 ID（cron-{timestamp}-{randomSuffix}） */
  id: string
  /** 5 字段标准 cron 表达式 */
  cron: string
  /** 触发时要执行的提示 */
  prompt: string
  /** 是否为循环任务（false = 触发一次后自动删除） */
  recurring: boolean
  /** 创建时间戳（ms） */
  createdAt: number
  /** 上次触发时间戳（ms），未触发过则为 null */
  lastFiredAt: number | null
  /** 解析后的 cron 字段（内部使用） */
  _parsed: ParsedCron
}

/** 待触发的任务信息（暴露给外层） */
export interface CronFireEvent {
  jobId: string
  prompt: string
}

// ─── 任务注册表（module-level 单例） ────────────────────

const jobs = new Map<string, CronJob>()

/** 触发回调：外层通过 setCronFireCallback 注册 */
let fireCallback: ((event: CronFireEvent) => void) | null = null

/** 调度器 interval ID */
let tickTimer: ReturnType<typeof setInterval> | null = null

// ─── 公共 API（给外层使用） ─────────────────────────────

/**
 * 注册触发回调
 * 外层（runner/loop）调用此函数注入实际执行逻辑
 */
export function setCronFireCallback(cb: (event: CronFireEvent) => void): void {
  fireCallback = cb
}

/**
 * 获取所有定时任务（外部只读访问）
 */
export function getAllCronJobs(): CronJob[] {
  return Array.from(jobs.values())
}

/**
 * 启动调度器（幂等：多次调用不会重复启动）
 */
export function startCronScheduler(): void {
  if (tickTimer !== null) return
  tickTimer = setInterval(tick, 60_000) // 每 60 秒检查一次
  // 不阻止进程退出
  if (tickTimer && typeof tickTimer === "object" && "unref" in tickTimer) {
    tickTimer.unref()
  }
}

/**
 * 停止调度器
 */
export function stopCronScheduler(): void {
  if (tickTimer !== null) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

/**
 * 清空所有任务（用于测试 / 会话结束清理）
 */
export function clearAllCronJobs(): void {
  jobs.clear()
}

// ─── Cron 表达式解析器 ───────────────────────────────

/**
 * 解析后的 5 字段 cron
 * 每个字段是一个匹配函数：给定当前值，返回是否匹配
 */
interface ParsedCron {
  minute: (v: number) => boolean
  hour: (v: number) => boolean
  dayOfMonth: (v: number) => boolean
  month: (v: number) => boolean
  dayOfWeek: (v: number) => boolean
}

/**
 * 解析单个 cron 字段
 *
 * 支持的语法：
 *   *        — 任意值
 *   5        — 精确值
 *   1,3,5    — 列表
 *   1-5      — 范围
 *   * /N      — 步进（每 N）
 *   1-10/2   — 范围步进
 *
 * @param field - 单个 cron 字段字符串
 * @param min   - 该字段的最小合法值
 * @param max   - 该字段的最大合法值
 * @returns 匹配函数
 */
function parseField(field: string, min: number, max: number): (v: number) => boolean {
  // 通配符
  if (field === "*") {
    return () => true
  }

  // 逗号分隔的列表（递归解析每一项后取 OR）
  if (field.includes(",")) {
    const matchers = field.split(",").map((part) => parseField(part.trim(), min, max))
    return (v) => matchers.some((m) => m(v))
  }

  // 步进语法：base/step
  if (field.includes("/")) {
    const [base, stepStr] = field.split("/")
    const step = parseInt(stepStr, 10)
    if (isNaN(step) || step <= 0) {
      throw new Error(`无效的步进值: ${field}`)
    }

    if (base === "*") {
      // */N — 从 min 开始，每 step 匹配
      return (v) => (v - min) % step === 0
    }

    // range/step — 如 1-10/2
    if (base.includes("-")) {
      const [startStr, endStr] = base.split("-")
      const start = parseInt(startStr, 10)
      const end = parseInt(endStr, 10)
      return (v) => v >= start && v <= end && (v - start) % step === 0
    }

    // single/step（不常见但合法）— 从 base 开始每 step
    const startVal = parseInt(base, 10)
    return (v) => v >= startVal && v <= max && (v - startVal) % step === 0
  }

  // 范围语法：start-end
  if (field.includes("-")) {
    const [startStr, endStr] = field.split("-")
    const start = parseInt(startStr, 10)
    const end = parseInt(endStr, 10)
    return (v) => v >= start && v <= end
  }

  // 精确值
  const exact = parseInt(field, 10)
  if (isNaN(exact)) {
    throw new Error(`无效的 cron 字段: ${field}`)
  }
  return (v) => v === exact
}

/**
 * 解析 5 字段标准 cron 表达式
 *
 * 格式：minute hour dayOfMonth month dayOfWeek
 *   minute:     0-59
 *   hour:       0-23
 *   dayOfMonth: 1-31
 *   month:      1-12
 *   dayOfWeek:  0-7（0 和 7 都表示周日）
 */
function parseCron(expression: string): ParsedCron {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) {
    throw new Error(
      `cron 表达式必须包含 5 个字段（minute hour dayOfMonth month dayOfWeek），收到 ${parts.length} 个字段: "${expression}"`
    )
  }

  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dayOfMonth: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dayOfWeek: parseField(parts[4], 0, 7),
  }
}

/**
 * 检查 ParsedCron 在给定时间是否匹配
 */
function cronMatches(parsed: ParsedCron, date: Date): boolean {
  const minute = date.getMinutes()
  const hour = date.getHours()
  const dayOfMonth = date.getDate()
  const month = date.getMonth() + 1 // JS 月份从 0 开始
  let dayOfWeek = date.getDay() // 0=周日, 1=周一, ...

  return (
    parsed.minute(minute) &&
    parsed.hour(hour) &&
    parsed.dayOfMonth(dayOfMonth) &&
    parsed.month(month) &&
    // cron 中 0 和 7 都表示周日，统一判断
    (parsed.dayOfWeek(dayOfWeek) || (dayOfWeek === 0 && parsed.dayOfWeek(7)))
  )
}

// ─── 调度核心 ───────────────────────────────────────

/**
 * 每分钟 tick 一次，检查并触发匹配的任务
 */
function tick(): void {
  const now = new Date()
  const toDelete: string[] = []

  for (const [id, job] of jobs) {
    if (cronMatches(job._parsed, now)) {
      job.lastFiredAt = Date.now()

      // 通知外层
      if (fireCallback) {
        fireCallback({ jobId: id, prompt: job.prompt })
      }

      // one-shot 任务触发后标记删除
      if (!job.recurring) {
        toDelete.push(id)
      }
    }
  }

  // 清理 one-shot 任务
  for (const id of toDelete) {
    jobs.delete(id)
  }
}

// ─── ID 生成 ────────────────────────────────────────

function generateJobId(): string {
  const ts = Date.now()
  const rand = Math.random().toString(36).substring(2, 8)
  return `cron-${ts}-${rand}`
}

// ─── CronCreate 工具 ────────────────────────────────

const CRON_CREATE_DESCRIPTION = `Schedule a prompt to be enqueued at a future time. Use for both recurring schedules and one-shot reminders.

Uses standard 5-field cron in the user's local timezone: minute hour day-of-month month day-of-week.
"0 9 * * *" means 9am local.

Examples:
  - "*/5 * * * *" — every 5 minutes
  - "0 * * * *" — hourly
  - "0 9 * * 1-5" — weekdays at 9am
  - "30 14 28 2 *" — Feb 28 at 2:30pm (one-shot with recurring=false)

Parameters:
  - cron: 5-field cron expression
  - prompt: the prompt to enqueue at each fire time
  - recurring: true (default) = keep firing; false = fire once then auto-delete

Returns the job ID for later deletion.`

export const CronCreateTool = Tool.define({
  id: "cron_create",
  description: CRON_CREATE_DESCRIPTION,
  parameters: z.object({
    cron: z
      .string()
      .describe(
        'Standard 5-field cron expression (minute hour dayOfMonth month dayOfWeek), e.g. "*/5 * * * *"'
      ),
    prompt: z.string().describe("The prompt to enqueue at each fire time"),
    recurring: z
      .boolean()
      .default(true)
      .describe(
        "true (default) = fire on every cron match; false = fire once then auto-delete"
      ),
  }),

  // 写入内存状态，但不修改文件系统
  isConcurrencySafe: true,

  async execute(params, _ctx) {
    const { cron, prompt, recurring = true } = params

    // 解析 cron 表达式（失败时返回错误）
    let parsed: ParsedCron
    try {
      parsed = parseCron(cron)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        title: "cron_create",
        output: `Error: ${message}`,
        isError: true,
      }
    }

    // 创建任务
    const id = generateJobId()
    const job: CronJob = {
      id,
      cron,
      prompt,
      recurring,
      createdAt: Date.now(),
      lastFiredAt: null,
      _parsed: parsed,
    }

    jobs.set(id, job)

    // 确保调度器已启动
    startCronScheduler()

    return {
      title: "cron_create",
      output: `Created ${recurring ? "recurring" : "one-shot"} cron job.\nID: ${id}\nSchedule: ${cron}\nPrompt: ${prompt}`,
      metadata: {
        jobId: id,
        cron,
        recurring,
      },
    }
  },
})

// ─── CronDelete 工具 ────────────────────────────────

const CRON_DELETE_DESCRIPTION = `Cancel a cron job previously scheduled with cron_create.

Removes it from the in-memory store. The job will no longer fire.`

export const CronDeleteTool = Tool.define({
  id: "cron_delete",
  description: CRON_DELETE_DESCRIPTION,
  parameters: z.object({
    id: z.string().describe("Job ID returned by cron_create"),
  }),

  isConcurrencySafe: true,

  async execute(params, _ctx) {
    const { id } = params

    if (!jobs.has(id)) {
      const available = Array.from(jobs.keys())
      const hint =
        available.length > 0
          ? `\nAvailable job IDs: ${available.join(", ")}`
          : "\nNo cron jobs registered."
      return {
        title: "cron_delete",
        output: `Error: No cron job found with ID "${id}".${hint}`,
        isError: true,
      }
    }

    jobs.delete(id)

    // 如果没有剩余任务，停止调度器
    if (jobs.size === 0) {
      stopCronScheduler()
    }

    return {
      title: "cron_delete",
      output: `Cron job "${id}" has been deleted.`,
      metadata: { jobId: id },
    }
  },
})

// ─── CronList 工具 ──────────────────────────────────

const CRON_LIST_DESCRIPTION = `List all cron jobs scheduled via cron_create in this session.

Shows each job's ID, cron expression, prompt, type (recurring/one-shot), and last fire time.`

export const CronListTool = Tool.define({
  id: "cron_list",
  description: CRON_LIST_DESCRIPTION,
  parameters: z.object({}),

  isConcurrencySafe: true,
  isReadOnly: true,

  async execute(_params, _ctx) {
    if (jobs.size === 0) {
      return {
        title: "cron_list",
        output: "No cron jobs scheduled.",
      }
    }

    const lines: string[] = [`Cron jobs (${jobs.size} total):`, ""]

    for (const job of jobs.values()) {
      const type = job.recurring ? "recurring" : "one-shot"
      const created = new Date(job.createdAt).toLocaleString()
      const lastFired = job.lastFiredAt
        ? new Date(job.lastFiredAt).toLocaleString()
        : "never"

      lines.push(`  ID:        ${job.id}`)
      lines.push(`  Schedule:  ${job.cron} (${type})`)
      lines.push(`  Prompt:    ${job.prompt}`)
      lines.push(`  Created:   ${created}`)
      lines.push(`  Last fired: ${lastFired}`)
      lines.push("")
    }

    return {
      title: "cron_list",
      output: lines.join("\n"),
      metadata: {
        count: jobs.size,
        jobs: Array.from(jobs.values()).map((j) => ({
          id: j.id,
          cron: j.cron,
          recurring: j.recurring,
          prompt: j.prompt,
        })),
      },
    }
  },
})
