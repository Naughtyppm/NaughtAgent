/**
 * 消息格式转换器
 *
 * Session 内部消息格式 ↔ Provider API 消息格式
 */

import type {
  Message as ProviderMessage,
  MessageContent,
  TextContent,
  ImageContent,
  AudioContent,
  ToolUseContent,
  ToolResultContent,
  ThinkingContent,
} from "../provider/types"

import type {
  ContentBlock,
  TextBlock,
  ImageBlock,
  AudioBlock,
  ThinkingBlock,
  ToolResultBlock,
  ToolUseBlock,
} from "../session/message"
import type { Session } from "../session/session"

/**
 * 将 Session 消息列表转换为 Provider 消息格式
 *
 * 包含自动修复：检测孤立的 tool_use（没有对应 tool_result），
 * 自动补充缺失的 tool_result，避免 API 400 错误。
 */
export function convertSessionMessages(session: Session): ProviderMessage[] {
  repairOrphanToolUse(session)
  return session.messages.map(convertMessage)
}

/**
 * 修复孤立的 tool_use：如果 assistant 消息含 tool_use，
 * 但紧接的 user 消息中没有对应的 tool_result，自动补充。
 *
 * 场景：agent 超时/崩溃后 session 被保存，tool_result 丢失。
 */
function repairOrphanToolUse(session: Session): void {
  const messages = session.messages
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role !== "assistant") continue

    // 收集该 assistant 消息中所有 tool_use id
    const toolUseIds = msg.content
      .filter((b): b is ToolUseBlock => b.type === "tool_use")
      .map(b => b.id)
    if (toolUseIds.length === 0) continue

    // 检查下一条 user 消息是否包含所有 tool_result
    const nextMsg = messages[i + 1]
    const existingResultIds = new Set<string>()
    if (nextMsg && nextMsg.role === "user") {
      for (const block of nextMsg.content) {
        if (block.type === "tool_result") {
          existingResultIds.add(block.tool_use_id)
        }
      }
    }

    // 找出缺失的 tool_result
    const missingIds = toolUseIds.filter(id => !existingResultIds.has(id))
    if (missingIds.length === 0) continue

    // 构建缺失的 tool_result blocks
    const patchBlocks: ContentBlock[] = missingIds.map(id => ({
      type: "tool_result" as const,
      tool_use_id: id,
      content: "[Error: tool execution was interrupted]",
      is_error: true,
    }))

    if (nextMsg && nextMsg.role === "user") {
      // 追加到已有 user 消息
      nextMsg.content.push(...patchBlocks)
    } else {
      // 插入新 user 消息
      messages.splice(i + 1, 0, {
        id: `repair-${Date.now()}-${i}`,
        role: "user",
        content: patchBlocks,
        timestamp: Date.now(),
      })
    }
  }
}

function convertMessage(msg: { role: string; content: ContentBlock[] }): ProviderMessage {
  if (msg.role === "user") {
    return { role: "user", content: convertUserContent(msg.content) }
  }
  return { role: "assistant", content: convertAssistantContent(msg.content) }
}

/**
 * 用户消息：分离 text/image/audio 和 tool_result
 */
function convertUserContent(blocks: ContentBlock[]): MessageContent {
  const parts: Array<TextContent | ImageContent | AudioContent> = []
  const toolResults: ToolResultContent[] = []

  for (const block of blocks) {
    switch (block.type) {
      case "text":
        parts.push({ type: "text", text: block.text })
        break
      case "image":
        parts.push({ type: "image", source: block.source })
        break
      case "audio":
        parts.push({ type: "audio", source: block.source })
        break
      case "tool_result":
        toolResults.push(convertToolResult(block))
        break
    }
  }

  // 有工具结果 → 数组格式
  if (toolResults.length > 0) {
    return [...parts, ...toolResults]
  }
  // 有多模态 → 数组格式
  if (parts.some(c => c.type !== "text")) {
    return parts
  }
  // 纯文本 → 字符串格式
  return parts.filter((c): c is TextContent => c.type === "text").map(c => c.text).join("")
}

/**
 * 助手消息：thinking + text + tool_use
 *
 * 启用 thinking 时，assistant 消息必须以 thinking 块开头（Anthropic API 要求）
 */
function convertAssistantContent(blocks: ContentBlock[]): Array<ThinkingContent | TextContent | ToolUseContent> {
  const content: Array<ThinkingContent | TextContent | ToolUseContent> = []
  for (const block of blocks) {
    if (block.type === "thinking") {
      content.push({ type: "thinking", thinking: (block as ThinkingBlock).thinking, signature: (block as ThinkingBlock).signature })
    } else if (block.type === "text") {
      content.push({ type: "text", text: block.text })
    } else if (block.type === "tool_use") {
      content.push({ type: "tool_use", id: block.id, name: block.name, input: block.input })
    }
  }
  return content
}

/**
 * 转换工具结果块
 */
function convertToolResult(block: ToolResultBlock): ToolResultContent {
  let content: string | Array<TextContent | ImageContent | AudioContent>
  if (typeof block.content === "string") {
    content = block.content
  } else {
    content = block.content
      .filter((c): c is TextBlock | ImageBlock | AudioBlock =>
        c.type === "text" || c.type === "image" || c.type === "audio"
      )
      .map((c): TextContent | ImageContent | AudioContent => {
        if (c.type === "text") return { type: "text", text: c.text }
        if (c.type === "image") return { type: "image", source: c.source }
        return { type: "audio", source: c.source }
      })
  }
  return {
    type: "tool_result",
    tool_use_id: block.tool_use_id,
    content,
    is_error: block.is_error,
  }
}
