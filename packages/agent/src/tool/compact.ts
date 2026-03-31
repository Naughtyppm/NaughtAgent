/**
 * compact 工具 - Layer 3: LLM 主动触发上下文压缩
 *
 * 当 LLM 感觉上下文过长时，可主动调用此工具压缩对话历史。
 * 内部调用 autoCompact 执行 LLM 摘要 + 全量替换。
 */

import { z } from "zod"
import { Tool } from "./tool"
import type { Session } from "../session/session"
import { autoCompact, estimateTokens } from "../agent/compact"

export const CompactTool = Tool.define({
  id: "compact",
  description: `Compress conversation context by generating a summary of the conversation so far.
Use this when you feel the conversation is getting long and you want to free up context space.
This will replace the conversation history with a concise summary.`,
  parameters: z.object({
    reason: z.string().optional().describe("Why you want to compact (for logging)"),
  }),

  async execute(params, ctx) {
    const session = ctx.meta?.session as Session | undefined
    const summarizer = ctx.meta?.summarizer as ((text: string) => Promise<string>) | undefined

    if (!session || !summarizer) {
      return {
        title: "compact",
        output: "Error: Compact not available in this context (no session/summarizer).",
      }
    }

    const tokensBefore = estimateTokens(session)
    const compacted = await autoCompact(session, summarizer)

    if (!compacted) {
      return {
        title: "compact",
        output: `Context is within limits (~${tokensBefore} tokens). No compaction needed.`,
      }
    }

    const tokensAfter = estimateTokens(session)
    return {
      title: "compact",
      output: `Compacted: ~${tokensBefore} → ~${tokensAfter} tokens.${params.reason ? ` Reason: ${params.reason}` : ""}`,
      metadata: {
        tokensBefore,
        tokensAfter,
        reason: params.reason,
      },
    }
  },
})
