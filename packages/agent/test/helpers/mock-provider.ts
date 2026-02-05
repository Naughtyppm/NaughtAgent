/**
 * Mock LLM Provider
 *
 * 用于集成测试的 Mock Provider，可预设响应
 *
 * @module test/helpers/mock-provider
 */

import type {
  LLMProvider,
  ChatParams,
  ChatResult,
  StreamEvent,
  TokenUsage,
} from '../../src/provider/types.js'

/**
 * Mock 响应配置
 */
export interface MockResponse {
  /** 文本响应 */
  text?: string
  /** 工具调用 */
  toolCalls?: Array<{
    id: string
    name: string
    args: unknown
  }>
  /** Token 使用 */
  usage?: TokenUsage
  /** 是否抛出错误 */
  error?: Error
  /** 延迟（毫秒） */
  delay?: number
}

/**
 * Mock Provider 配置
 */
export interface MockProviderConfig {
  /** 默认响应 */
  defaultResponse?: MockResponse
  /** 按消息内容匹配的响应 */
  responses?: Map<string, MockResponse>
}

/**
 * 默认 Token 使用
 */
const DEFAULT_USAGE: TokenUsage = {
  inputTokens: 100,
  outputTokens: 50,
}

/**
 * 创建 Mock LLM Provider
 */
export function createMockProvider(config: MockProviderConfig = {}): MockLLMProvider {
  return new MockLLMProvider(config)
}

/**
 * Mock LLM Provider 实现
 */
export class MockLLMProvider implements LLMProvider {
  readonly type = 'anthropic' as const

  private responseQueue: MockResponse[] = []
  private defaultResponse: MockResponse
  private responses: Map<string, MockResponse>
  private callHistory: ChatParams[] = []

  constructor(config: MockProviderConfig = {}) {
    this.defaultResponse = config.defaultResponse ?? {
      text: 'Mock response',
      usage: DEFAULT_USAGE,
    }
    this.responses = config.responses ?? new Map()
  }

  /**
   * 添加预设响应到队列
   */
  queueResponse(response: MockResponse): void {
    this.responseQueue.push(response)
  }

  /**
   * 设置默认响应
   */
  setDefaultResponse(response: MockResponse): void {
    this.defaultResponse = response
  }

  /**
   * 添加按内容匹配的响应
   */
  addResponse(pattern: string, response: MockResponse): void {
    this.responses.set(pattern, response)
  }

  /**
   * 清空响应队列
   */
  clearQueue(): void {
    this.responseQueue = []
  }

  /**
   * 获取调用历史
   */
  getCallHistory(): ChatParams[] {
    return [...this.callHistory]
  }

  /**
   * 清空调用历史
   */
  clearHistory(): void {
    this.callHistory = []
  }

  /**
   * 获取下一个响应
   */
  private getNextResponse(params: ChatParams): MockResponse {
    // 记录调用
    this.callHistory.push(params)

    // 优先使用队列中的响应
    if (this.responseQueue.length > 0) {
      return this.responseQueue.shift()!
    }

    // 尝试按内容匹配
    const lastMessage = params.messages[params.messages.length - 1]
    const content = typeof lastMessage?.content === 'string'
      ? lastMessage.content
      : ''

    for (const [pattern, response] of this.responses) {
      if (content.includes(pattern)) {
        return response
      }
    }

    // 返回默认响应
    return this.defaultResponse
  }

  /**
   * 流式调用
   */
  async *stream(params: ChatParams): AsyncGenerator<StreamEvent> {
    const response = this.getNextResponse(params)

    // 模拟延迟
    if (response.delay) {
      await new Promise(resolve => setTimeout(resolve, response.delay))
    }

    // 检查取消
    if (params.abortSignal?.aborted) {
      yield { type: 'error', error: new Error('Aborted') }
      return
    }

    // 抛出错误
    if (response.error) {
      yield { type: 'error', error: response.error }
      return
    }

    // 输出文本
    if (response.text) {
      yield { type: 'text', text: response.text }
    }

    // 输出工具调用
    if (response.toolCalls) {
      for (const call of response.toolCalls) {
        yield {
          type: 'tool_call',
          id: call.id,
          name: call.name,
          args: call.args,
        }
      }
    }

    // 结束
    yield {
      type: 'message_end',
      usage: response.usage ?? DEFAULT_USAGE,
    }
  }

  /**
   * 非流式调用
   */
  async chat(params: ChatParams): Promise<ChatResult> {
    const response = this.getNextResponse(params)

    // 模拟延迟
    if (response.delay) {
      await new Promise(resolve => setTimeout(resolve, response.delay))
    }

    // 检查取消
    if (params.abortSignal?.aborted) {
      throw new Error('Aborted')
    }

    // 抛出错误
    if (response.error) {
      throw response.error
    }

    return {
      text: response.text ?? '',
      toolCalls: response.toolCalls ?? [],
      usage: response.usage ?? DEFAULT_USAGE,
    }
  }
}
