/**
 * Context Compact - 三层压缩管道
 *
 * Layer 1: microCompact - 每轮静默执行，替换旧 tool_result 为占位符
 * Layer 2: autoCompact - Token 超阈值时，LLM 生成摘要替换全部历史
 * Layer 3: compact 工具 - LLM 主动触发压缩（注册为工具）
 */

import { writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, existsSync, readFileSync, appendFileSync } from "node:fs"
import { join } from "node:path"
import type { Session } from "../session"
import type { ToolResultBlock } from "../session"
import { AUTO_COMPACT_TOKEN_THRESHOLD, COMPACT_SUMMARY_INPUT_LIMIT, COMPACT_MEMORY_INPUT_LIMIT } from "../config"

// ============================================================================
// Compact 提示词（CC 9 段结构 + <analysis>/<summary> 模式）
// ============================================================================

export const COMPACT_SYSTEM_PROMPT = `You are a conversation summarizer. Your task is to create a structured summary that preserves all context needed for an AI assistant to continue working seamlessly.

Use the following structure in your <summary> output (skip sections that have no content):

1. **Primary Request and Intent**: The user's original goal and what they are trying to accomplish
2. **Key Technical Concepts**: Important technical details, patterns, or domain knowledge discussed
3. **Files and Code Sections**: ALL file paths read, created, or modified (the assistant MUST NOT re-read these)
4. **Errors and Fixes**: Any errors encountered and how they were resolved
5. **Problem Solving**: Key decisions, trade-offs, and reasoning chains
6. **All User Messages**: Preserve the essence of every user message (preferences, constraints, style)
7. **Pending Tasks**: Incomplete items or known issues that need to be addressed
8. **Current Work**: What the assistant was doing when compression happened
9. **Optional Next Step**: The single most logical next action to take

IMPORTANT rules:
- List EVERY file path that was read — the agent must NOT re-read them after compression
- Preserve ALL user preferences and constraints mentioned anywhere in the conversation
- Include specific code snippets, function names, and line numbers when relevant
- Do NOT lose any pending tasks or action items`

export const COMPACT_USER_PROMPT_PREFIX = `Summarize the following conversation. First draft your analysis inside <analysis> tags, then write the final summary inside <summary> tags.

The <analysis> section is your scratchpad — think through what matters, what can be dropped, and what must be preserved. The <summary> section is what the agent will see.

Conversation:
`

/**
 * 从 LLM 摘要响应中提取 <summary> 内容（剥离 <analysis> 部分）
 *
 * CC 的 formatCompactSummary() 模式：LLM 在 <analysis> 中思考，
 * 只有 <summary> 内容被保留到压缩后的对话中。
 */
export function formatCompactSummary(response: string): string {
  // 提取 <summary> 标签内的内容
  const summaryMatch = response.match(/<summary>([\s\S]*?)<\/summary>/i)
  if (summaryMatch) {
    return summaryMatch[1].trim()
  }
  // 如果没有 <summary> 标签，移除 <analysis> 部分后返回剩余内容
  const withoutAnalysis = response.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim()
  return withoutAnalysis || response
}

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
  options?: {
    /** 独立的记忆提取器（不复用 summarizer，使用专用 system prompt） */
    memoryExtractor?: (text: string) => Promise<string>
    /** 项目工作目录（记忆写入路径） */
    cwd?: string
  },
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
    cleanOldTranscripts(transcriptDir, 7 * 24 * 60 * 60 * 1000) // 保留 7 天
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
  const conversationText = lines.join("\n\n").slice(0, COMPACT_SUMMARY_INPUT_LIMIT)

  // 2. LLM 生成摘要（使用 9 段结构 + <analysis>/<summary> 模式）
  const rawSummary = await summarizer(conversationText)
  const summary = formatCompactSummary(rawSummary)

  // 2.5 提取需要跨会话持久化的关键信息，append 到 memory.md
  try {
    if (options?.memoryExtractor && options?.cwd) {
      await persistMemoryFromCompact(conversationText, options.memoryExtractor, options.cwd)
    }
  } catch {
    // 持久化失败不阻塞压缩流程
  }

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

// ============================================================================
// 过期 transcript 清理
// ============================================================================

function cleanOldTranscripts(dir: string, maxAge: number): void {
  try {
    const now = Date.now()
    for (const file of readdirSync(dir)) {
      const filePath = join(dir, file)
      const stat = statSync(filePath)
      if (now - stat.mtimeMs > maxAge) {
        unlinkSync(filePath)
      }
    }
  } catch {
    // 清理失败不影响主流程
  }
}

// ============================================================================
// Compact 记忆持久化：压缩时自动提取关键信息写入 memory.md
// ============================================================================

export const MEMORY_EXTRACT_PROMPT = `Based on the conversation below, extract ONLY information that should persist across sessions. Return ONLY the items, one per line, prefixed with "- ". If nothing worth persisting, return "NONE".

What to extract:
- User preferences and workflow patterns confirmed in this session
- Key architectural decisions made
- Bugs found and their root causes
- Important file paths or project conventions discovered

What NOT to extract:
- Temporary task progress (what step you're on)
- File contents already in code
- Generic knowledge (how Git works, etc.)

Conversation:
`

/**
 * 从即将被压缩的对话中提取值得持久化的信息，append 到 .naughty/memory.md
 *
 * @param extractor 独立的提取器函数（使用 MEMORY_EXTRACT_PROMPT 作为 system prompt，
 *   不复用 summarizer，避免 COMPACT_SYSTEM_PROMPT 干扰输出格式）
 * @param cwd 项目工作目录（记忆写入到对应项目的 .naughty/memory.md）
 */
async function persistMemoryFromCompact(
  conversationText: string,
  extractor: (text: string) => Promise<string>,
  cwd: string,
): Promise<void> {
  // 截取对话给提取器（比摘要更短，只需要关键信息）
  const input = conversationText.slice(0, COMPACT_MEMORY_INPUT_LIMIT)
  const extracted = await extractor(input)

  // 没有值得持久化的内容
  if (!extracted || extracted.trim() === "NONE" || extracted.trim().length < 10) return

  // 读取已有 memory 避免重复（使用传入的 cwd，而非 process.cwd()）
  const memoryDir = join(cwd, ".naughty")
  const memoryPath = join(memoryDir, "memory.md")
  let existingMemory = ""
  if (existsSync(memoryPath)) {
    existingMemory = readFileSync(memoryPath, "utf-8")
  }

  // 过滤掉已经存在的行（简单去重）
  const newLines = extracted
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .filter((line) => !existingMemory.includes(line.slice(2).trim()))

  if (newLines.length === 0) return

  // append 到 memory.md
  mkdirSync(memoryDir, { recursive: true })
  const section = `\n\n## Auto-extracted (${new Date().toISOString().slice(0, 10)})\n${newLines.join("\n")}\n`
  appendFileSync(memoryPath, section, "utf-8")
}
