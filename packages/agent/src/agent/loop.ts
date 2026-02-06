/**
 * Agent Loop - 核心执行循环
 *
 * 实现 LLM → Tool → LLM 的循环执行
 *
 * 流程：
 * 1. 用户输入 → 构建消息
 * 2. 调用 LLM → 获取响应
 * 3. 如果有工具调用 → 执行工具 → 将结果加入消息 → 回到步骤 2
 * 4. 如果没有工具调用 → 返回最终响应
 */

import type { AgentDefinition, AgentEvent, AgentRunConfig, TokenUsage } from "./agent"
import { buildSystemPrompt } from "./prompt"
import { Tool } from "../tool/tool"
import { ToolRegistry } from "../tool/registry"
import { createOutputTruncator } from "../tool/output-truncator"
import { AgentError, ErrorCode } from "../error"
import { Logger, PerformanceMonitor, generateTraceId } from "../logging"
import type {
  LLMProvider,
  ToolDefinition,
  Message,
  MessageContent,
  TextContent,
  ImageContent,
  AudioContent,
  ToolUseContent,
  ToolResultContent,
} from "../provider"
import { DEFAULT_MODEL } from "../provider"
import type { Session } from "../session/session"
import {
  addMessage,
  updateUsage,
  type ContentBlock,
  type TextBlock,
  type ImageBlock,
  type AudioBlock,
  type ToolUseBlock,
  type ToolResultBlock,
} from "../session"

/**
 * Agent Loop 配置
 */
export interface AgentLoopConfig {
  /** Agent 定义 */
  definition: AgentDefinition
  /** 会话 */
  session: Session
  /** Provider 实例 */
  provider: LLMProvider
  /** 运行配置 */
  runConfig: AgentRunConfig
}

/**
 * 错误恢复追踪器
 */
interface ErrorTracker {
  /** 连续错误计数 */
  consecutiveErrors: number
  /** 最近的错误消息 */
  lastErrors: string[]
  /** 最大连续错误数 */
  maxConsecutiveErrors: number
  /** 错误类型统计 */
  errorTypes: Map<string, number>
}

/**
 * 错误类型枚举
 */
type ErrorType = 
  | 'truncation'      // 内容被截断
  | 'invalid_params'  // 参数无效
  | 'file_not_found'  // 文件不存在
  | 'permission'      // 权限问题
  | 'timeout'         // 超时
  | 'unknown'         // 未知错误

/**
 * 分析错误类型
 */
function analyzeErrorType(error: string): ErrorType {
  const lower = error.toLowerCase()
  if (lower.includes('truncat') || lower.includes('too long') || lower.includes('token limit')) {
    return 'truncation'
  }
  if (lower.includes('invalid param') || lower.includes('invalid_param') || lower.includes('validation')) {
    return 'invalid_params'
  }
  if (lower.includes('not found') || lower.includes('enoent') || lower.includes('no such file')) {
    return 'file_not_found'
  }
  if (lower.includes('permission') || lower.includes('access denied') || lower.includes('eperm')) {
    return 'permission'
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'timeout'
  }
  return 'unknown'
}

/**
 * 根据错误类型生成恢复策略
 */
function getRecoveryStrategy(errorType: ErrorType, _toolName: string): string {
  switch (errorType) {
    case 'truncation':
      return `内容被截断。策略：
- 如果是 write 操作，改用 write + append 分段写入（每段不超过 50 行）
- 如果是 read 操作，使用 start_line/end_line 参数分段读取
- 减少单次操作的内容量`

    case 'invalid_params':
      return `参数无效。策略：
- 检查参数格式是否正确
- 确保路径使用正确的分隔符
- 如果内容过长导致参数被截断，使用分段策略`

    case 'file_not_found':
      return `文件不存在。策略：
- 使用 glob 工具确认文件路径
- 检查路径拼写和大小写
- 确认工作目录是否正确`

    case 'permission':
      return `权限不足。策略：
- 检查文件/目录权限
- 尝试其他位置
- 询问用户是否需要提升权限`

    case 'timeout':
      return `操作超时。策略：
- 减少操作范围
- 分批执行
- 检查是否有死循环或阻塞操作`

    default:
      return `遇到未知错误。策略：
- 分析错误信息
- 尝试不同的方法
- 如果问题持续，询问用户`
  }
}

/**
 * 创建错误追踪器
 */
function createErrorTracker(maxErrors = 3): ErrorTracker {
  return {
    consecutiveErrors: 0,
    lastErrors: [],
    maxConsecutiveErrors: maxErrors,
    errorTypes: new Map(),
  }
}

/**
 * 记录错误
 */
function trackError(tracker: ErrorTracker, error: string): boolean {
  tracker.consecutiveErrors++
  tracker.lastErrors.push(error)
  if (tracker.lastErrors.length > 5) {
    tracker.lastErrors.shift()
  }
  
  // 统计错误类型
  const errorType = analyzeErrorType(error)
  tracker.errorTypes.set(errorType, (tracker.errorTypes.get(errorType) || 0) + 1)
  
  return tracker.consecutiveErrors >= tracker.maxConsecutiveErrors
}

/**
 * 重置错误计数（成功执行后）
 */
function resetErrorCount(tracker: ErrorTracker): void {
  tracker.consecutiveErrors = 0
}

/**
 * 检测是否是相似的重复错误
 */
function isSimilarError(tracker: ErrorTracker, error: string): boolean {
  if (tracker.lastErrors.length < 2) return false
  const currentType = analyzeErrorType(error)
  const lastError = tracker.lastErrors[tracker.lastErrors.length - 2]
  const lastType = lastError ? analyzeErrorType(lastError) : 'unknown'
  return currentType === lastType && currentType !== 'unknown'
}

/**
 * 创建 Agent Loop
 */
export function createAgentLoop(config: AgentLoopConfig) {
  const { definition, session, provider, runConfig } = config
  const abortController = new AbortController()

  // 创建日志器和性能监控器
  const logger = new Logger('agent-loop')
  const monitor = new PerformanceMonitor()
  
  // 创建错误追踪器
  const errorTracker = createErrorTracker(3)

  // 合并 abort 信号
  if (runConfig.abort) {
    runConfig.abort.addEventListener("abort", () => abortController.abort())
  }

  /**
   * 获取可用工具定义（给 LLM）
   */
  function getToolDefinitions(): ToolDefinition[] {
    return definition.tools
      .map((toolId) => {
        const tool = ToolRegistry.get(toolId)
        if (!tool) return null
        return {
          name: tool.id,
          description: tool.description,
          parameters: tool.parameters,
        }
      })
      .filter((t): t is ToolDefinition => t !== null)
  }

  /**
   * 输出截断器实例
   * 需求 5.4: 在工具执行后应用截断
   */
  const outputTruncator = createOutputTruncator()

  /**
   * 执行单个工具调用
   */
  async function executeTool(
    toolCall: { id: string; name: string; args: unknown }
  ): Promise<{ result: Tool.Result; isError: boolean }> {
    const ctx: Tool.Context = {
      sessionID: runConfig.sessionId,
      cwd: runConfig.cwd,
      abort: abortController.signal,
    }

    try {
      // 使用性能监控测量工具执行
      const result = await monitor.measure(`tool:${toolCall.name}`, async () => {
        logger.debug(`执行工具: ${toolCall.name}`, { 
          toolId: toolCall.id, 
          args: toolCall.args 
        })
        return await ToolRegistry.execute(toolCall.name, toolCall.args, ctx)
      })
      
      // 应用输出截断 (需求 5.4)
      const truncationResult = outputTruncator.truncate(result.output)
      if (truncationResult.truncated) {
        logger.debug(`工具输出已截断: ${toolCall.name}`, {
          toolId: toolCall.id,
          originalLength: truncationResult.originalLength,
          truncatedLength: truncationResult.truncatedLength,
        })
      }
      
      logger.debug(`工具执行成功: ${toolCall.name}`, { 
        toolId: toolCall.id,
        outputLength: truncationResult.truncatedLength 
      })
      
      return { 
        result: {
          ...result,
          output: truncationResult.output,
        }, 
        isError: false 
      }
    } catch (error) {
      // 记录错误
      logger.error(`工具执行失败: ${toolCall.name}`, { 
        toolId: toolCall.id,
        error: error instanceof Error ? error.message : String(error)
      })
      
      // 处理 AgentError
      if (error instanceof AgentError) {
        const errorMessage = `${error.message}\n\n💡 建议: ${error.getRecoverySuggestion()}`
        return {
          result: {
            title: `Error (${error.code})`,
            output: errorMessage,
            metadata: { code: error.code, recoverable: error.recoverable, context: error.context },
          },
          isError: true,
        }
      }

      // 其他错误
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        result: {
          title: "Error",
          output: errorMessage,
        },
        isError: true,
      }
    }
  }

  /**
   * 将会话消息转换为 Provider 消息格式
   */
  function convertMessages(): Message[] {
    return session.messages.map((msg) => {
      if (msg.role === "user") {
        // 用户消息：提取文本、图片、音频或工具结果
        const contentParts: Array<TextContent | ImageContent | AudioContent> = []
        const toolResults: ToolResultContent[] = []

        for (const block of msg.content) {
          if (block.type === "text") {
            contentParts.push({ type: "text", text: block.text })
          } else if (block.type === "image") {
            contentParts.push({ type: "image", source: block.source })
          } else if (block.type === "audio") {
            contentParts.push({ type: "audio", source: block.source })
          } else if (block.type === "tool_result") {
            // 转换 content：如果是 ContentBlock[]，需要过滤并转换为 provider 支持的类型
            let content: string | Array<TextContent | ImageContent | AudioContent>
            if (typeof block.content === "string") {
              content = block.content
            } else {
              // 过滤出 provider 支持的内容类型
              content = block.content
                .filter((c): c is TextBlock | ImageBlock | AudioBlock => 
                  c.type === "text" || c.type === "image" || c.type === "audio"
                )
                .map((c) => {
                  if (c.type === "text") {
                    return { type: "text" as const, text: c.text }
                  } else if (c.type === "image") {
                    return { type: "image" as const, source: c.source }
                  } else {
                    return { type: "audio" as const, source: c.source }
                  }
                })
            }
            
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.tool_use_id,
              content,
              is_error: block.is_error,
            })
          }
        }

        // 如果有工具结果，返回数组格式（包含工具结果和其他内容）
        if (toolResults.length > 0) {
          const content: MessageContent = [...contentParts, ...toolResults]
          return { role: "user" as const, content }
        }

        // 如果有多模态内容（图片/音频），返回数组格式
        if (contentParts.length > 0 && contentParts.some(c => c.type !== "text")) {
          return { role: "user" as const, content: contentParts }
        }

        // 否则返回纯文本
        const textOnly = contentParts.filter((c): c is TextContent => c.type === "text")
        return { role: "user" as const, content: textOnly.map(c => c.text).join("") }
      } else {
        // 助手消息：转换内容块
        const content: Array<TextContent | ToolUseContent> = []

        for (const block of msg.content) {
          if (block.type === "text") {
            content.push({ type: "text", text: block.text })
          } else if (block.type === "tool_use") {
            content.push({
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: block.input,
            })
          }
        }

        return { role: "assistant" as const, content }
      }
    })
  }

  /**
   * 运行 Agent Loop
   */
  async function* run(input: string): AsyncGenerator<AgentEvent> {
    // 生成 TraceId
    const traceId = generateTraceId()
    
    logger.info('Agent Loop 开始', { 
      traceId,
      sessionId: runConfig.sessionId,
      agentType: definition.type,
      inputLength: input.length 
    })

    // 直接执行（TraceId 已通过日志记录）
    yield* executeLoop(input)
  }

  /**
   * 执行 Agent Loop 主逻辑
   */
  async function* executeLoop(input: string): AsyncGenerator<AgentEvent> {
    // 添加用户消息
    addMessage(session, "user", [{ type: "text", text: input }])

    const systemPrompt = buildSystemPrompt(definition, { cwd: runConfig.cwd })
    const tools = getToolDefinitions()
    const modelConfig = definition.model || DEFAULT_MODEL

    let stepCount = 0
    const maxSteps = definition.maxSteps || 100
    const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 }

    while (stepCount < maxSteps) {
      stepCount++
      
      logger.debug(`Agent Loop 步骤 ${stepCount}`, { 
        stepCount, 
        maxSteps,
        messageCount: session.messages.length 
      })

      // 检查是否被中止
      if (abortController.signal.aborted) {
        logger.warn('Agent Loop 被中止', { stepCount })
        const abortError = new AgentError(
          "Agent execution aborted",
          ErrorCode.INTERNAL_ERROR,
          false
        )
        yield { type: "error", error: abortError }
        break
      }

      // 调用 LLM（流式）
      const messages = convertMessages()
      
      // 流式响应收集
      let responseText = ""
      const toolCalls: { id: string; name: string; args: unknown }[] = []
      let usage = { inputTokens: 0, outputTokens: 0 }

      try {
        logger.debug('调用 LLM（流式）', { 
          model: modelConfig.model,
          messageCount: messages.length,
          toolCount: tools.length 
        })
        
        // 使用流式 API
        for await (const event of provider.stream({
          model: modelConfig,
          messages,
          system: systemPrompt,
          tools: tools.length > 0 ? tools : undefined,
          abortSignal: abortController.signal,
        })) {
          // 检查是否被中止
          if (abortController.signal.aborted) {
            break
          }
          
          switch (event.type) {
            case 'text':
              responseText += event.text
              // 实时输出文本
              yield { type: "text", content: responseText }
              break
            case 'tool_call':
              toolCalls.push({
                id: event.id,
                name: event.name,
                args: event.args,
              })
              break
            case 'message_end':
              usage = event.usage
              break
            case 'error':
              throw event.error
          }
        }
        
        logger.debug('LLM 流式响应完成', { 
          textLength: responseText.length,
          toolCallCount: toolCalls.length,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens
        })
      } catch (error) {
        // 如果是中止，不记录错误
        if (abortController.signal.aborted) {
          break
        }
        
        logger.error('LLM 调用失败', { 
          error: error instanceof Error ? error.message : String(error)
        })
        
        // 处理 AgentError
        if (error instanceof AgentError) {
          yield { type: "error", error }
        } else {
          // 转换为 AgentError
          const agentError = new AgentError(
            error instanceof Error ? error.message : String(error),
            ErrorCode.API_ERROR,
            false,
            { originalError: error }
          )
          yield { type: "error", error: agentError }
        }
        break
      }

      // 更新 token 使用
      totalUsage.inputTokens += usage.inputTokens
      totalUsage.outputTokens += usage.outputTokens
      updateUsage(session, usage)

      // 构建助手消息内容
      const assistantContent: ContentBlock[] = []

      // 添加文本响应（流式已经输出过了，这里只保存到会话）
      if (responseText) {
        assistantContent.push({ type: "text", text: responseText })
      }

      // 添加工具调用
      for (const toolCall of toolCalls) {
        const toolUseBlock: ToolUseBlock = {
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.args,
        }
        assistantContent.push(toolUseBlock)
      }

      // 保存助手消息
      if (assistantContent.length > 0) {
        addMessage(session, "assistant", assistantContent)
      }

      // 如果没有工具调用，结束循环
      if (toolCalls.length === 0) {
        logger.info('Agent Loop 完成（无工具调用）', { 
          stepCount,
          totalInputTokens: totalUsage.inputTokens,
          totalOutputTokens: totalUsage.outputTokens
        })
        break
      }

      // 执行工具调用
      const toolResults: ContentBlock[] = []

      for (const toolCall of toolCalls) {
        yield {
          type: "tool_start",
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.args,
        }

        const { result, isError } = await executeTool(toolCall)

        yield {
          type: "tool_end",
          id: toolCall.id,
          result,
          isError,
        }

        // 追踪错误
        if (isError) {
          const shouldStop = trackError(errorTracker, result.output)
          
          // 检测重复错误模式
          if (shouldStop || isSimilarError(errorTracker, result.output)) {
            logger.warn('检测到重复错误，添加恢复提示', {
              consecutiveErrors: errorTracker.consecutiveErrors,
              lastError: result.output.substring(0, 100)
            })
            
            // 分析错误类型并生成针对性恢复策略
            const errorType = analyzeErrorType(result.output)
            const strategy = getRecoveryStrategy(errorType, toolCall.name)
            
            // 添加智能恢复提示到工具结果
            const recoveryHint = `

⚠️ **自驱力系统检测到问题** (连续 ${errorTracker.consecutiveErrors} 次类似错误)

**错误类型**: ${errorType}
**工具**: ${toolCall.name}

**恢复策略**:
${strategy}

**重要**: 请不要重复相同的操作，必须调整策略后再试。`
            
            result.output += recoveryHint
          }
        } else {
          // 成功执行，重置错误计数
          resetErrorCount(errorTracker)
        }

        const toolResultBlock: ToolResultBlock = {
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: result.output,
          is_error: isError ? true : undefined,
        }
        toolResults.push(toolResultBlock)
      }

      // 添加工具结果作为用户消息（Anthropic 格式要求）
      if (toolResults.length > 0) {
        addMessage(session, "user", toolResults)
      }
    }

    // 检查是否达到最大步数
    if (stepCount >= maxSteps) {
      logger.warn('Agent Loop 达到最大步数限制', { maxSteps, stepCount })
      const maxStepsError = new AgentError(
        `Agent reached maximum steps limit (${maxSteps})`,
        ErrorCode.INTERNAL_ERROR,
        false,
        { maxSteps, stepCount }
      )
      yield { type: "error", error: maxStepsError }
    }

    logger.info('Agent Loop 结束', { 
      stepCount,
      totalInputTokens: totalUsage.inputTokens,
      totalOutputTokens: totalUsage.outputTokens
    })

    // 输出性能统计
    const llmStats = monitor.getStats('llm:chat')
    if (llmStats) {
      logger.info('LLM 性能统计', {
        count: llmStats.count,
        avgDuration: Math.round(llmStats.avg_duration),
        successRate: (llmStats.success_rate * 100).toFixed(1) + '%'
      })
    }

    yield { type: "done", usage: totalUsage }
  }

  /**
   * 中止执行
   */
  function abort() {
    abortController.abort()
  }

  return {
    run,
    abort,
  }
}

/**
 * Agent Loop 类型
 */
export type AgentLoop = ReturnType<typeof createAgentLoop>
