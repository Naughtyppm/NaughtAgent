/**
 * compact 工具 - Layer 3: LLM 主动触发上下文压缩
 *
 * 当 LLM 感觉上下文过长时，可主动调用此工具压缩对话历史。
 * 通过 ctx.meta 注入 autoCompact / estimateTokens，避免直接导入 agent/ 层。
 */

import { z } from "zod"
import { Tool } from "./tool"
import type { Session } from "../session/session"

/** compact 工具需要的 ctx.meta 接口 */
export interface CompactMeta {
  session: Session
  summarizer: (text: string) => Promise<string>
  autoCompact: (session: Session, summarizer: (text: string) => Promise<string>) => Promise<boolean>
  estimateTokens: (session: Session) => number
}

export const CompactTool = Tool.define({
  id: "compact",
  description: `Compress conversation context by generating a summary of the conversation so far.
Use this when you feel the conversation is getting long and you want to free up context space.
This will replace the conversation history with a concise summary.`,
  parameters: z.object({
    reason: z.string().optional().describe("Why you want to compact (for logging)"),
  }),

  async execute(params, ctx) {
    const meta = ctx.meta as Partial<CompactMeta> | undefined
    const session = meta?.session
    const summarizer = meta?.summarizer
    const compactFn = meta?.autoCompact
    const estimateFn = meta?.estimateTokens

    if (!session || !summarizer || !compactFn || !estimateFn) {
      return {
        title: "compact",
        output: "Error: Compact not available in this context (no session/summarizer/compact functions).",
      }
    }

    const tokensBefore = estimateFn(session)
    const compacted = await compactFn(session, summarizer)

    if (!compacted) {
      return {
        title: "compact",
        output: `Context is within limits (~${tokensBefore} tokens). No compaction needed.`,
      }
    }

    const tokensAfter = estimateFn(session)
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
