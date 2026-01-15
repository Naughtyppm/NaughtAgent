/**
 * Message 消息系统
 *
 * 定义会话中的消息结构
 */

/**
 * 消息角色
 */
export type MessageRole = "user" | "assistant"

/**
 * 文本内容块
 */
export interface TextBlock {
  type: "text"
  text: string
}

/**
 * 工具调用块
 */
export interface ToolUseBlock {
  type: "tool_use"
  id: string
  name: string
  input: unknown
}

/**
 * 工具结果块
 */
export interface ToolResultBlock {
  type: "tool_result"
  tool_use_id: string
  content: string
  is_error?: boolean
}

/**
 * 消息内容块
 */
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

/**
 * 消息
 */
export interface Message {
  /** 消息 ID */
  id: string
  /** 角色 */
  role: MessageRole
  /** 内容块列表 */
  content: ContentBlock[]
  /** 时间戳 */
  timestamp: number
}

/**
 * 生成消息 ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 创建用户消息
 */
export function createUserMessage(text: string): Message {
  return {
    id: generateMessageId(),
    role: "user",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
  }
}

/**
 * 创建助手消息
 */
export function createAssistantMessage(content: ContentBlock[]): Message {
  return {
    id: generateMessageId(),
    role: "assistant",
    content,
    timestamp: Date.now(),
  }
}

/**
 * 创建工具结果块
 */
export function createToolResult(
  toolUseId: string,
  content: string,
  isError = false
): ToolResultBlock {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content,
    is_error: isError ? true : undefined,
  }
}

/**
 * 从消息中提取文本内容
 */
export function getMessageText(message: Message): string {
  return message.content
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
}

/**
 * 从消息中提取工具调用
 */
export function getToolCalls(message: Message): ToolUseBlock[] {
  return message.content.filter(
    (block): block is ToolUseBlock => block.type === "tool_use"
  )
}

/**
 * 检查消息是否包含工具调用
 */
export function hasToolCalls(message: Message): boolean {
  return message.content.some((block) => block.type === "tool_use")
}
