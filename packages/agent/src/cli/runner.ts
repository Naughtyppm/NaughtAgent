/**
 * Agent Runner - 执行 Agent 并处理权限
 *
 * 封装 Agent Loop，添加：
 * - 权限检查
 * - 用户确认
 * - 输出格式化
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
import { ReadTool } from "../tool/read"
import { WriteTool } from "../tool/write"
import { AppendTool } from "../tool/append"
import { EditTool } from "../tool/edit"
import { BashTool } from "../tool/bash"
import { GlobTool } from "../tool/glob"
import { GrepTool } from "../tool/grep"
import { registerSubagentTools } from "../tool/subagent"
import type { SubTaskProvider, RunAgentRuntime } from "../subtask"
import { getSubAgentConfigManager, getAgentRegistry } from "../subtask"
import {
  createDefaultPermissions,
  enforcePermission,
  checkPermission,
  type PermissionSet,
  type PermissionRequest,
  type ConfirmCallback,
  type PermissionType,
} from "../permission"

/**
 * Runner 配置
 */
export interface RunnerConfig {
  /** Agent 类型 */
  agentType?: AgentType
  /** 工作目录 */
  cwd?: string
  /** 模型名称 */
  model?: string
  /** API Key（可选，如果不提供则尝试使用 Kiro） */
  apiKey?: string
  /** API Base URL */
  baseURL?: string
  /** 权限配置 */
  permissions?: Partial<PermissionSet>
  /** 确认回调 */
  onConfirm?: ConfirmCallback
  /** 自动确认所有操作（静态值） */
  autoConfirm?: boolean
  /** 自动确认状态（动态引用，优先级高于 autoConfirm） */
  autoConfirmRef?: { value: boolean }
  /** 已有的会话（用于保持对话历史） */
  existingSession?: Session | null
}

/**
 * 运行选项
 */
export interface RunOptions {
  /** 取消信号 */
  abort?: AbortSignal
}

/**
 * Runner 事件处理器
 */
export interface RunnerEventHandlers {
  onText?: (content: string) => void
  onToolStart?: (id: string, name: string, input: unknown) => void
  onToolEnd?: (id: string, output: string, isError?: boolean) => void
  onError?: (error: Error) => void
  onDone?: (usage: { inputTokens: number; outputTokens: number }) => void
  onPermissionRequest?: (request: PermissionRequest) => void
}

/**
 * 创建 Agent Runner
 */
export function createRunner(config: RunnerConfig) {
  const {
    agentType = "build",
    cwd = process.cwd(),
    model,
    apiKey,
    baseURL,
    permissions: customPermissions,
    onConfirm,
    autoConfirm = false,
    autoConfirmRef,
    existingSession,
  } = config

  // 注册内置工具
  registerBuiltinTools()

  // 初始化子 Agent 系统（配置管理 + Agent 注册表）
  // 异步初始化，在首次 run() 时确保完成
  const subAgentSystemReady = initializeSubAgentSystem(cwd)

  // 创建 Provider（自动选择 Anthropic 或 Kiro）
  let provider: LLMProvider
  if (apiKey) {
    provider = createProvider({
      type: "anthropic",
      config: { apiKey, baseURL },
    })
  } else {
    // 自动选择：优先 API Key，否则 Kiro
    provider = createProviderFromEnv()
  }

  // 确定子代理使用的模型（不能是 "auto"）
  // CLI 默认模型是 opus，所以 fallback 也用 opus
  const subAgentModel = (model && model !== "auto") ? model : "claude-opus-4-20250514"

  // 创建子代理 Provider 适配器（用于 ask_llm 和 multi_agent）
  const subTaskProvider: SubTaskProvider = {
    async chat(options) {
      // 检查取消信号
      if (options.abort?.aborted) {
        throw new Error("Task was aborted")
      }
      
      const messages = options.messages
        .filter(m => m.role !== "system")
        .map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      
      const systemMessage = options.messages.find(m => m.role === "system")
      
      // 使用固定模型，不允许 "auto"
      const effectiveModel = (options.model && options.model !== "auto") 
        ? options.model 
        : subAgentModel
      
      // 使用 provider.chat 进行单次调用，传递 abort 信号
      const response = await provider.chat({
        model: { provider: "auto", model: effectiveModel },
        messages,
        system: systemMessage?.content,
        abortSignal: options.abort,
      })
      
      // 提取文本内容
      const content = response.text
      
      return {
        content,
        usage: response.usage,
      }
    },
    
    async chatWithSchema(options) {
      // 简化实现：先调用 chat，然后解析 JSON
      const result = await this.chat({
        messages: [
          ...options.messages,
          { role: "user", content: "Please respond with valid JSON only." }
        ],
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        abort: options.abort,
      })
      
      try {
        const data = JSON.parse(result.content)
        return {
          data: options.schema.parse(data),
          usage: result.usage,
        }
      } catch {
        throw new Error(`Failed to parse JSON response: ${result.content}`)
      }
    },
  }

  // 创建子代理运行时（用于 run_agent, fork_agent, parallel_agents）
  const agentRuntime: RunAgentRuntime = {
    apiKey,
    baseURL,
    model: subAgentModel,  // 使用固定模型，不允许 "auto"
  }

  // 注册子代理工具
  registerSubagentTools({
    provider: subTaskProvider,
    agentRuntime,
  })

  // 获取 Agent 定义
  const definition = getAgentDefinition(agentType)
  
  // 如果指定了模型，覆盖默认模型
  if (model) {
    definition.model = {
      provider: "auto",
      model,
      temperature: definition.model?.temperature || 0,
      maxTokens: definition.model?.maxTokens || 8192,
    }
  }

  // 创建权限集合
  const basePermissions = createDefaultPermissions(agentType)
  const permissions: PermissionSet = customPermissions
    ? {
        rules: [...(customPermissions.rules || []), ...basePermissions.rules],
        default: customPermissions.default || basePermissions.default,
      }
    : basePermissions

  // 确认回调（autoConfirmRef 优先级高于 autoConfirm）
  const confirmCallback: ConfirmCallback = async (request) => {
    const isAutoConfirm = autoConfirmRef ? autoConfirmRef.value : autoConfirm
    
    // 如果是自动模式，直接允许
    if (isAutoConfirm) {
      return true
    }
    
    // 如果是手动模式，先检查权限规则
    const result = checkPermission(request, permissions)
    
    // 如果规则明确允许，直接返回 true
    if (result.action === "allow") {
      return true
    }
    
    // 如果规则明确拒绝，直接返回 false
    if (result.action === "deny") {
      return false
    }
    
    // 如果规则要求确认（ask），调用用户确认回调
    if (onConfirm) {
      return onConfirm(request)
    }
    
    // 默认拒绝
    return false
  }

  // 当前会话（优先使用已有会话）
  let session: Session | null = existingSession || null

  return {
    /**
     * 运行 Agent
     */
    async run(
      input: string,
      handlers: RunnerEventHandlers = {},
      options: RunOptions = {}
    ): Promise<void> {
      // 确保子 Agent 系统初始化完成（配置 + 注册表）
      await subAgentSystemReady

      // 创建或复用会话
      if (!session) {
        session = createSession({ cwd, agentType })
      }

      // 创建 Agent Loop
      const loop = createAgentLoop({
        definition,
        session,
        provider,
        runConfig: {
          sessionId: session.id,
          cwd,
          abort: options.abort,
        },
      })

      // 处理事件
      try {
        for await (const event of loop.run(input)) {
          // 检查是否已取消
          if (options.abort?.aborted) {
            break
          }
          await handleEvent(event, handlers, permissions, confirmCallback)
        }
      } catch (error) {
        // 如果是取消错误，忽略
        if (options.abort?.aborted) {
          return
        }
        throw error
      }
    },

    /**
     * 获取当前会话
     */
    getSession(): Session | null {
      return session
    },

    /**
     * 重置会话
     */
    resetSession(): void {
      session = null
    },

    /**
     * 获取权限配置
     */
    getPermissions(): PermissionSet {
      return permissions
    },
  }
}

/**
 * 处理 Agent 事件
 */
async function handleEvent(
  event: AgentEvent,
  handlers: RunnerEventHandlers,
  permissions: PermissionSet,
  onConfirm: ConfirmCallback
): Promise<void> {
  switch (event.type) {
    case "text":
      handlers.onText?.(event.content)
      break

    case "tool_start":
      // 检查权限
      const permissionType = getPermissionType(event.name)
      if (permissionType) {
        const request: PermissionRequest = {
          type: permissionType,
          resource: getResourceFromInput(event.name, event.input),
          description: `Execute ${event.name}`,
        }

        handlers.onPermissionRequest?.(request)

        const allowed = await enforcePermission(request, permissions, onConfirm)
        if (!allowed) {
          // 权限被拒绝，这里只是记录，实际拒绝需要在 loop 层处理
          // 目前简化处理，继续执行
        }
      }

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

/**
 * 获取工具对应的权限类型
 */
function getPermissionType(toolName: string): PermissionType | null {
  const mapping: Record<string, PermissionType> = {
    read: "read",
    write: "write",
    edit: "edit",
    bash: "bash",
    glob: "glob",
    grep: "grep",
  }
  return mapping[toolName] || null
}

/**
 * 从工具输入中提取资源标识
 */
function getResourceFromInput(toolName: string, input: unknown): string {
  const inputObj = input as Record<string, unknown>

  switch (toolName) {
    case "read":
    case "write":
    case "edit":
      return String(inputObj.filePath || inputObj.file_path || "")
    case "bash":
      return String(inputObj.command || "")
    case "glob":
      return String(inputObj.pattern || "")
    case "grep":
      return String(inputObj.pattern || "")
    default:
      return JSON.stringify(input)
  }
}

/**
 * 注册内置工具
 */
function registerBuiltinTools(): void {
  // 清空并重新注册，避免重复
  ToolRegistry.clear()
  ToolRegistry.register(ReadTool)
  ToolRegistry.register(WriteTool)
  ToolRegistry.register(AppendTool)
  ToolRegistry.register(EditTool)
  ToolRegistry.register(BashTool)
  ToolRegistry.register(GlobTool)
  ToolRegistry.register(GrepTool)
}

/**
 * 初始化子 Agent 系统
 *
 * 在 Agent 启动时加载配置和自定义 Agent 定义。
 * 错误会被捕获并记录警告，不会导致 Agent 崩溃。
 *
 * 初始化顺序：
 * 1. 加载配置（.naughty/config.json + 环境变量）
 * 2. 初始化 Agent 注册表（扫描 .naughty/agents/ 目录）
 *
 * **Validates: Requirements 2.1, 8.1**
 *
 * @param cwd - 工作目录
 */
async function initializeSubAgentSystem(cwd: string): Promise<void> {
  // 1. 加载子 Agent 配置
  let customAgentsDir: string | undefined
  try {
    const configManager = getSubAgentConfigManager()
    const config = await configManager.load(cwd)
    customAgentsDir = config.customAgentsDir
  } catch (error) {
    // 配置加载失败，记录警告但不崩溃，使用默认配置
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[SubAgentSystem] 配置加载失败，使用默认配置: ${message}`)
  }

  // 2. 初始化 Agent 注册表，扫描自定义 Agent 目录
  try {
    const registry = getAgentRegistry({ cwd })
    const agentsDir = customAgentsDir ?? ".naughty/agents"
    await registry.loadCustomAgents(agentsDir)
  } catch (error) {
    // 注册表加载失败，记录警告但不崩溃
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[SubAgentSystem] Agent 注册表加载失败: ${message}`)
  }
}

export type Runner = ReturnType<typeof createRunner>
