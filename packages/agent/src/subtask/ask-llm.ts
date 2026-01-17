/**
 * ask_llm 模式 - 单次 LLM 调用（原 api.ts）
 *
 * 最简单的子任务模式：
 * - 单次 LLM 调用
 * - 无工具
 * - 支持结构化输出
 * - 最低 Token 消耗
 */

import type {
  AskLlmConfig,
  SubTaskResult,
  SubTaskProvider,
} from "./types"

/**
 * 执行 ask_llm 模式子任务
 */
export async function runAskLlm(
  config: AskLlmConfig,
  provider: SubTaskProvider
): Promise<SubTaskResult> {
  const startTime = Date.now()

  try {
    // 检查取消信号
    if (config.abort?.aborted) {
      return {
        success: false,
        output: "",
        error: "Task was aborted",
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: Date.now() - startTime,
      }
    }

    // 构建消息
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = []

    if (config.systemPrompt) {
      messages.push({ role: "system", content: config.systemPrompt })
    }

    messages.push({ role: "user", content: config.prompt })

    // 根据输出格式选择调用方式
    if (config.outputFormat === "json" && config.schema) {
      // 结构化输出
      const result = await provider.chatWithSchema({
        messages,
        schema: config.schema,
        model: config.model?.model,
        temperature: config.model?.temperature,
        maxTokens: config.model?.maxTokens,
      })

      return {
        success: true,
        output: JSON.stringify(result.data, null, 2),
        data: result.data,
        usage: result.usage,
        duration: Date.now() - startTime,
      }
    } else {
      // 普通文本输出
      const result = await provider.chat({
        messages,
        model: config.model?.model,
        temperature: config.model?.temperature,
        maxTokens: config.model?.maxTokens,
      })

      return {
        success: true,
        output: result.content,
        usage: result.usage,
        duration: Date.now() - startTime,
      }
    }
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : String(error),
      usage: { inputTokens: 0, outputTokens: 0 },
      duration: Date.now() - startTime,
    }
  }
}

/**
 * @deprecated 使用 runAskLlm
 */
export const runAPITask = runAskLlm
