/**
 * Agent Registry - 自定义 Agent 注册表
 *
 * 支持通过 Markdown 文件定义专用子 Agent，使用 YAML frontmatter 配置。
 *
 * 文件格式示例：
 * ```markdown
 * ---
 * name: security-reviewer
 * description: 代码安全审查专家
 * tools:
 *   - read
 *   - glob
 *   - grep
 * model: claude-sonnet
 * permissionMode: plan
 * ---
 *
 * ## 系统提示
 *
 * 你是一位资深的安全审计专家...
 * ```
 *
 * @module subtask/agent-registry
 */

import matter from "gray-matter"
import fg from "fast-glob"
import * as fs from "node:fs"
import * as path from "node:path"

// ============================================================================
// Types
// ============================================================================

/**
 * 权限模式
 * - ask: 每次操作询问用户
 * - allow: 自动执行，不询问
 * - plan: 规划模式，只读 + 规划
 */
export type PermissionMode = "ask" | "allow" | "plan"

/**
 * 自定义 Agent 定义
 *
 * 从 Markdown 文件解析得到的 Agent 配置
 */
export interface CustomAgentDefinition {
  /** Agent 名称（唯一标识） */
  name: string

  /** 描述 */
  description: string

  /** 可用工具列表 */
  tools: string[]

  /** 模型配置（可选） */
  model?: string

  /** 权限模式（可选） */
  permissionMode?: PermissionMode

  /** 系统提示词（从 Markdown body 提取） */
  systemPrompt: string

  /** 定义文件路径 */
  filePath: string
}

/**
 * Agent 定义文件的 Frontmatter 结构
 *
 * 用于解析 Markdown 文件的 YAML frontmatter
 */
export interface AgentFrontmatter {
  /** Agent 名称（必填） */
  name: string

  /** 描述（必填） */
  description: string

  /** 可用工具列表（可选，默认为空数组） */
  tools?: string[]

  /** 模型配置（可选） */
  model?: string

  /** 权限模式（可选） */
  permissionMode?: PermissionMode
}

/**
 * Agent 定义验证结果
 */
export interface AgentValidationResult {
  /** 是否有效 */
  valid: boolean

  /** 验证错误列表 */
  errors: string[]
}

/**
 * Agent 注册表接口
 *
 * 管理内置和自定义子 Agent 的注册与查找
 */
export interface AgentRegistry {
  /**
   * 加载自定义 Agent 定义
   *
   * 扫描指定目录下的所有 .md 文件，解析并注册有效的 Agent 定义
   *
   * @param dir - 自定义 Agent 定义目录（相对于 cwd）
   * @returns Promise<void>
   */
  loadCustomAgents(dir: string): Promise<void>

  /**
   * 获取 Agent 定义
   *
   * @param name - Agent 名称
   * @returns Agent 定义，如果不存在则返回 undefined
   */
  getAgent(name: string): CustomAgentDefinition | undefined

  /**
   * 列出所有 Agent
   *
   * @returns 所有已注册的 Agent 定义列表
   */
  listAgents(): CustomAgentDefinition[]

  /**
   * 检查 Agent 是否存在
   *
   * @param name - Agent 名称
   * @returns 是否存在
   */
  hasAgent(name: string): boolean

  /**
   * 刷新 Agent 定义
   *
   * 重新加载所有自定义 Agent 定义
   *
   * @returns Promise<void>
   */
  refresh(): Promise<void>
}

/**
 * Agent 注册表配置
 */
export interface AgentRegistryConfig {
  /** 工作目录 */
  cwd: string

  /** 自定义 Agent 目录（相对于 cwd） */
  customAgentsDir: string
}

// ============================================================================
// Constants
// ============================================================================

/**
 * 默认自定义 Agent 目录
 */
export const DEFAULT_CUSTOM_AGENTS_DIR = ".naughty/agents"

/**
 * Agent 定义文件扩展名
 */
export const AGENT_FILE_EXTENSION = ".md"

/**
 * 必填字段列表
 */
export const REQUIRED_FIELDS: (keyof AgentFrontmatter)[] = ["name", "description"]

/**
 * 有效的权限模式
 */
export const VALID_PERMISSION_MODES: PermissionMode[] = ["ask", "allow", "plan"]

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * 验证 Agent 定义
 *
 * 检查 frontmatter 是否包含所有必填字段（name, description），
 * 并验证可选字段的类型和值。
 *
 * @param frontmatter - 解析的 frontmatter 数据
 * @param filePath - 文件路径（用于错误消息）
 * @returns 验证结果
 *
 * **Validates: Requirements 2.6** - THE Agent_Registry SHALL validate that required fields (name, description) are present
 */
export function validateAgentDefinition(
  frontmatter: unknown,
  filePath: string
): AgentValidationResult {
  const errors: string[] = []

  // 检查 frontmatter 是否为对象
  if (!frontmatter || typeof frontmatter !== "object") {
    return {
      valid: false,
      errors: [`${filePath}: frontmatter must be an object`],
    }
  }

  const data = frontmatter as Record<string, unknown>

  // 验证必填字段
  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) {
      errors.push(`${filePath}: missing required field '${field}'`)
    } else if (typeof data[field] !== "string") {
      errors.push(`${filePath}: field '${field}' must be a string`)
    } else if ((data[field] as string).trim() === "") {
      errors.push(`${filePath}: field '${field}' cannot be empty`)
    }
  }

  // 验证可选字段 tools（如果存在）
  if ("tools" in data && data.tools !== undefined) {
    if (!Array.isArray(data.tools)) {
      errors.push(`${filePath}: field 'tools' must be an array`)
    } else {
      for (let i = 0; i < data.tools.length; i++) {
        if (typeof data.tools[i] !== "string") {
          errors.push(`${filePath}: tools[${i}] must be a string`)
        }
      }
    }
  }

  // 验证可选字段 model（如果存在）
  if ("model" in data && data.model !== undefined) {
    if (typeof data.model !== "string") {
      errors.push(`${filePath}: field 'model' must be a string`)
    }
  }

  // 验证可选字段 permissionMode（如果存在）
  if ("permissionMode" in data && data.permissionMode !== undefined) {
    if (typeof data.permissionMode !== "string") {
      errors.push(`${filePath}: field 'permissionMode' must be a string`)
    } else if (!VALID_PERMISSION_MODES.includes(data.permissionMode as PermissionMode)) {
      errors.push(
        `${filePath}: field 'permissionMode' must be one of: ${VALID_PERMISSION_MODES.join(", ")}`
      )
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 解析 Agent 定义文件
 *
 * 使用 gray-matter 解析 Markdown 文件的 YAML frontmatter，
 * 提取配置信息和系统提示词（Markdown body）。
 *
 * @param content - 文件内容
 * @param filePath - 文件路径
 * @returns 解析结果，如果无效则返回 null
 *
 * **Validates: Requirements 2.2, 2.3, 2.4**
 * - 2.2: WHEN a Markdown file is found, THE Agent_Registry SHALL parse its frontmatter for agent configuration
 * - 2.3: THE custom agent definition SHALL support fields: name, description, tools, model, permissionMode
 * - 2.4: THE custom agent definition SHALL use the Markdown body as the system prompt
 */
export function parseAgentFile(
  content: string,
  filePath: string
): CustomAgentDefinition | null {
  try {
    // 使用 gray-matter 解析 Markdown 文件
    const { data: frontmatter, content: body } = matter(content)

    // 验证 frontmatter
    const validation = validateAgentDefinition(frontmatter, filePath)
    if (!validation.valid) {
      // 记录警告并返回 null
      for (const error of validation.errors) {
        console.warn(`[AgentRegistry] Invalid agent definition: ${error}`)
      }
      return null
    }

    // 类型断言（已通过验证）
    const data = frontmatter as AgentFrontmatter

    // 构建 CustomAgentDefinition
    const definition: CustomAgentDefinition = {
      name: data.name.trim(),
      description: data.description.trim(),
      tools: Array.isArray(data.tools) ? data.tools.map((t) => String(t).trim()) : [],
      systemPrompt: body.trim(),
      filePath,
    }

    // 添加可选字段
    if (data.model) {
      definition.model = data.model.trim()
    }

    if (data.permissionMode && VALID_PERMISSION_MODES.includes(data.permissionMode)) {
      definition.permissionMode = data.permissionMode
    }

    return definition
  } catch (error) {
    // 解析错误，记录警告并返回 null
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[AgentRegistry] Failed to parse agent file ${filePath}: ${message}`)
    return null
  }
}

// ============================================================================
// Factory Function Type (实现在 task 2.3)
// ============================================================================

/**
 * 创建 Agent 注册表
 *
 * @param config - 注册表配置
 * @returns Agent 注册表实例
 */
export type CreateAgentRegistry = (config?: Partial<AgentRegistryConfig>) => AgentRegistry

// ============================================================================
// Agent Registry Implementation
// ============================================================================

/**
 * 创建 Agent 注册表实例
 *
 * 工厂函数，创建一个新的 Agent 注册表实例。
 * 注册表负责扫描、加载和管理自定义 Agent 定义。
 *
 * @param config - 注册表配置（可选）
 * @returns Agent 注册表实例
 *
 * **Validates: Requirements 2.1, 2.5, 2.7**
 * - 2.1: THE Agent_Registry SHALL scan the `.naughty/agents/` directory for custom agent definitions on startup
 * - 2.5: WHEN a custom agent is requested, THE Agent_Registry SHALL return the parsed configuration or an error if not found
 * - 2.7: WHEN a custom agent definition is invalid, THE Agent_Registry SHALL log a warning and skip the invalid definition
 *
 * @example
 * ```typescript
 * const registry = createAgentRegistry({ cwd: process.cwd() })
 * await registry.loadCustomAgents(".naughty/agents")
 *
 * const agent = registry.getAgent("security-reviewer")
 * if (agent) {
 *   console.log(agent.systemPrompt)
 * }
 * ```
 */
export function createAgentRegistry(config?: Partial<AgentRegistryConfig>): AgentRegistry {
  // 合并配置与默认值
  const resolvedConfig: AgentRegistryConfig = {
    cwd: config?.cwd ?? process.cwd(),
    customAgentsDir: config?.customAgentsDir ?? DEFAULT_CUSTOM_AGENTS_DIR,
  }

  // 存储已加载的 Agent 定义
  const agents = new Map<string, CustomAgentDefinition>()

  // 记录当前加载的目录（用于 refresh）
  let loadedDir: string | null = null

  /**
   * 加载自定义 Agent 定义
   *
   * 扫描指定目录下的所有 .md 文件，解析并注册有效的 Agent 定义。
   * 无效的定义会被跳过并记录警告。
   *
   * @param dir - 自定义 Agent 定义目录（相对于 cwd）
   *
   * **Validates: Requirements 2.1, 2.7**
   */
  async function loadCustomAgents(dir: string): Promise<void> {
    // 保存目录用于 refresh
    loadedDir = dir

    // 清空现有 Agent
    agents.clear()

    // 构建绝对路径
    const absoluteDir = path.isAbsolute(dir) ? dir : path.join(resolvedConfig.cwd, dir)

    // 检查目录是否存在
    if (!fs.existsSync(absoluteDir)) {
      // 目录不存在，静默返回（不是错误）
      return
    }

    // 使用 fast-glob 扫描 .md 文件
    const pattern = path.join(absoluteDir, `*${AGENT_FILE_EXTENSION}`).replace(/\\/g, "/")
    const files = await fg(pattern, {
      onlyFiles: true,
      absolute: true,
    })

    // 解析每个文件
    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, "utf-8")
        const definition = parseAgentFile(content, filePath)

        if (definition) {
          // 检查是否有重名
          if (agents.has(definition.name)) {
            console.warn(
              `[AgentRegistry] Duplicate agent name '${definition.name}' in ${filePath}, ` +
                `skipping (already loaded from ${agents.get(definition.name)!.filePath})`
            )
            continue
          }

          // 注册 Agent
          agents.set(definition.name, definition)
        }
        // 如果 definition 为 null，parseAgentFile 已经记录了警告
      } catch (error) {
        // 文件读取错误，记录警告并继续
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[AgentRegistry] Failed to read agent file ${filePath}: ${message}`)
      }
    }
  }

  /**
   * 获取 Agent 定义
   *
   * @param name - Agent 名称
   * @returns Agent 定义，如果不存在则返回 undefined
   *
   * **Validates: Requirements 2.5**
   */
  function getAgent(name: string): CustomAgentDefinition | undefined {
    return agents.get(name)
  }

  /**
   * 列出所有 Agent
   *
   * @returns 所有已注册的 Agent 定义列表
   */
  function listAgents(): CustomAgentDefinition[] {
    return Array.from(agents.values())
  }

  /**
   * 检查 Agent 是否存在
   *
   * @param name - Agent 名称
   * @returns 是否存在
   */
  function hasAgent(name: string): boolean {
    return agents.has(name)
  }

  /**
   * 刷新 Agent 定义
   *
   * 重新加载所有自定义 Agent 定义。
   * 如果之前没有调用过 loadCustomAgents，则使用默认目录。
   */
  async function refresh(): Promise<void> {
    const dir = loadedDir ?? resolvedConfig.customAgentsDir
    await loadCustomAgents(dir)
  }

  return {
    loadCustomAgents,
    getAgent,
    listAgents,
    hasAgent,
    refresh,
  }
}

// ============================================================================
// Global Singleton
// ============================================================================

/**
 * 全局 Agent 注册表实例
 */
let globalAgentRegistry: AgentRegistry | null = null

/**
 * 获取全局 Agent 注册表实例
 *
 * 返回全局单例的 Agent 注册表。如果尚未创建，则创建一个新实例。
 *
 * @param config - 注册表配置（仅在首次创建时使用）
 * @returns 全局 Agent 注册表实例
 *
 * @example
 * ```typescript
 * const registry = getAgentRegistry()
 * await registry.loadCustomAgents(".naughty/agents")
 *
 * // 后续调用返回同一实例
 * const sameRegistry = getAgentRegistry()
 * ```
 */
export function getAgentRegistry(config?: Partial<AgentRegistryConfig>): AgentRegistry {
  if (!globalAgentRegistry) {
    globalAgentRegistry = createAgentRegistry(config)
  }
  return globalAgentRegistry
}

/**
 * 重置全局 Agent 注册表
 *
 * 清除全局单例实例。主要用于测试场景。
 *
 * @example
 * ```typescript
 * // 在测试 beforeEach 中重置
 * beforeEach(() => {
 *   resetAgentRegistry()
 * })
 * ```
 */
export function resetAgentRegistry(): void {
  globalAgentRegistry = null
}
