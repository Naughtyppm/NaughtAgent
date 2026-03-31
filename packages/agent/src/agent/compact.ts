/**
 * Context Compact - 三层压缩管道
 *
 * Layer 1: microCompact - 每轮静默执行，替换旧 tool_result 为占位符
 * Layer 2: autoCompact - Token 超阈值时，LLM 生成摘要替换全部历史
 * Layer 3: compact 工具 - LLM 主动触发压缩（注册为工具）
 */

import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import type { Session } from "../session"
import type { ToolResultBlock } from "../session"
import { AUTO_COMPACT_TOKEN_THRESHOLD } from "../config"

// ============================================================================
// 配置
// ============================================================================

/** 保留最近 N 个 tool_result 不压缩 */
const KEEP_RECENT_RESULTS = 3

/** tool_result 内容长度阈值，低于此值不替换 */
const MIN_CONTENT_LENGTH = 100

// ============================================================================
// Layer 1: microCompact
// ============================================================================

/**
 * 微压缩：替换旧 tool_result 内容为占位符
 *
 * 直接修改 session.messages（原地操作，和教材一致）
 * 保留最近 KEEP_RECENT_RESULTS 个 tool_result 不动
 */
export function microCompact(session: Session): void {
  const messages = session.messages

  // 1. 收集所有 tool_result 的位置
  const toolResults: Array<{
    msgIdx: number
    blockIdx: number
    block: ToolResultBlock
  }> = []

  for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
    const msg = messages[msgIdx]
    if (msg.role !== "user") continue
    for (let blockIdx = 0; blockIdx < msg.content.length; blockIdx++) {
      const block = msg.content[blockIdx]
      if (block.type === "tool_result") {
        toolResults.push({ msgIdx, blockIdx, block })
      }
    }
  }

  // 不够多，不需要压缩
  if (toolResults.length <= KEEP_RECENT_RESULTS) return

  // 2. 建立 tool_use_id → tool_name 映射
  const toolNameMap = new Map<string, string>()
  for (const msg of messages) {
    if (msg.role !== "assistant") continue
    for (const block of msg.content) {
      if (block.type === "tool_use") {
        toolNameMap.set(block.id, block.name)
      }
    }
  }

  // 3. 替换旧的 tool_result（保留最近 KEEP_RECENT_RESULTS 个）
  const toClear = toolResults.slice(0, -KEEP_RECENT_RESULTS)
  for (const { block } of toClear) {
    const content = typeof block.content === "string"
      ? block.content
      : JSON.stringify(block.content)

    if (content.length <= MIN_CONTENT_LENGTH) continue

    const toolName = toolNameMap.get(block.tool_use_id) ?? "unknown"
    block.content = `[Previous: used ${toolName}]`
  }
}

// ============================================================================
// Token 估算
// ============================================================================

/**
 * 粗估 Token 数（4 字符 ≈ 1 token）
 */
export function estimateTokens(session: Session): number {
  let chars = 0
  for (const msg of session.messages) {
    for (const block of msg.content) {
      if (block.type === "text") {
        chars += block.text.length
      } else if (block.type === "tool_result") {
        chars += typeof block.content === "string"
          ? block.content.length
          : JSON.stringify(block.content).length
      } else if (block.type === "tool_use") {
        chars += JSON.stringify(block.input).length + block.name.length
      }
    }
  }
  return Math.ceil(chars / 4)
}

// ============================================================================
// Layer 2: autoCompact
// ============================================================================

/** compact 后保留最近读取的文件数量上限 */
const MAX_PRESERVED_FILES = 3
/** 每个保留文件的最大行数 */
const MAX_PRESERVED_LINES = 150

/**
 * 从 session 消息中提取最近读取的文件内容
 *
 * 逆序扫描，找到最近 N 个 read 工具的 tool_result，
 * 提取文件路径和内容，去重后返回。
 */
function extractRecentFileContents(session: Session): Array<{ path: string; content: string }> {
  // 建立 tool_use_id → { name, input } 映射
  const toolUseMap = new Map<string, { name: string; input: unknown }>()
  for (const msg of session.messages) {
    if (msg.role !== "assistant") continue
    for (const block of msg.content) {
      if (block.type === "tool_use") {
        toolUseMap.set(block.id, { name: block.name, input: block.input })
      }
    }
  }

  // 逆序收集 read 工具的 tool_result
  const files: Array<{ path: string; content: string }> = []
  const seenPaths = new Set<string>()

  for (let i = session.messages.length - 1; i >= 0 && files.length < MAX_PRESERVED_FILES; i--) {
    const msg = session.messages[i]
    if (msg.role !== "user") continue
    for (let j = msg.content.length - 1; j >= 0 && files.length < MAX_PRESERVED_FILES; j--) {
      const block = msg.content[j]
      if (block.type !== "tool_result") continue
      const toolUse = toolUseMap.get((block as ToolResultBlock).tool_use_id)
      if (!toolUse || toolUse.name !== "read") continue

      const input = toolUse.input as Record<string, unknown>
      const filePath = String(input.filePath || input.file_path || "unknown")
      if (seenPaths.has(filePath)) continue
      seenPaths.add(filePath)

      const resultContent = typeof block.content === "string"
        ? block.content : JSON.stringify(block.content)

      // 跳过已被 microCompact 替换的占位符
      if (resultContent.startsWith("[Previous:")) continue

      // 截断过长的文件内容
      const contentLines = resultContent.split("\n")
      const truncated = contentLines.length > MAX_PRESERVED_LINES
        ? contentLines.slice(0, MAX_PRESERVED_LINES).join("\n") + `\n... (truncated, ${contentLines.length} lines total)`
        : resultContent

      files.push({ path: filePath, content: truncated })
    }
  }

  return files.reverse() // 恢复正序
}

/**
 * 自动压缩：LLM 生成摘要替换全部历史
 *
 * 改进：压缩后保留最近读取的文件内容，避免 LLM 重读
 *
 * 返回是否触发了压缩
 */
export async function autoCompact(
  session: Session,
  summarizer: (text: string) => Promise<string>,
): Promise<boolean> {
  const tokens = estimateTokens(session)
  if (tokens <= AUTO_COMPACT_TOKEN_THRESHOLD) return false

  // 0. 存档完整对话到 .transcripts/（压缩前保留，防止信息永久丢失）
  try {
    const transcriptDir = join(process.cwd(), ".transcripts")
    mkdirSync(transcriptDir, { recursive: true })
    const timestamp = Date.now()
    const transcriptPath = join(transcriptDir, `${timestamp}.json`)
    writeFileSync(transcriptPath, JSON.stringify(session.messages, null, 2))
  } catch {
    // 存档失败不阻塞压缩流程
  }

  // 1. 构建对话文本（给 LLM 摘要用）
  const lines: string[] = []
  for (const msg of session.messages) {
    const parts: string[] = []
    for (const block of msg.content) {
      if (block.type === "text") {
        parts.push(block.text)
      } else if (block.type === "tool_use") {
        parts.push(`[Tool: ${block.name}]`)
      } else if (block.type === "tool_result") {
        const content = typeof block.content === "string"
          ? block.content : JSON.stringify(block.content)
        parts.push(`[Result: ${content.slice(0, 200)}]`)
      }
    }
    if (parts.length > 0) {
      lines.push(`${msg.role}: ${parts.join(" ")}`)
    }
  }

  // 截断避免超长（给摘要 LLM 的输入也要控制）
  const conversationText = lines.join("\n\n").slice(0, 80000)

  // 2. LLM 生成摘要
  const summary = await summarizer(conversationText)

  // 3. 提取最近读取的文件内容（compact 后保留，避免重读）
  const preservedFiles = extractRecentFileContents(session)
  let preservedSection = ""
  if (preservedFiles.length > 0) {
    preservedSection = "\n\n## Preserved File Contents (DO NOT re-read these files)\n\n"
    for (const file of preservedFiles) {
      preservedSection += `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\`\n\n`
    }
  }

  // 4. 替换全部消息为压缩后的 2 条
  session.messages.length = 0
  session.messages.push(
    {
      id: `compact-user-${Date.now()}`,
      role: "user",
      content: [{
        type: "text",
        text: `[Conversation compressed. Estimated ${tokens} tokens → summary]\n\n${summary}${preservedSection}\n\n` +
          `IMPORTANT: All files mentioned above are already in context — their content is preserved above. ` +
          `Do NOT re-read them. Proceed with the next step of your task based on this summary.`,
      }],
      timestamp: Date.now(),
    },
    {
      id: `compact-assistant-${Date.now()}`,
      role: "assistant",
      content: [{
        type: "text",
        text: "Understood. I have the context from the summary and the preserved file contents. I will proceed without re-reading files already shown above.",
      }],
      timestamp: Date.now(),
    },
  )

  return true
}

// ============================================================================
// 检查是否需要自动压缩（不执行，只判断）
// ============================================================================

export function shouldAutoCompact(session: Session): boolean {
  return estimateTokens(session) > AUTO_COMPACT_TOKEN_THRESHOLD
}
