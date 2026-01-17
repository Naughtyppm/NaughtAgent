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
  content: string | ContentBlock[]  // 支持多模态内容
  is_error?: boolean
}

/**
 * 图片内容块
 */
export interface ImageBlock {
  type: "image"
  source: {
    type: "base64" | "url"
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"
    data: string  // base64 数据或 URL
  }
}

/**
 * 音频内容块
 */
export interface AudioBlock {
  type: "audio"
  source: {
    type: "base64"
    media_type: "audio/wav" | "audio/mp3"
    data: string  // base64 数据
  }
}

/**
 * 消息内容块
 */
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ImageBlock | AudioBlock

/**
 * 停止原因
 */
export type StopReason = "end_turn" | "max_tokens" | "tool_use" | "stop_sequence"

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
  /** 停止原因（仅 assistant 消息有） */
  stop_reason?: StopReason
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
  content: string | ContentBlock[],
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

/**
 * 创建图片消息
 */
export function createImageMessage(
  imageData: string,
  mediaType: ImageBlock["source"]["media_type"],
  sourceType: "base64" | "url" = "base64"
): Message {
  return {
    id: generateMessageId(),
    role: "user",
    content: [{
      type: "image",
      source: { type: sourceType, media_type: mediaType, data: imageData }
    }],
    timestamp: Date.now()
  }
}

/**
 * 创建音频消息
 */
export function createAudioMessage(
  audioData: string,
  mediaType: AudioBlock["source"]["media_type"]
): Message {
  return {
    id: generateMessageId(),
    role: "user",
    content: [{
      type: "audio",
      source: { type: "base64", media_type: mediaType, data: audioData }
    }],
    timestamp: Date.now()
  }
}

/**
 * 从消息中提取图片
 */
export function getImages(message: Message): ImageBlock[] {
  return message.content.filter(
    (block): block is ImageBlock => block.type === "image"
  )
}

/**
 * 从消息中提取音频
 */
export function getAudios(message: Message): AudioBlock[] {
  return message.content.filter(
    (block): block is AudioBlock => block.type === "audio"
  )
}
