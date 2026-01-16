/**
 * Kiro Provider
 *
 * 通过 Kiro IDE 的 Token 调用 Claude API
 * 移植自 kiro_lite.py
 */

import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import * as crypto from "crypto"
import { zodToJsonSchema } from "zod-to-json-schema"
import type {
  LLMProvider,
  KiroConfig,
  ChatParams,
  ChatResult,
  StreamEvent,
  Message,
  ToolDefinition,
} from "./types"
import { mapToKiroModel } from "./types"

// ==================== 常量 ====================

const KIRO_API_URL =
  "https://q.us-east-1.amazonaws.com/generateAssistantResponse"
const TOKEN_REFRESH_URL = "https://public.identity.kiro.dev/oauth2/token"

// ==================== Token 管理 ====================

interface TokenInfo {
  accessToken: string
  refreshToken: string
  expiresAt: Date | null
  email: string
  machineId: string
  filePath: string
}

let tokenCache: TokenInfo | null = null
let refreshLock = false

/**
 * 获取默认 Token 缓存目录
 */
function getDefaultTokenCacheDir(): string {
  return path.join(os.homedir(), ".aws", "sso", "cache")
}

/**
 * 扫描本地 Token 文件
 */
function scanLocalTokens(cacheDir: string): Array<{
  file: string
  email: string
  accessToken: string
  refreshToken: string
  expiresAt: string | null
}> {
  const tokens: Array<{
    file: string
    email: string
    accessToken: string
    refreshToken: string
    expiresAt: string | null
  }> = []

  if (!fs.existsSync(cacheDir)) {
    return tokens
  }

  const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"))

  for (const file of files) {
    try {
      const filePath = path.join(cacheDir, file)
      const content = fs.readFileSync(filePath, "utf-8")
      const data = JSON.parse(content)

      if (data.accessToken && data.refreshToken) {
        tokens.push({
          file: filePath,
          email: data.email || path.basename(file, ".json"),
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt || null,
        })
      }
    } catch {
      // 忽略解析错误
    }
  }

  return tokens
}

/**
 * 加载 Token
 */
function loadToken(
  cacheDir: string,
  forceReload = false
): TokenInfo | null {
  // 如果不强制重载，且缓存有效，直接返回
  if (!forceReload && tokenCache) {
    if (!tokenCache.expiresAt || tokenCache.expiresAt > new Date()) {
      return tokenCache
    }
  }

  const tokens = scanLocalTokens(cacheDir)
  if (tokens.length === 0) {
    return null
  }

  const t = tokens[0]
  let expiresAt: Date | null = null

  if (t.expiresAt) {
    try {
      expiresAt = new Date(t.expiresAt.replace("Z", "+00:00"))
    } catch {
      // 忽略解析错误
    }
  }

  // 生成 machine_id
  const machineId = crypto
    .createHash("sha256")
    .update(`${t.email}-lite`)
    .digest("hex")
    .substring(0, 32)

  tokenCache = {
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    expiresAt,
    email: t.email,
    machineId,
    filePath: t.file,
  }

  return tokenCache
}

/**
 * 检查是否需要刷新 Token（过期前 5 分钟）
 */
function needsRefresh(token: TokenInfo): boolean {
  if (!token.expiresAt) return false
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000)
  return token.expiresAt < fiveMinutesFromNow
}

/**
 * 刷新 Token
 */
async function refreshToken(_proxy?: string): Promise<boolean> {
  if (refreshLock || !tokenCache || !tokenCache.refreshToken) {
    return false
  }

  refreshLock = true

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokenCache.refreshToken,
      client_id: "kiro-ide",
    })

    const fetchOptions: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }

    // Node.js 原生 fetch 不支持 proxy，需要用环境变量或其他方式
    // 这里简化处理，依赖环境变量 HTTPS_PROXY
    const resp = await fetch(TOKEN_REFRESH_URL, fetchOptions)

    if (resp.ok) {
      const data = (await resp.json()) as {
        access_token?: string
        refresh_token?: string
        expires_in?: number
      }
      const newAccess = data.access_token
      const newRefresh = data.refresh_token || tokenCache.refreshToken
      const expiresIn = data.expires_in || 3600

      if (newAccess) {
        tokenCache.accessToken = newAccess
        tokenCache.refreshToken = newRefresh
        tokenCache.expiresAt = new Date(Date.now() + expiresIn * 1000)

        // 保存到文件
        if (tokenCache.filePath && fs.existsSync(tokenCache.filePath)) {
          try {
            const fileContent = fs.readFileSync(tokenCache.filePath, "utf-8")
            const fileData = JSON.parse(fileContent)
            fileData.accessToken = newAccess
            fileData.refreshToken = newRefresh
            fileData.expiresAt = tokenCache.expiresAt.toISOString()
            fs.writeFileSync(
              tokenCache.filePath,
              JSON.stringify(fileData, null, 2),
              "utf-8"
            )
          } catch {
            // 忽略保存错误
          }
        }

        console.log(`[Kiro] Token refreshed, expires at ${tokenCache.expiresAt}`)
        return true
      }
    } else {
      console.warn(`[Kiro] Token refresh failed: ${resp.status}`)
    }
  } catch (err) {
    console.warn(`[Kiro] Token refresh error: ${err}`)
  } finally {
    refreshLock = false
  }

  return false
}

// ==================== 请求构建 ====================

/**
 * 构建请求头
 */
function buildHeaders(token: string, machineId: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-amzn-codewhisperer-optout": "true",
    "x-amzn-kiro-agent-mode": "vibe",
    "x-amz-user-agent": `aws-sdk-js/1.0.0 KiroIDE-1.7.1-${machineId}`,
    "user-agent": `aws-sdk-js/1.0.0 ua/2.1 os/${process.platform} lang/js md/nodejs#${process.version} api/codewhispererruntime#1.0.0 m/E KiroIDE-1.7.1-${machineId}`,
    "amz-sdk-invocation-id": crypto.randomUUID(),
    "amz-sdk-request": "attempt=1; max=1",
    Authorization: `Bearer ${token}`,
    Connection: "close",
  }
}

/**
 * 转换消息格式（Anthropic -> Kiro）
 */
function convertMessages(
  messages: Message[],
  system: string | undefined,
  modelId: string
): {
  userContent: string
  history: Array<Record<string, unknown>>
  toolResults: Array<Record<string, unknown>>
} {
  const history: Array<Record<string, unknown>> = []
  let userContent = ""
  let currentToolResults: Array<Record<string, unknown>> = []

  // 处理 system prompt
  let systemText = system || ""

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const isLast = i === messages.length - 1
    const content = msg.content

    // 提取文本和 tool_results
    let textParts: string[] = []
    const toolResults: Array<Record<string, unknown>> = []

    if (typeof content === "string") {
      textParts = [content]
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "text") {
          textParts.push(block.text)
        } else if (block.type === "tool_result") {
          let trContent = block.content
          if (typeof trContent !== "string") {
            trContent = String(trContent)
          }

          toolResults.push({
            content: [{ text: trContent }],
            status: block.is_error ? "error" : "success",
            toolUseId: block.tool_use_id,
          })
        }
      }
    }

    const textContent = textParts.join("\n")

    // 处理工具结果
    if (toolResults.length > 0) {
      if (isLast) {
        currentToolResults = toolResults
        userContent = textContent || "Tool results provided."
      } else {
        history.push({
          userInputMessage: {
            content: textContent || "Tool results provided.",
            modelId,
            origin: "AI_EDITOR",
            userInputMessageContext: {
              toolResults,
            },
          },
        })
      }
      continue
    }

    if (msg.role === "user") {
      // 合并 system prompt 到第一条 user 消息
      let finalContent = textContent
      if (systemText && history.length === 0) {
        finalContent = systemText + "\n\n" + textContent
        systemText = "" // 只合并一次
      }

      if (isLast) {
        userContent = finalContent || "Continue"
      } else {
        history.push({
          userInputMessage: {
            content: finalContent || "Continue",
            modelId,
            origin: "AI_EDITOR",
          },
        })
      }
    } else if (msg.role === "assistant") {
      const toolUses: Array<Record<string, unknown>> = []
      let assistantText = ""

      if (typeof content === "string") {
        assistantText = content
      } else if (Array.isArray(content)) {
        const texts: string[] = []
        for (const block of content) {
          if (block.type === "text") {
            texts.push(block.text)
          } else if (block.type === "tool_use") {
            toolUses.push({
              toolUseId: block.id,
              name: block.name,
              input: block.input,
            })
          }
        }
        assistantText = texts.join("\n")
      }

      // 确保 assistant 消息有内容
      if (!assistantText) {
        assistantText = "I understand."
      }

      const assistantMsg: Record<string, unknown> = {
        assistantResponseMessage: {
          content: assistantText,
          ...(toolUses.length > 0 ? { toolUses } : {}),
        },
      }

      history.push(assistantMsg)
    }
  }

  // 修复历史交替
  const fixedHistory = fixHistoryAlternation(history, modelId)

  return {
    userContent: userContent || "Continue",
    history: fixedHistory,
    toolResults: currentToolResults,
  }
}

/**
 * 修复历史记录，确保 user/assistant 严格交替
 */
function fixHistoryAlternation(
  history: Array<Record<string, unknown>>,
  modelId: string
): Array<Record<string, unknown>> {
  if (history.length === 0) return history

  const fixed: Array<Record<string, unknown>> = []

  for (const item of history) {
    const isUser = "userInputMessage" in item
    const isAssistant = "assistantResponseMessage" in item

    if (isUser) {
      // 检查上一条是否也是 user
      if (fixed.length > 0 && "userInputMessage" in fixed[fixed.length - 1]) {
        // 插入一个占位 assistant 消息
        fixed.push({
          assistantResponseMessage: {
            content: "I understand.",
          },
        })
      }
      fixed.push(item)
    } else if (isAssistant) {
      // 检查上一条是否也是 assistant
      if (
        fixed.length > 0 &&
        "assistantResponseMessage" in fixed[fixed.length - 1]
      ) {
        // 插入一个占位 user 消息
        fixed.push({
          userInputMessage: {
            content: "Continue",
            modelId,
            origin: "AI_EDITOR",
          },
        })
      }

      // 如果历史为空，先插入一个 user 消息
      if (fixed.length === 0) {
        fixed.push({
          userInputMessage: {
            content: "Continue",
            modelId,
            origin: "AI_EDITOR",
          },
        })
      }

      fixed.push(item)
    }
  }

  // 确保以 assistant 结尾
  if (fixed.length > 0 && "userInputMessage" in fixed[fixed.length - 1]) {
    fixed.push({
      assistantResponseMessage: {
        content: "I understand.",
      },
    })
  }

  return fixed
}

/**
 * 转换工具定义
 */
function convertTools(
  tools?: ToolDefinition[]
): Array<Record<string, unknown>> | undefined {
  if (!tools || tools.length === 0) return undefined

  return tools.slice(0, 50).map((tool) => {
    // 使用 zod-to-json-schema 正确转换 Zod schema
    const jsonSchema = zodToJsonSchema(tool.parameters, {
      $refStrategy: "none",
    })
    // 移除 $schema 字段，Kiro API 不需要
    const { $schema, ...schema } = jsonSchema as Record<string, unknown>

    return {
      toolSpecification: {
        name: tool.name,
        description: tool.description.substring(0, 500),
        inputSchema: {
          json: schema,
        },
      },
    }
  })
}

/**
 * 构建 Kiro API 请求
 */
function buildKiroRequest(
  userContent: string,
  model: string,
  history: Array<Record<string, unknown>>,
  tools?: Array<Record<string, unknown>>,
  toolResults?: Array<Record<string, unknown>>
): Record<string, unknown> {
  const userInput: Record<string, unknown> = {
    content: userContent || "Continue",
    modelId: model,
    origin: "AI_EDITOR",
  }

  // 工具和结果放在 userInputMessageContext 里
  const context: Record<string, unknown> = {}
  if (tools && tools.length > 0) {
    context.tools = tools
  }
  if (toolResults && toolResults.length > 0) {
    context.toolResults = toolResults
  }
  if (Object.keys(context).length > 0) {
    userInput.userInputMessageContext = context
  }

  return {
    conversationState: {
      agentContinuationId: crypto.randomUUID(),
      agentTaskType: "vibe",
      chatTriggerType: "MANUAL",
      conversationId: crypto.randomUUID(),
      currentMessage: { userInputMessage: userInput },
      history,
    },
  }
}

// ==================== 响应解析 ====================

interface ParsedResponse {
  text: string
  inputTokens: number
  outputTokens: number
  toolUses: Array<{
    toolUseId: string
    name: string
    input: unknown
  }>
}

/**
 * 解析 Kiro SSE 响应
 */
function parseSSEResponse(content: Buffer, debug = false): ParsedResponse {
  const textParts: string[] = []
  const toolInputBuffer: Map<
    string,
    { toolUseId: string; name: string; inputParts: string[] }
  > = new Map()
  let inputTokens = 0
  let outputTokens = 0

  let pos = 0

  while (pos < content.length) {
    if (pos + 12 > content.length) break

    // 读取 prelude
    const totalLen = content.readUInt32BE(pos)
    const headersLen = content.readUInt32BE(pos + 4)

    if (totalLen === 0 || pos + totalLen > content.length) break

    // 解析 headers 以获取事件类型
    const headerStart = pos + 12
    const headerEnd = headerStart + headersLen
    const headersData = content.subarray(headerStart, headerEnd)
    let eventType: string | null = null

    try {
      const headersStr = headersData.toString("utf-8")
      if (headersStr.includes("toolUseEvent")) {
        eventType = "toolUseEvent"
      } else if (headersStr.includes("assistantResponseEvent")) {
        eventType = "assistantResponseEvent"
      }
    } catch {
      // 忽略
    }

    // 解析 payload
    const payloadStart = pos + 12 + headersLen
    const payloadEnd = pos + totalLen - 4 // 减去 message CRC

    if (payloadStart < payloadEnd) {
      try {
        const payloadStr = content.subarray(payloadStart, payloadEnd).toString("utf-8")
        const payload = JSON.parse(payloadStr)

        if (debug) {
          console.log(`[Kiro] Event: type=${eventType}, keys=${Object.keys(payload)}`)
        }

        // 提取文本
        if (payload.assistantResponseEvent?.content) {
          textParts.push(payload.assistantResponseEvent.content)
        } else if (payload.content && eventType !== "toolUseEvent") {
          textParts.push(payload.content)
        }

        // 处理工具调用事件
        if (eventType === "toolUseEvent" || payload.toolUseId) {
          const toolId = payload.toolUseId || ""
          const toolName = payload.name || ""
          const toolInput = payload.input || ""

          if (toolId) {
            if (!toolInputBuffer.has(toolId)) {
              toolInputBuffer.set(toolId, {
                toolUseId: toolId,
                name: toolName,
                inputParts: [],
              })
            }
            const buf = toolInputBuffer.get(toolId)!
            if (toolName && !buf.name) {
              buf.name = toolName
            }
            if (toolInput) {
              buf.inputParts.push(toolInput)
            }
          }
        }

        // 提取 token 计数
        if (payload.usageEvent) {
          inputTokens = payload.usageEvent.inputTokens || 0
          outputTokens = payload.usageEvent.outputTokens || 0
        }
        // 备用：直接从 payload 获取
        if (payload.inputTokens) {
          inputTokens = payload.inputTokens
        }
        if (payload.outputTokens) {
          outputTokens = payload.outputTokens
        }
        // 备用：从 usage 字段获取
        if (payload.usage) {
          inputTokens = payload.usage.inputTokens || inputTokens
          outputTokens = payload.usage.outputTokens || outputTokens
        }
      } catch {
        // 忽略解析错误
      }
    }

    pos += totalLen
  }

  // 组装工具调用
  const toolUses: Array<{ toolUseId: string; name: string; input: unknown }> = []
  for (const [, toolData] of toolInputBuffer) {
    const inputStr = toolData.inputParts.join("")
    let inputJson: unknown
    try {
      inputJson = JSON.parse(inputStr)
    } catch {
      inputJson = inputStr ? { raw: inputStr } : {}
    }

    toolUses.push({
      toolUseId: toolData.toolUseId,
      name: toolData.name,
      input: inputJson,
    })
  }

  return {
    text: textParts.join(""),
    inputTokens,
    outputTokens,
    toolUses,
  }
}

// ==================== Provider 实现 ====================

/**
 * 创建 Kiro Provider
 */
export function createKiroProvider(config?: KiroConfig): LLMProvider {
  const cacheDir = config?.tokenCacheDir || getDefaultTokenCacheDir()
  const debug = config?.debug || false

  return {
    type: "kiro",

    async *stream(params: ChatParams): AsyncGenerator<StreamEvent> {
      const token = loadToken(cacheDir)
      if (!token) {
        yield {
          type: "error",
          error: new Error(
            "No Kiro token available. Please login to Kiro IDE first."
          ),
        }
        return
      }

      // 检查是否需要刷新
      if (needsRefresh(token)) {
        await refreshToken(config?.proxy)
      }

      const model = mapToKiroModel(params.model.model)
      const { userContent, history, toolResults } = convertMessages(
        params.messages,
        params.system,
        model
      )
      const tools = convertTools(params.tools)
      const kiroReq = buildKiroRequest(
        userContent,
        model,
        history,
        tools,
        toolResults
      )
      const headers = buildHeaders(token.accessToken, token.machineId)

      try {
        const resp = await fetch(KIRO_API_URL, {
          method: "POST",
          headers,
          body: JSON.stringify(kiroReq),
        })

        if (!resp.ok) {
          const errText = await resp.text()
          console.error(`[Kiro] API error: ${resp.status} - ${errText.substring(0, 300)}`)
          yield {
            type: "error",
            error: new Error(`Kiro API error: ${resp.status}`),
          }
          return
        }

        // 读取完整响应（Kiro 不支持真正的流式）
        const buffer = Buffer.from(await resp.arrayBuffer())
        const parsed = parseSSEResponse(buffer, debug)

        // 输出文本
        if (parsed.text) {
          yield { type: "text", text: parsed.text }
        }

        // 输出工具调用
        for (const tu of parsed.toolUses) {
          yield {
            type: "tool_call",
            id: tu.toolUseId,
            name: tu.name,
            args: tu.input,
          }
        }

        // 输出使用统计
        yield {
          type: "message_end",
          usage: {
            inputTokens: parsed.inputTokens,
            outputTokens: parsed.outputTokens,
          },
        }
      } catch (err) {
        yield {
          type: "error",
          error: err instanceof Error ? err : new Error(String(err)),
        }
      }
    },

    async chat(params: ChatParams): Promise<ChatResult> {
      const token = loadToken(cacheDir)
      if (!token) {
        throw new Error(
          "No Kiro token available. Please login to Kiro IDE first."
        )
      }

      // 检查是否需要刷新
      if (needsRefresh(token)) {
        await refreshToken(config?.proxy)
      }

      const model = mapToKiroModel(params.model.model)
      const { userContent, history, toolResults } = convertMessages(
        params.messages,
        params.system,
        model
      )
      const tools = convertTools(params.tools)
      const kiroReq = buildKiroRequest(
        userContent,
        model,
        history,
        tools,
        toolResults
      )
      const headers = buildHeaders(token.accessToken, token.machineId)

      const resp = await fetch(KIRO_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(kiroReq),
      })

      if (!resp.ok) {
        const errText = await resp.text()
        console.error(`[Kiro] API error: ${resp.status} - ${errText.substring(0, 300)}`)
        throw new Error(`Kiro API error: ${resp.status}`)
      }

      const buffer = Buffer.from(await resp.arrayBuffer())
      const parsed = parseSSEResponse(buffer, debug)

      return {
        text: parsed.text,
        toolCalls: parsed.toolUses.map((tu) => ({
          id: tu.toolUseId,
          name: tu.name,
          args: tu.input,
        })),
        usage: {
          inputTokens: parsed.inputTokens,
          outputTokens: parsed.outputTokens,
        },
      }
    },
  }
}
