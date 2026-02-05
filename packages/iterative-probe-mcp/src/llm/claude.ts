/**
 * Claude API 客户端
 */

import Anthropic from "@anthropic-ai/sdk"

/**
 * LLM 调用选项
 */
export interface LLMCallOptions {
  /** 系统提示 */
  systemPrompt?: string
  /** 用户消息 */
  prompt: string
  /** 最大 token */
  maxTokens?: number
  /** 温度 */
  temperature?: number
}

/**
 * LLM 调用结果
 */
export interface LLMCallResult {
  /** 输出内容 */
  content: string
  /** Token 使用 */
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

/**
 * Claude 客户端
 */
export class ClaudeClient {
  private client: Anthropic
  private model: string

  constructor(apiKey?: string, model?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    })
    this.model = model || process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514"
  }

  /**
   * 调用 Claude
   */
  async call(options: LLMCallOptions): Promise<LLMCallResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.3,
      system: options.systemPrompt,
      messages: [
        {
          role: "user",
          content: options.prompt,
        },
      ],
    })

    const content =
      response.content[0].type === "text" ? response.content[0].text : ""

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    }
  }

  /**
   * 调用 Claude 并解析 JSON
   */
  async callJSON<T>(options: LLMCallOptions): Promise<{ data: T; usage: LLMCallResult["usage"] }> {
    const result = await this.call({
      ...options,
      prompt: `${options.prompt}

请以 JSON 格式返回结果，不要包含 markdown 代码块标记。`,
    })

    // 尝试提取 JSON
    let jsonStr = result.content.trim()

    // 移除可能的 markdown 代码块
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7)
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3)
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3)
    }
    jsonStr = jsonStr.trim()

    try {
      const data = JSON.parse(jsonStr) as T
      return { data, usage: result.usage }
    } catch (e) {
      throw new Error(`Failed to parse JSON response: ${result.content}`)
    }
  }
}

/**
 * 创建 Claude 客户端
 */
export function createClaudeClient(apiKey?: string, model?: string): ClaudeClient {
  return new ClaudeClient(apiKey, model)
}

/**
 * 默认客户端实例
 */
let defaultClient: ClaudeClient | null = null

/**
 * 获取默认客户端
 */
export function getClaudeClient(): ClaudeClient {
  if (!defaultClient) {
    defaultClient = createClaudeClient()
  }
  return defaultClient
}
