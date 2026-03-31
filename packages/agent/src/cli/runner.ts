/**
 * Agent Runner - 执行 Agent 并处理权限
 *
 * 封装 Agent Loop，添加：
 * - 权限检查（通过 permissionChecker 在 loop 层拦截）
 * - Session 管理
 * - 模型配置
 * - compact 管道
 */

import {
  createAgentLoop,
  getAgentDefinition,
  type AgentType,
  type AgentEvent,
} from "../agent"
import { createSession, type Session } from "../session"
import {
  createProvider,
  createProviderFromEnv,
  type LLMProvider,
} from "../provider"
import { ToolRegistry } from "../tool/registry"
import type { PermissionChecker } from "../tool/registry"
import { ReadTool } from "../tool/read"
import { WriteTool } from "../tool/write"
import { AppendTool } from "../tool/append"
import { EditTool } from "../tool/edit"
import { BashTool } from "../tool/bash"
import { GlobTool } from "../tool/glob"
import { GrepTool } from "../tool/grep"
import { TodoTool } from "../interaction/todo"
import { QuestionTool } from "../interaction/question"
import { LoadSkillTool } from "../tool/load-skill"
import { CompactTool } from "../tool/compact"
import { initKnowledgeSkills } from "../skill/knowledge"
import { initSkills } from "../skill"
import { existsSync } from "fs"
import { homedir } from "os"
import * as path from "path"
import { registerSubagentTools } from "../tool/subagent"
import type { SubTaskProvider, RunAgentRuntime } from "../subtask"
import { getSubAgentConfigManager, getAgentRegistry } from "../subtask"
import {
  createDefaultPermissions,
  checkPermission,
  type PermissionSet,
  type PermissionRequest,
  type ConfirmCallback,
  type PermissionType,
} from "../permission"
import { microCompact, autoCompact, estimateTokens } from "../agent/compact"
import { DEFAULT_MAX_TOKENS, DEFAULT_THINKING_BUDGET, AUTO_COMPACT_TOKEN_THRESHOLD } from "../config"
import { createLogger } from "../logging"

const log = createLogger("runner")

// ─── 类型 ────────────────────────────────────────────

export interface RunnerConfig {
  agentType?: AgentType
  cwd?: string
  model?: string
  apiKey?: string
  baseURL?: string
  permissions?: Partial<PermissionSet>
  onConfirm?: ConfirmCallback
  autoConfirm?: boolean
  autoConfirmRef?: { value: boolean }
  existingSession?: Session | null
  thinking?: { enabled: boolean; budgetTokens?: number }
  backgroundNotifications?: Array<{ taskId: string; command: string; output: string; error?: string }>
}

export interface RunOptions {
  abort?: AbortSignal
}

export interface RunnerEventHandlers {
  /** 文本（累积全文，向后兼容） */
  onText?: (content: string) => void
  /** 文本增量（推荐使用，替代 onText） */
  onTextDelta?: (delta: string) => void
  onThinking?: (content: string) => void
  onThinkingEnd?: () => void
  onToolStart?: (id: string, name: string, input: unknown) => void
  onToolEnd?: (id: string, output: string, isError?: boolean) => void
  onError?: (error: Error) => void
  onDone?: (usage: { inputTokens: number; outputTokens: number }) => void
  onPermissionRequest?: (request: PermissionRequest) => void
}

// ─── 模型配置 ─────────────────────────────────────────

function applyModelConfig(
  definition: ReturnType<typeof getAgentDefinition>,
  model?: string,
  thinking?: { enabled: boolean; budgetTokens?: number },
): void {
  if (model) {
    definition.model = {
      provider: "auto",
      model,
      temperature: definition.model?.temperature || 0,
      maxTokens: definition.model?.maxTokens || DEFAULT_MAX_TOKENS,
      thinking: definition.model?.thinking,
    }
  }
  if (thinking?.enabled) {
    definition.model = {
      ...definition.model,
      provider: definition.model?.provider || "auto",
      model: definition.model?.model || model || "claude-sonnet-4",
      thinking: { enabled: true, budgetTokens: thinking.budgetTokens || DEFAULT_THINKING_BUDGET },
    }
  }
}

// ─── 权限 ─────────────────────────────────────────────

const TOOL_PERMISSION_MAP: Record<string, PermissionType> = {
  read: "read", write: "write", edit: "edit",
  bash: "bash", glob: "glob", grep: "grep",
}

function getResourceFromInput(toolName: string, input: unknown): string {
  const obj = input as Record<string, unknown>
  switch (toolName) {
    case "read": case "write": case "edit":
      return String(obj.filePath || obj.file_path || "")
    case "bash": return String(obj.command || "")
    case "glob": case "grep": return String(obj.pattern || "")
    default: return JSON.stringify(input)
  }
}

function buildPermissionChecker(
  permissions: PermissionSet,
  confirmCallback: ConfirmCallback,
  handlers: RunnerEventHandlers,
): PermissionChecker {
  return async (toolName: string, input: unknown): Promise<boolean> => {
    const permType = TOOL_PERMISSION_MAP[toolName]
    if (!permType) return true // 未映射的工具默认允许

    const request: PermissionRequest = {
      type: permType,
      resource: getResourceFromInput(toolName, input),
      description: `Execute ${toolName}`,
    }

    const result = checkPermission(request, permissions)
    if (result.action === "allow") return true
    if (result.action === "deny") return false

    // 仅需要用户确认时才发送通知（避免 allow/deny 时也弹窗）
    handlers.onPermissionRequest?.(request)
    return confirmCallback(request)
  }
}

// ─── 事件分发 ─────────────────────────────────────────

function dispatchEvent(event: AgentEvent, handlers: RunnerEventHandlers): void {
  switch (event.type) {
    case "text":
      handlers.onText?.(event.content)
      break
    case "text_delta":
      handlers.onTextDelta?.(event.delta)
      break
    case "thinking":
      handlers.onThinking?.(event.content)
      break
    case "thinking_end":
      handlers.onThinkingEnd?.()
      break
    case "tool_start":
      handlers.onToolStart?.(event.id, event.name, event.input)
      break
    case "tool_end":
      handlers.onToolEnd?.(event.id, event.result.output, event.isError)
      break
    case "error":
      handlers.onError?.(event.error)
      break
    case "done":
      handlers.onDone?.(event.usage)
      break
  }
}

// ─── createRunner ────────────────────────────────────

export function createRunner(config: RunnerConfig) {
  const {
    agentType = "build",
    cwd = process.cwd(),
    model, apiKey, baseURL,
    permissions: customPermissions,
    onConfirm,
    autoConfirm = false,
    autoConfirmRef,
    existingSession,
  } = config

  // 工具注册（创建独立实例）
  const toolRegistry = new ToolRegistry()
  registerBuiltinTools(toolRegistry)

  // Skill 系统初始化（s05: 两层注入）
  initSkills() // 注册 Workflow Skill (commit/pr/review/test)
  initKnowledgeSkillDirs(cwd) // 初始化 Knowledge Skill（全局 + 项目级）

  // 子 Agent 初始化
  const subAgentSystemReady = initializeSubAgentSystem(cwd)

  // Provider
  const provider: LLMProvider = apiKey
    ? createProvider({ type: "anthropic", config: { apiKey, baseURL } })
    : createProviderFromEnv()

  // 子代理适配
  const subAgentModel = (model && model !== "auto") ? model : "claude-sonnet-4"
  const subTaskProvider: SubTaskProvider = {
    async chat(options) {
      if (options.abort?.aborted) throw new Error("Task was aborted")
      const messages = options.messages
        .filter(m => m.role !== "system")
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }))
      const systemMessage = options.messages.find(m => m.role === "system")
      const effectiveModel = (options.model && options.model !== "auto") ? options.model : subAgentModel
      log.info("subTaskProvider.chat", { model: effectiveModel, messageCount: messages.length })
      const response = await provider.chat({
        model: { provider: "auto", model: effectiveModel },
        messages, system: systemMessage?.content, abortSignal: options.abort,
      })
      return { content: response.text, usage: response.usage }
    },
    async chatWithSchema(options) {
      const result = await this.chat({
        messages: [...options.messages, { role: "user", content: "Please respond with valid JSON only." }],
        model: options.model, temperature: options.temperature, maxTokens: options.maxTokens, abort: options.abort,
      })
      try {
        return { data: options.schema.parse(JSON.parse(result.content)), usage: result.usage }
      } catch { throw new Error(`Failed to parse JSON response: ${result.content}`) }
    },
  }

  const agentRuntime: RunAgentRuntime = { apiKey, baseURL, model: subAgentModel, toolRegistry }
  registerSubagentTools({
    provider: subTaskProvider,
    agentRuntime,
    registry: toolRegistry,
  })

  // Agent 定义 + 模型配置
  const definition = getAgentDefinition(agentType)
  applyModelConfig(definition, model, config.thinking)

  // 权限
  const basePermissions = createDefaultPermissions(agentType)
  const permissions: PermissionSet = customPermissions
    ? { rules: [...(customPermissions.rules || []), ...basePermissions.rules], default: customPermissions.default || basePermissions.default }
    : basePermissions

  const confirmCallback: ConfirmCallback = async (request) => {
    if (autoConfirmRef ? autoConfirmRef.value : autoConfirm) return true
    const result = checkPermission(request, permissions)
    if (result.action === "allow") return true
    if (result.action === "deny") return false
    return onConfirm ? onConfirm(request) : false
  }

  let session: Session | null = existingSession || null

  return {
    async run(input: string, handlers: RunnerEventHandlers = {}, options: RunOptions = {}): Promise<void> {
      await subAgentSystemReady
      if (!session) session = createSession({ cwd, agentType })

      // 构建权限检查器（在 loop 层拦截，不是事后通知）
      const permissionChecker = buildPermissionChecker(permissions, confirmCallback, handlers)

      // compact 摘要器（供 autoCompact 和 compact 工具共用）
      const summarizer = async (text: string): Promise<string> => {
        const resp = await provider.chat({
          model: definition.model || { provider: "auto", model: "claude-sonnet-4" },
          messages: [{ role: "user", content: "Summarize this conversation concisely. Include:\n1) What was accomplished so far\n2) Current state and next steps\n3) Key decisions made\n4) ALL files that were read (list file paths) - these must NOT be re-read\n5) ALL files that were created or modified\n\n" + text }],
          system: "You are a conversation summarizer. Output a concise summary. IMPORTANT: List every file path that was read, so the agent knows not to re-read them.",
        })
        return resp.text
      }

      // compact 管道通过 onBeforeStep 注入
      const onBeforeStep = async (ctx: { session: Session; stepCount: number; provider: LLMProvider }) => {
        microCompact(ctx.session)
        if (estimateTokens(ctx.session) > AUTO_COMPACT_TOKEN_THRESHOLD) {
          await autoCompact(ctx.session, summarizer)
        }
      }

      const loop = createAgentLoop({
        definition, session, provider,
        runConfig: { sessionId: session.id, cwd, abort: options.abort },
        toolRegistry,
        permissionChecker,
        onBeforeStep,
        toolMeta: { session, summarizer },
        backgroundNotifications: config.backgroundNotifications,
      })

      try {
        for await (const event of loop.run(input)) {
          if (options.abort?.aborted) break
          dispatchEvent(event, handlers)
        }
      } catch (error) {
        if (options.abort?.aborted) return
        throw error
      }
    },

    getSession(): Session | null { return session },
    resetSession(): void { session = null },
    getPermissions(): PermissionSet { return permissions },

    setModel(newModel: string): void {
      applyModelConfig(definition, newModel)
    },

    setThinking(thinking: { enabled: boolean; budgetTokens?: number }): void {
      if (thinking.enabled) {
        applyModelConfig(definition, undefined, thinking)
      } else if (definition.model?.thinking) {
        delete definition.model.thinking
      }
    },
  }
}

// ─── 内部函数 ─────────────────────────────────────────

function registerBuiltinTools(registry: ToolRegistry): void {
  // 文件操作工具
  registry.register(ReadTool)
  registry.register(WriteTool)
  registry.register(AppendTool)
  registry.register(EditTool)
  registry.register(BashTool)
  registry.register(GlobTool)
  registry.register(GrepTool)
  // 交互工具（s03: Todo Write / Question）
  registry.register(TodoTool)
  registry.register(QuestionTool)
  // Knowledge Skill 加载器（s05: Layer 2 按需加载）
  registry.register(LoadSkillTool)
  // 上下文压缩工具（s06: Layer 3 LLM 主动触发）
  registry.register(CompactTool)
}

/**
 * 初始化 Knowledge Skill 目录（全局 + 项目级）
 * 扫描 ~/.naughtyagent/skills/ 和 {cwd}/.naughty/skills/
 */
function initKnowledgeSkillDirs(cwd: string): void {
  const projectDir = path.join(cwd, ".naughty", "skills")
  const globalDir = path.join(homedir(), ".naughtyagent", "skills")

  if (existsSync(projectDir)) {
    initKnowledgeSkills(projectDir)
  } else if (existsSync(globalDir)) {
    initKnowledgeSkills(globalDir)
  }
}

async function initializeSubAgentSystem(cwd: string): Promise<void> {
  let customAgentsDir: string | undefined
  try {
    const configManager = getSubAgentConfigManager()
    const config = await configManager.load(cwd)
    customAgentsDir = config.customAgentsDir
  } catch (error) {
    console.warn(`[SubAgentSystem] 配置加载失败: ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    const registry = getAgentRegistry({ cwd })
    await registry.loadCustomAgents(customAgentsDir ?? ".naughty/agents")
  } catch (error) {
    console.warn(`[SubAgentSystem] Agent 注册表加载失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export type Runner = ReturnType<typeof createRunner>
