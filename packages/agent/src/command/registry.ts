/**
 * 统一命令注册表 (Unified Registry)
 *
 * 聚合三层命令：
 * - Builtin Layer: 内置命令（直接注册）
 * - External Layer: 外部命令（从 justfile 模块获取并转换）
 * - Skill Layer: AI 技能（从 skill 模块获取并转换）
 *
 * 提供统一的命令发现、搜索和访问接口
 *
 * @module command/registry
 */

import type {
  UnifiedCommand,
  CommandLayer,
  CommandSource,
  CommandParameter,
} from './types.js'
import { LAYER_PRIORITY } from './types.js'

// Builtin 命令
import { convertToUnifiedCommands } from './builtin/index.js'

// Justfile 命令
import type { RegisteredCommand, CommandRegistry, ParseError } from '../justfile/types.js'
import { createCommandRegistry } from '../justfile/index.js'

// Skill 命令
import type { SkillDefinition } from '../skill/types.js'
import { listSkills } from '../skill/index.js'

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 注册表加载错误
 */
export interface RegistryErrors {
  justfile: { global: ParseError[]; project: ParseError[] }
  skill: { global: Error[]; project: Error[] }
}

/**
 * 统一注册表配置
 */
export interface UnifiedRegistryConfig {
  /** 工作目录（用于项目级命令） */
  cwd?: string
  /** 全局 justfile 路径 */
  globalJustfilePath?: string
  /** 项目 justfile 路径 */
  projectJustfilePath?: string
}

/**
 * 统一注册表接口
 */
export interface UnifiedRegistry {
  /** 获取所有命令 */
  getAll(): UnifiedCommand[]

  /** 按层级获取 */
  getByLayer(layer: CommandLayer): UnifiedCommand[]

  /** 获取内置命令 */
  getBuiltin(): UnifiedCommand[]

  /** 获取外部命令 */
  getExternal(): UnifiedCommand[]

  /** 获取技能命令 */
  getSkills(): UnifiedCommand[]

  /** 根据名称获取（返回最高优先级） */
  get(name: string): UnifiedCommand | undefined

  /** 搜索命令 */
  search(query: string): UnifiedCommand[]

  /** 重新加载所有来源 */
  reload(): Promise<void>

  /** 获取加载错误 */
  getErrors(): RegistryErrors
}

// ============================================================================
// 转换函数
// ============================================================================

/**
 * 将 justfile RegisteredCommand 转换为 UnifiedCommand
 */
function convertJustfileCommand(cmd: RegisteredCommand): UnifiedCommand {
  // 确定来源
  const source: CommandSource =
    cmd.source === 'global' ? 'global-justfile' : 'project-justfile'

  // 转换参数
  const parameters: CommandParameter[] = cmd.parameters.map((p) => ({
    name: p.name,
    required: !p.hasDefault,
    defaultValue: p.defaultValue,
  }))

  return {
    name: cmd.name,
    description: cmd.description || `Run ${cmd.name} from justfile`,
    layer: 'external',
    executionMode: 'subprocess',
    source,
    parameters,
    sourcePath: cmd.sourcePath,
  }
}

/**
 * 将 SkillDefinition 转换为 UnifiedCommand
 */
function convertSkillDefinition(skill: SkillDefinition): UnifiedCommand {
  // 转换参数
  const parameters: CommandParameter[] = (skill.parameters ?? []).map((p) => ({
    name: p.name,
    description: p.description,
    required: p.required ?? false,
    defaultValue: p.default,
  }))

  return {
    name: skill.name,
    description: skill.description,
    layer: 'skill',
    executionMode: 'workflow',
    source: 'builtin-skill', // 目前只支持内置 skill
    parameters,
    aliases: skill.aliases,
    // 注意：Skill 特有属性（disableModelInvocation, contextMode, allowedTools, model）
    // 目前 SkillDefinition 类型尚未定义这些字段，待后续扩展时添加
  }
}

// ============================================================================
// UnifiedRegistry 实现
// ============================================================================

/**
 * 创建统一命令注册表
 *
 * @param config - 注册表配置
 * @returns 统一注册表实例
 *
 * @example
 * ```typescript
 * const registry = await createUnifiedRegistry({ cwd: process.cwd() })
 * const allCommands = registry.getAll()
 * const helpCmd = registry.get('help')
 * ```
 */
export async function createUnifiedRegistry(
  config: UnifiedRegistryConfig = {}
): Promise<UnifiedRegistry> {
  // 内部状态
  let builtinCommands: UnifiedCommand[] = []
  let externalCommands: UnifiedCommand[] = []
  let skillCommands: UnifiedCommand[] = []
  let justfileRegistry: CommandRegistry | null = null

  // 错误记录
  const errors: RegistryErrors = {
    justfile: { global: [], project: [] },
    skill: { global: [], project: [] },
  }

  /**
   * 加载内置命令
   */
  function loadBuiltinCommands(): void {
    builtinCommands = convertToUnifiedCommands()
  }

  /**
   * 加载外部命令（justfile）
   */
  async function loadExternalCommands(): Promise<void> {
    try {
      // 创建或重用 justfile 注册表
      if (!justfileRegistry) {
        justfileRegistry = await createCommandRegistry({
          globalPath: config.globalJustfilePath ?? '',
          projectPath: config.projectJustfilePath ?? '',
        })
      } else {
        await justfileRegistry.reload()
      }

      // 获取并转换命令
      const registeredCommands = justfileRegistry.getCommands()
      externalCommands = registeredCommands.map(convertJustfileCommand)

      // 记录错误
      const justfileErrors = justfileRegistry.getErrors()
      errors.justfile.global = justfileErrors.global
      errors.justfile.project = justfileErrors.project
    } catch (err) {
      // 如果 justfile 模块加载失败，记录错误但继续
      externalCommands = []
      errors.justfile.global = [
        {
          message: err instanceof Error ? err.message : String(err),
          line: 0,
        },
      ]
    }
  }

  /**
   * 加载技能命令
   */
  function loadSkillCommands(): void {
    try {
      const skills = listSkills()
      skillCommands = skills.map(convertSkillDefinition)
    } catch (err) {
      // 如果 skill 模块加载失败，记录错误但继续
      skillCommands = []
      errors.skill.global = [
        err instanceof Error ? err : new Error(String(err)),
      ]
    }
  }

  /**
   * 获取所有命令（按优先级排序，去重）
   */
  function getAllCommands(): UnifiedCommand[] {
    // 合并所有命令
    const allCommands = [
      ...builtinCommands,
      ...skillCommands,
      ...externalCommands,
    ]

    // 按名称去重，保留优先级最高的
    const commandMap = new Map<string, UnifiedCommand>()

    for (const cmd of allCommands) {
      const existing = commandMap.get(cmd.name)
      if (!existing) {
        commandMap.set(cmd.name, cmd)
      } else {
        // 比较优先级，保留优先级更高的（数值更小）
        const existingPriority = LAYER_PRIORITY[existing.layer]
        const newPriority = LAYER_PRIORITY[cmd.layer]
        if (newPriority < existingPriority) {
          commandMap.set(cmd.name, cmd)
        }
      }
    }

    // 转换为数组并按名称排序
    return Array.from(commandMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }

  // 初始化加载
  loadBuiltinCommands()
  loadSkillCommands()
  await loadExternalCommands()

  // 返回注册表实例
  return {
    getAll(): UnifiedCommand[] {
      return getAllCommands()
    },

    getByLayer(layer: CommandLayer): UnifiedCommand[] {
      switch (layer) {
        case 'builtin':
          return [...builtinCommands]
        case 'external':
          return [...externalCommands]
        case 'skill':
          return [...skillCommands]
        default:
          return []
      }
    },

    getBuiltin(): UnifiedCommand[] {
      return [...builtinCommands]
    },

    getExternal(): UnifiedCommand[] {
      return [...externalCommands]
    },

    getSkills(): UnifiedCommand[] {
      return [...skillCommands]
    },

    get(name: string): UnifiedCommand | undefined {
      // 按优先级顺序查找
      // 1. 先查 builtin（包括别名）
      const builtinCmd = builtinCommands.find(
        (cmd) => cmd.name === name || cmd.aliases?.includes(name)
      )
      if (builtinCmd) return builtinCmd

      // 2. 再查 skill（包括别名）
      const skillCmd = skillCommands.find(
        (cmd) => cmd.name === name || cmd.aliases?.includes(name)
      )
      if (skillCmd) return skillCmd

      // 3. 最后查 external
      const externalCmd = externalCommands.find((cmd) => cmd.name === name)
      if (externalCmd) return externalCmd

      return undefined
    },

    search(query: string): UnifiedCommand[] {
      const lowerQuery = query.toLowerCase()
      const allCommands = getAllCommands()

      return allCommands.filter((cmd) => {
        // 匹配名称
        if (cmd.name.toLowerCase().includes(lowerQuery)) return true
        // 匹配描述
        if (cmd.description.toLowerCase().includes(lowerQuery)) return true
        // 匹配别名
        if (cmd.aliases?.some((a) => a.toLowerCase().includes(lowerQuery)))
          return true
        return false
      })
    },

    async reload(): Promise<void> {
      // 重新加载所有来源
      loadBuiltinCommands()
      loadSkillCommands()
      await loadExternalCommands()
    },

    getErrors(): RegistryErrors {
      return {
        justfile: { ...errors.justfile },
        skill: { ...errors.skill },
      }
    },
  }
}

// ============================================================================
// 便捷工厂函数
// ============================================================================

/**
 * 创建同步版本的统一注册表（仅包含 builtin 和 skill）
 *
 * 用于不需要 justfile 命令的场景，但支持后续异步加载 justfile
 *
 * @param config - 注册表配置
 * @returns 同步创建的注册表实例
 */
export function createSyncRegistry(config: UnifiedRegistryConfig = {}): UnifiedRegistry {
  const builtinCommands = convertToUnifiedCommands()
  let skillCommands: UnifiedCommand[] = []
  let externalCommands: UnifiedCommand[] = []
  let justfileRegistry: CommandRegistry | null = null

  try {
    const skills = listSkills()
    skillCommands = skills.map(convertSkillDefinition)
  } catch {
    // 忽略 skill 加载错误
  }

  const errors: RegistryErrors = {
    justfile: { global: [], project: [] },
    skill: { global: [], project: [] },
  }

  function getAllCommands(): UnifiedCommand[] {
    const allCommands = [...builtinCommands, ...skillCommands, ...externalCommands]
    const commandMap = new Map<string, UnifiedCommand>()

    for (const cmd of allCommands) {
      const existing = commandMap.get(cmd.name)
      if (!existing) {
        commandMap.set(cmd.name, cmd)
      } else {
        const existingPriority = LAYER_PRIORITY[existing.layer]
        const newPriority = LAYER_PRIORITY[cmd.layer]
        if (newPriority < existingPriority) {
          commandMap.set(cmd.name, cmd)
        }
      }
    }

    return Array.from(commandMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }

  return {
    getAll: () => getAllCommands(),
    getByLayer: (layer) => {
      if (layer === 'builtin') return [...builtinCommands]
      if (layer === 'skill') return [...skillCommands]
      if (layer === 'external') return [...externalCommands]
      return []
    },
    getBuiltin: () => [...builtinCommands],
    getExternal: () => [...externalCommands],
    getSkills: () => [...skillCommands],
    get: (name) => {
      const builtinCmd = builtinCommands.find(
        (cmd) => cmd.name === name || cmd.aliases?.includes(name)
      )
      if (builtinCmd) return builtinCmd

      const skillCmd = skillCommands.find(
        (cmd) => cmd.name === name || cmd.aliases?.includes(name)
      )
      if (skillCmd) return skillCmd

      const externalCmd = externalCommands.find((cmd) => cmd.name === name)
      if (externalCmd) return externalCmd

      return undefined
    },
    search: (query) => {
      const lowerQuery = query.toLowerCase()
      return getAllCommands().filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(lowerQuery) ||
          cmd.description.toLowerCase().includes(lowerQuery) ||
          cmd.aliases?.some((a) => a.toLowerCase().includes(lowerQuery))
      )
    },
    reload: async () => {
      // 异步加载 justfile 命令
      try {
        if (!justfileRegistry) {
          // 只传入非空的路径配置，让 createCommandRegistry 使用默认值
          const registryConfig: { globalPath?: string; projectPath?: string } = {}
          if (config.globalJustfilePath) {
            registryConfig.globalPath = config.globalJustfilePath
          }
          if (config.projectJustfilePath) {
            registryConfig.projectPath = config.projectJustfilePath
          }
          justfileRegistry = createCommandRegistry(registryConfig)
        }
        await justfileRegistry.reload()

        const registeredCommands = justfileRegistry.getCommands()
        externalCommands = registeredCommands.map(convertJustfileCommand)

        const justfileErrors = justfileRegistry.getErrors()
        errors.justfile.global = justfileErrors.global
        errors.justfile.project = justfileErrors.project
      } catch (err) {
        externalCommands = []
        errors.justfile.global = [
          {
            message: err instanceof Error ? err.message : String(err),
            line: 0,
          },
        ]
      }

      // 重新加载 skill
      try {
        const skills = listSkills()
        skillCommands = skills.map(convertSkillDefinition)
      } catch {
        // 忽略错误
      }
    },
    getErrors: () => errors,
  }
}
