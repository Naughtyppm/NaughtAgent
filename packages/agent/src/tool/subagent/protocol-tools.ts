/**
 * Team Protocol Tools（s10）
 *
 * 实现关机协议和计划审批两套工具，使用 Zod schema + 对象风格定义。
 */

import { z } from "zod"
import { Tool } from "../tool"
import {
  requestShutdown,
  respondShutdown,
  getShutdownStatus,
  submitPlan,
  reviewPlan,
  getPlanStatus,
  getPendingPlans as listPendingPlans,
} from "../../subtask/protocol"

// ============================================================================
// request_shutdown
// ============================================================================

export const RequestShutdownTool = Tool.define({
  id: "request_shutdown",
  description: "（Lead 调用）向指定 Teammate 发起关机请求，返回 request_id 供后续查询状态。",
  parameters: z.object({
    target: z.string().describe("目标 Teammate 名称"),
    reason: z.string().optional().describe("关机原因（可选）"),
  }),
  async execute(params) {
    const requestId = requestShutdown(params.target, params.reason)
    return {
      title: "request_shutdown",
      output: JSON.stringify({ requestId, target: params.target, status: "pending" }),
      metadata: { requestId },
    }
  },
})

// ============================================================================
// respond_shutdown
// ============================================================================

export const RespondShutdownTool = Tool.define({
  id: "respond_shutdown",
  description: "（Teammate 调用）响应 Lead 的关机请求，批准或拒绝。",
  parameters: z.object({
    request_id: z.string().describe("关机请求 ID"),
    approved: z.boolean().describe("是否同意关机"),
    reason: z.string().optional().describe("拒绝原因（可选）"),
  }),
  async execute(params) {
    respondShutdown({ requestId: params.request_id, approved: params.approved, reason: params.reason })
    const status = getShutdownStatus(params.request_id)
    return {
      title: "respond_shutdown",
      output: JSON.stringify(status),
      metadata: { requestId: params.request_id },
    }
  },
})

// ============================================================================
// submit_plan
// ============================================================================

export const SubmitPlanTool = Tool.define({
  id: "submit_plan",
  description: "（Teammate 调用）向 Lead 提交执行计划，等待审批后才能继续操作。",
  parameters: z.object({
    from: z.string().describe("提交计划的 Agent 名称"),
    plan: z.string().describe("计划详细内容"),
  }),
  async execute(params) {
    const requestId = submitPlan(params.from, params.plan)
    return {
      title: "submit_plan",
      output: JSON.stringify({ requestId, from: params.from, status: "pending" }),
      metadata: { requestId },
    }
  },
})

// ============================================================================
// review_plan
// ============================================================================

export const ReviewPlanTool = Tool.define({
  id: "review_plan",
  description: "（Lead 调用）审核 Teammate 提交的执行计划，批准或拒绝。",
  parameters: z.object({
    request_id: z.string().describe("计划请求 ID"),
    approved: z.boolean().describe("是否批准"),
    review_note: z.string().optional().describe("审核说明（可选）"),
  }),
  async execute(params) {
    reviewPlan({ requestId: params.request_id, approved: params.approved, reason: params.review_note })
    const status = getPlanStatus(params.request_id)
    return {
      title: "review_plan",
      output: JSON.stringify(status),
      metadata: { requestId: params.request_id },
    }
  },
})

// ============================================================================
// list_pending_plans
// ============================================================================

export const ListPendingPlansTool = Tool.define({
  id: "list_pending_plans",
  description: "（Lead 调用）列出所有待审批的计划请求。",
  parameters: z.object({}),
  async execute() {
    const plans = listPendingPlans()
    return {
      title: "list_pending_plans",
      output: plans.length === 0 ? "No pending plans." : JSON.stringify(plans, null, 2),
      metadata: { count: plans.length },
    }
  },
})
