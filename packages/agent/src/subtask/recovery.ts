/**
 * 子代理 Token 超限恢复机制
 *
 * 当子代理因 token 超限（上下文爆满）失败时：
 * 1. 检测错误是否为 token 超限
 * 2. 对 session 执行 autoCompact 压缩
 * 3. 重新创建 loop 并重试一次
 *
 * 设计原则：只重试一次，避免无限循环
 */

import type { Session } from "../session"
import { autoCompact } from "../agent/compact"
import type { LLMProvider } from "../provider"
import { DEFAULT_MODEL } from "../provider"

/**
 * 检测错误是否为 token/上下文超限
 *
 * 覆盖常见的 API 错误消息模式：
 * - Anthropic: "prompt is too long", "context window"
 * - OpenAI: "maximum context length", "token limit"
 */
export function isContextOverflowError(error: string): boolean {
  const lower = error.toLowerCase()
  const patterns = [
    "prompt is too long",
    "prompt_too_long",
    "context window",
    "context length",
    "token limit",
    "max_tokens",
    "maximum context",
    "too many tokens",
    "input too long",
    "request too large",
  ]
  return patterns.some((p) => lower.includes(p))
}

/**
 * 对 session 执行紧急压缩（用于 token 超限恢复）
 *
 * 使用传入的 provider 生成摘要，替换全部消息历史
 * 返回是否成功压缩
 */
export async function emergencyCompact(
  session: Session,
  provider: LLMProvider,
  modelConfig?: { model: string },
): Promise<boolean> {
  try {
    const model = modelConfig?.model || DEFAULT_MODEL.model
    const compacted = await autoCompact(session, async (text) => {
      const resp = await provider.chat({
        model: { provider: "auto", model, temperature: 0, maxTokens: 2000 },
        messages: [{
          role: "user",
          content: "Summarize this conversation for continuity. Include: "
            + "1) What was accomplished, 2) Current state, 3) Key decisions made. "
            + "Be concise but preserve critical details.\n\n" + text,
        }],
        system: "You are a conversation summarizer. Output a concise summary.",
      })
      return resp.text
    })
    return compacted
  } catch {
    // 压缩本身也失败了，放弃恢复
    return false
  }
}
