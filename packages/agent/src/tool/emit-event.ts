/**
 * emit_event 工具 - LLM 主动发射事件
 *
 * 让 LLM 在工作流中主动发射事件，触发订阅了该事件的 Skill Hooks。
 * CC 事件总线兼容：支持 immediate 和 deferred 两种 timing。
 */

import { z } from "zod"
import { Tool } from "./tool"
import { getSkillHookRegistry } from "../skill/skill-hooks"

export const EmitEventTool = Tool.define({
  id: "emit_event",
  description:
    "Emit an event to trigger subscribed skill hooks. " +
    "Use 'immediate' timing for critical events (errors, failures), " +
    "'deferred' to batch-process at task end. " +
    "Check the Event Bus section in your system prompt for available events.",
  isConcurrencySafe: true,
  isReadOnly: true,
  parameters: z.object({
    event: z.string().describe("Event name (e.g. 'build:failed', 'pattern:detected')"),
    source: z.string().describe("What triggered this event (skill name or action)"),
    timing: z
      .enum(["immediate", "deferred"])
      .default("immediate")
      .describe("immediate: process now; deferred: batch at task end"),
    context: z
      .record(z.unknown())
      .optional()
      .describe("Event context data (error messages, file paths, etc.)"),
  }),

  async execute(params) {
    const registry = getSkillHookRegistry()
    if (!registry) {
      return {
        title: "emit_event",
        output: "Warning: Skill hook system not initialized. Event not delivered.",
      }
    }

    const payload = {
      name: params.event,
      source: params.source,
      context: params.context as Record<string, unknown> | undefined,
      timestamp: Date.now(),
    }

    if (params.timing === "deferred") {
      registry.defer(payload)
      return {
        title: `emit_event: ${params.event} (deferred)`,
        output: `Event '${params.event}' queued for deferred processing.`,
      }
    }

    // immediate: 立即触发
    const messages = registry.emit(payload)
    if (messages.length === 0) {
      return {
        title: `emit_event: ${params.event}`,
        output: `Event '${params.event}' emitted but no subscribers found.`,
      }
    }

    return {
      title: `emit_event: ${params.event}`,
      output: `Event '${params.event}' triggered ${messages.length} subscriber(s):\n\n${messages.join("\n\n")}`,
    }
  },
})
