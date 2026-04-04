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
import { setInteractionCallbacks } from "../interaction/callbacks"
import { LoadSkillTool } from "../tool/load-skill"
import { CompactTool } from "../tool/compact"
import { MemoryTool } from "../tool/memory"
import { NotebookEditTool } from "../tool/notebook-edit"
import { WebFetchTool } from "../tool/web-fetch"
import { TaskOutputTool, TaskStopTool } from "../tool/background-task"
import { EnterPlanModeTool, ExitPlanModeTool, isPlanMode } from "../tool/plan-mode"
import { ListMcpResourcesTool, ReadMcpResourceTool } from "../tool/mcp-resource"
import { CronCreateTool, CronDeleteTool, CronListTool } from "../tool/cron"
import { initKnowledgeSkills, getKnowledgeSkillLoader } from "../skill/knowledge"
import { initSkills } from "../skill"
import { clearReadCache } from "../tool/read"
import { clearFileAccessBudget } from "../tool/file-access-budget"
import { existsSync } from "fs"
import { homedir } from "os"
import * as path from "path"
import { registerSubagentTools } from "../tool/subagent"
import { initMcpManager, type McpManager } from "../mcp/manager"
import type { SubTaskProvider, RunAgentRuntime } from "../subtask"
import { getSubAgentConfigManager, getAgentRegistry } from "../subtask"
import {
  createDefaultPermissions,
  type PermissionSet,
  type ConfirmCallback,
} from "../permission"
import { microCompact, autoCompact, estimateTokens, COMPACT_SYSTEM_PROMPT, COMPACT_USER_PROMPT_PREFIX, MEMORY_EXTRACT_PROMPT, clearAutoCompactFailures } from "../agent/compact"
import { DEFAULT_MAX_TOKENS, DEFAULT_THINKING_BUDGET, AUTO_COMPACT_TOKEN_THRESHOLD } from "../config"
import { createLogger, Logger } from "../logging"

const log = createLogger("runner")

// ─── 类型 ────────────────────────────────────────────

export interface RunnerConfig {
  agentType?: AgentType
  cwd?: string
  model?: string
  apiKey?: string
  baseURL?: string
  permissions?: Partial<PermissionSet>

  existingSession?: Session | null
  thinking?: { enabled: boolean; budgetTokens?: number }
  backgroundNotifications?: Array<{ taskId: string; command: string; output: string; error?: string }>
  maxConsecutiveErrors?: number
  /** 持久模式：LLM 回复完后等待用户输入，而非退出 loop */
  waitForInput?: () => Promise<string | null>
  /** Question 工具回调：前端弹窗获取用户回答 */
  onQuestion?: (question: { type: string; message: string; options?: Array<{ value: string; label: string; description?: string }>; default?: unknown }) => Promise<{ answered: boolean; value: string | boolean | string[] | null; cancelled: boolean }>
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
  onDone?: (usage: { inputTokens: number; outputTokens: number; cacheCreationTokens?: number; cacheReadTokens?: number }) => void
  onPermissionRequest?: (request: { type: string; resource: string; description?: string }) => void
  /** 持久模式：Agent 完成当前回合，等待用户输入 */
  onAwaitInput?: () => void
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

function buildPermissionChecker(
  _permissions: PermissionSet,
  _confirmCallback: ConfirmCallback,
  _handlers: RunnerEventHandlers,
): PermissionChecker {
  // 所有工具操作自动批准，不需要权限确认
  return async (_toolName: string, _input: unknown): Promise<boolean> => {
    return true
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
    case "await_input":
      handlers.onAwaitInput?.()
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
    existingSession,
  } = config

  // 工具注册（创建独立实例）
  const toolRegistry = new ToolRegistry()
  registerBuiltinTools(toolRegistry)

  // 启用文件日志（写入项目下 .naughty/logs/）
  const logDir = path.join(cwd, '.naughty', 'logs')
  Logger.enableFileLog(logDir)
  log.debug('Session started', { cwd, agentType, logFile: Logger.getFileLogPath() })

  // Skill 系统初始化（s05: 两层注入）
  initSkills() // 注册 Workflow Skill (commit/pr/review/test)
  initKnowledgeSkillDirs(cwd) // 初始化 Knowledge Skill（全局 + 项目级）

  // 子 Agent 初始化
  const subAgentSystemReady = initializeSubAgentSystem(cwd)

  // MCP 初始化（异步，不阻塞启动）
  let mcpManager: McpManager | null = null
  const mcpReady = initializeMcpSystem(cwd).then((manager) => {
    mcpManager = manager
  }).catch((error) => {
    log.warn("MCP 初始化失败（跳过）:", { error: error instanceof Error ? error.message : String(error) })
  })

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

  const confirmCallback: ConfirmCallback = async (_request) => {
    return true // 所有操作自动批准
  }

  let session: Session | null = existingSession || null

  return {
    async run(input: string, handlers: RunnerEventHandlers = {}, options: RunOptions = {}): Promise<void> {
      await subAgentSystemReady
      await mcpReady
      if (!session) session = createSession({ cwd, agentType })

      // 构建权限检查器（在 loop 层拦截，不是事后通知）
      const permissionChecker = buildPermissionChecker(permissions, confirmCallback, handlers)

      // compact 摘要器（供 autoCompact 和 compact 工具共用）
      // 使用 CC 9 段结构 + <analysis>/<summary> 模式
      const summarizer = async (text: string): Promise<string> => {
        const resp = await provider.chat({
          model: definition.model || { provider: "auto", model: "claude-sonnet-4" },
          messages: [{ role: "user", content: COMPACT_USER_PROMPT_PREFIX + text }],
          system: COMPACT_SYSTEM_PROMPT,
        })
        return resp.text
      }

      // toolMeta 对象（PlanMode 工具会修改 meta.planMode）
      const toolMeta: Record<string, unknown> = { session, summarizer, mcpManager }

      // 计划模式写入拦截（包装 permissionChecker）
      const PLAN_MODE_BLOCKED_TOOLS = new Set(["write", "edit", "append", "bash", "notebook_edit"])
      const wrappedPermissionChecker: PermissionChecker = async (toolName, input) => {
        if (isPlanMode(toolMeta) && PLAN_MODE_BLOCKED_TOOLS.has(toolName)) {
          return false // 计划模式下拒绝写入工具
        }
        return permissionChecker(toolName, input)
      }

      // 独立记忆提取器（使用专用 system prompt，不复用 summarizer 的 COMPACT_SYSTEM_PROMPT）
      const memoryExtractor = async (text: string): Promise<string> => {
        const resp = await provider.chat({
          model: definition.model || { provider: "auto", model: "claude-sonnet-4" },
          messages: [{ role: "user", content: MEMORY_EXTRACT_PROMPT + text }],
        })
        return resp.text
      }

      // compact 管道通过 onBeforeStep 注入
      const compactOptions = { memoryExtractor, cwd }
      let lastLoopDetectedStep = 0  // 上次循环检测 compact 的 step（间隔至少 20 步可再触发）
      const onBeforeStep = async (ctx: { session: Session; stepCount: number; provider: LLMProvider }) => {
        microCompact(ctx.session)
        if (estimateTokens(ctx.session) > AUTO_COMPACT_TOKEN_THRESHOLD) {
          await autoCompact(ctx.session, summarizer, compactOptions)
        }
        // 循环模式检测：最近 N 条消息中 read 类 tool_use 占比过高时触发 compact
        // 这能在 token 阈值之前介入，打破"读取-遗忘-再读取"循环
        // 可多次触发（每次间隔至少 20 步），不再限制只触发一次
        if (ctx.stepCount > 20 && (ctx.stepCount - lastLoopDetectedStep) >= 20) {
          const recentMsgs = ctx.session.messages.slice(-20)
          let readToolCount = 0
          let totalToolCount = 0
          for (const msg of recentMsgs) {
            for (const block of msg.content) {
              if (block.type === 'tool_use') {
                totalToolCount++
                if (block.name === 'read' || block.name === 'glob' || block.name === 'grep') {
                  readToolCount++
                }
              }
            }
          }
          // 如果最近 20 条消息中 80%+ 的工具调用都是 read/glob/grep，判定为循环
          if (totalToolCount >= 8 && readToolCount / totalToolCount > 0.8) {
            lastLoopDetectedStep = ctx.stepCount
            await autoCompact(ctx.session, summarizer, compactOptions)
          }
        }
      }

      // 注册 Question 工具回调（如果提供了 onQuestion）
      if (config.onQuestion) {
        setInteractionCallbacks({
          onQuestion: async (question) => {
            return config.onQuestion!(question)
          },
        })
      }

      const loop = createAgentLoop({
        definition, session, provider,
        runConfig: { sessionId: session.id, cwd, abort: options.abort },
        toolRegistry,
        permissionChecker: wrappedPermissionChecker,
        maxConsecutiveErrors: config.maxConsecutiveErrors,
        waitForInput: config.waitForInput,
        onBeforeStep,
        onReactiveCompact: async (s: Session) => {
          return await autoCompact(s, summarizer, compactOptions)
        },
        toolMeta,
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
    resetSession(): void {
      // 清理 session 关联的全局缓存，防止跨 session 泄漏
      const sessionId = session?.id
      clearReadCache(sessionId)
      clearFileAccessBudget()
      clearAutoCompactFailures(sessionId)
      session = null
    },
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
  // 持久记忆工具（跨会话记忆）
  registry.register(MemoryTool)
  // Jupyter Notebook 编辑工具
  registry.register(NotebookEditTool)
  // 网页抓取工具
  registry.register(WebFetchTool)
  // 后台任务管理工具
  registry.register(TaskOutputTool)
  registry.register(TaskStopTool)
  // 计划模式工具
  registry.register(EnterPlanModeTool)
  registry.register(ExitPlanModeTool)
  // MCP 资源工具
  registry.register(ListMcpResourcesTool)
  registry.register(ReadMcpResourceTool)
  // Cron 定时任务工具
  registry.register(CronCreateTool)
  registry.register(CronDeleteTool)
  registry.register(CronListTool)
}

/**
 * 初始化 Knowledge Skill 目录（项目级 + 全局级同时加载）
 * 项目级优先：同名 skill 以项目级为准
 */
function initKnowledgeSkillDirs(cwd: string): void {
  const projectDir = path.join(cwd, ".naughty", "skills")
  const globalDir = path.join(homedir(), ".naughtyagent", "skills")

  // 项目级先加载（优先级高）
  if (existsSync(projectDir)) {
    initKnowledgeSkills(projectDir)
  }
  // 全局级追加加载（不覆盖同名 skill）
  if (existsSync(globalDir)) {
    const loader = getKnowledgeSkillLoader()
    if (loader) {
      loader.addDirectory(globalDir)
    } else {
      initKnowledgeSkills(globalDir)
    }
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

/**
 * 初始化 MCP 系统
 *
 * 加载 .naughty/mcp.json 配置，连接 MCP 服务器，
 * 发现并注册 MCP 工具到 ToolRegistry。
 * 配置文件不存在时静默跳过。
 */
async function initializeMcpSystem(cwd: string): Promise<McpManager | null> {
  const configPath = path.join(cwd, ".naughty", "mcp.json")

  // 配置文件不存在时静默跳过
  if (!existsSync(configPath)) {
    log.debug("MCP 配置文件不存在，跳过 MCP 初始化", { configPath })
    return null
  }

  try {
    const manager = await initMcpManager(cwd)

    // 检查是否有成功连接的服务器
    const status = manager.getStatus()
    const connectedCount = status.filter((s) => s.state === "connected").length

    if (connectedCount === 0) {
      log.warn("所有 MCP 服务器连接失败", { status })
      return manager
    }

    log.info("MCP 系统初始化完成", {
      servers: status.length,
      connected: connectedCount,
      tools: status.reduce((sum, s) => sum + s.toolCount, 0),
    })

    return manager
  } catch (error) {
    log.warn("MCP 系统初始化异常", { error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

export type Runner = ReturnType<typeof createRunner>
