/**
 * Team Protocols - 团队协议层
 *
 * 实现两种协议（均使用 request_id 关联模式）：
 * 1. 关机协议（Shutdown FSM）：pending → approved | rejected
 * 2. 计划审批（Plan Approval FSM）：pending → approved | rejected
 *
 * 教材参考：learn-claude-code-main/agents/s10_team_protocols.py
 */

import { randomBytes } from "crypto"

// ============================================================================
// Types
// ============================================================================

export type ProtocolStatus = "pending" | "approved" | "rejected"

export interface ShutdownRequest {
  /** 请求目标（被要求关机的 agent 名） */
  target: string
  status: ProtocolStatus
  reason?: string
  createdAt: number
}

export interface PlanRequest {
  /** 提交计划的 agent 名 */
  from: string
  /** 计划内容 */
  plan: string
  status: ProtocolStatus
  reviewNote?: string
  createdAt: number
}

export interface ProtocolResponse {
  requestId: string
  approved: boolean
  reason?: string
}

// ============================================================================
// Protocol Store（内存级，进程内共享）
// ============================================================================

const shutdownRequests = new Map<string, ShutdownRequest>()
const planRequests = new Map<string, PlanRequest>()

/** 生成短 ID（8 字符） */
function genId(): string {
  return randomBytes(4).toString("hex")
}

// ============================================================================
// Shutdown Protocol
// ============================================================================

/**
 * Lead 发起关机请求
 * @returns requestId 用于后续查询状态
 */
export function requestShutdown(target: string, reason?: string): string {
  const requestId = genId()
  shutdownRequests.set(requestId, {
    target,
    status: "pending",
    reason,
    createdAt: Date.now(),
  })
  return requestId
}

/**
 * Teammate 响应关机请求
 */
export function respondShutdown(response: ProtocolResponse): void {
  const req = shutdownRequests.get(response.requestId)
  if (!req) throw new Error(`Shutdown request not found: ${response.requestId}`)
  req.status = response.approved ? "approved" : "rejected"
  req.reason = response.reason
}

/**
 * 查询关机请求状态
 */
export function getShutdownStatus(requestId: string): ShutdownRequest | undefined {
  return shutdownRequests.get(requestId)
}

/**
 * 等待关机请求结果（轮询，最多等 timeoutMs）
 */
export async function waitForShutdown(
  requestId: string,
  timeoutMs = 30_000,
  intervalMs = 500,
): Promise<ProtocolStatus> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const req = shutdownRequests.get(requestId)
    if (req && req.status !== "pending") return req.status
    await new Promise(r => setTimeout(r, intervalMs))
  }
  return "rejected" // 超时视为拒绝
}

// ============================================================================
// Plan Approval Protocol
// ============================================================================

/**
 * Teammate 提交计划，等待 lead 审批
 * @returns requestId
 */
export function submitPlan(from: string, plan: string): string {
  const requestId = genId()
  planRequests.set(requestId, {
    from,
    plan,
    status: "pending",
    createdAt: Date.now(),
  })
  return requestId
}

/**
 * Lead 审批计划
 */
export function reviewPlan(response: ProtocolResponse): void {
  const req = planRequests.get(response.requestId)
  if (!req) throw new Error(`Plan request not found: ${response.requestId}`)
  req.status = response.approved ? "approved" : "rejected"
  req.reviewNote = response.reason
}

/**
 * 查询计划审批状态
 */
export function getPlanStatus(requestId: string): PlanRequest | undefined {
  return planRequests.get(requestId)
}

/**
 * 等待计划审批结果
 */
export async function waitForPlanApproval(
  requestId: string,
  timeoutMs = 60_000,
  intervalMs = 500,
): Promise<ProtocolStatus> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const req = planRequests.get(requestId)
    if (req && req.status !== "pending") return req.status
    await new Promise(r => setTimeout(r, intervalMs))
  }
  return "rejected"
}

/**
 * Lead 获取所有待审批计划
 */
export function getPendingPlans(): Array<{ requestId: string } & PlanRequest> {
  const result: Array<{ requestId: string } & PlanRequest> = []
  for (const [requestId, req] of planRequests.entries()) {
    if (req.status === "pending") {
      result.push({ requestId, ...req })
    }
  }
  return result
}

/**
 * Lead 获取所有待响应的关机请求
 */
export function getPendingShutdowns(): Array<{ requestId: string } & ShutdownRequest> {
  const result: Array<{ requestId: string } & ShutdownRequest> = []
  for (const [requestId, req] of shutdownRequests.entries()) {
    if (req.status === "pending") {
      result.push({ requestId, ...req })
    }
  }
  return result
}

/** 清理已完成的请求（避免内存泄漏） */
export function cleanupProtocols(maxAgeMs = 10 * 60 * 1000): void {
  const cutoff = Date.now() - maxAgeMs
  for (const [id, req] of shutdownRequests.entries()) {
    if (req.status !== "pending" && req.createdAt < cutoff) shutdownRequests.delete(id)
  }
  for (const [id, req] of planRequests.entries()) {
    if (req.status !== "pending" && req.createdAt < cutoff) planRequests.delete(id)
  }
}
