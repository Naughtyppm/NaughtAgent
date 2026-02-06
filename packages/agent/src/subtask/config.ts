/**
 * SubAgent 配置管理
 *
 * 提供子 Agent 系统的配置类型定义和默认值。
 * 支持通过 `.naughty/config.json` 或环境变量进行配置。
 *
 * @module subtask/config
 */

import * as fs from "node:fs"
import * as path from "node:path"

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * 重试配置
 */
export interface RetrySettings {
  /** 最大重试次数 */
  maxAttempts: number
  /** 初始延迟（毫秒） */
  initialDelay: number
  /** 最大延迟（毫秒） */
  maxDelay: number
  /** 退避乘数 */
  backoffMultiplier: number
}

/**
 * 子 Agent 系统配置
 *
 * 控制子 Agent 的执行行为，包括超时、并发、重试等。
 *
 * @example
 * ```typescript
 * const config: SubAgentConfig = {
 *   defaultTimeout: 180000,
 *   maxConcurrency: 3,
 *   retry: {
 *     maxAttempts: 3,
 *     initialDelay: 1000,
 *     maxDelay: 10000,
 *     backoffMultiplier: 2,
 *   },
 *   customAgentsDir: ".naughty/agents",
 * }
 * ```
 */
export interface SubAgentConfig {
  /** 默认超时（毫秒），默认 3 分钟 */
  defaultTimeout: number
  /** 最大并发数，默认 3 */
  maxConcurrency: number
  /** 重试配置 */
  retry: RetrySettings
  /** 默认模型（可选，不设置则使用系统默认） */
  defaultModel?: string
  /** 自定义 Agent 目录，默认 ".naughty/agents" */
  customAgentsDir: string
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * 默认重试配置
 */
export const DEFAULT_RETRY_SETTINGS: RetrySettings = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
}

/**
 * 默认子 Agent 配置
 *
 * 提供合理的默认值，适用于大多数使用场景：
 * - 3 分钟超时：足够完成大多数任务
 * - 3 个并发：平衡资源使用和执行效率
 * - 3 次重试：处理临时性错误
 *
 * @example
 * ```typescript
 * import { DEFAULT_CONFIG } from "./config"
 *
 * // 使用默认配置
 * const timeout = DEFAULT_CONFIG.defaultTimeout // 180000
 *
 * // 合并自定义配置
 * const customConfig = {
 *   ...DEFAULT_CONFIG,
 *   maxConcurrency: 5,
 * }
 * ```
 */
export const DEFAULT_CONFIG: SubAgentConfig = {
  defaultTimeout: 180000, // 3 分钟
  maxConcurrency: 3,
  retry: DEFAULT_RETRY_SETTINGS,
  customAgentsDir: ".naughty/agents",
}

// ============================================================================
// Configuration Utilities
// ============================================================================

/**
 * 合并配置，使用默认值填充缺失字段
 *
 * @param partial - 部分配置
 * @returns 完整配置
 *
 * @example
 * ```typescript
 * const config = mergeConfig({ maxConcurrency: 5 })
 * // config.defaultTimeout === 180000 (使用默认值)
 * // config.maxConcurrency === 5 (使用自定义值)
 * ```
 */
export function mergeConfig(partial: Partial<SubAgentConfig>): SubAgentConfig {
  return {
    defaultTimeout: partial.defaultTimeout ?? DEFAULT_CONFIG.defaultTimeout,
    maxConcurrency: partial.maxConcurrency ?? DEFAULT_CONFIG.maxConcurrency,
    retry: partial.retry
      ? {
          maxAttempts: partial.retry.maxAttempts ?? DEFAULT_RETRY_SETTINGS.maxAttempts,
          initialDelay: partial.retry.initialDelay ?? DEFAULT_RETRY_SETTINGS.initialDelay,
          maxDelay: partial.retry.maxDelay ?? DEFAULT_RETRY_SETTINGS.maxDelay,
          backoffMultiplier: partial.retry.backoffMultiplier ?? DEFAULT_RETRY_SETTINGS.backoffMultiplier,
        }
      : DEFAULT_RETRY_SETTINGS,
    defaultModel: partial.defaultModel ?? DEFAULT_CONFIG.defaultModel,
    customAgentsDir: partial.customAgentsDir ?? DEFAULT_CONFIG.customAgentsDir,
  }
}

/**
 * 深度冻结配置对象，防止意外修改
 *
 * @param config - 配置对象
 * @returns 冻结后的配置对象
 */
export function freezeConfig<T extends object>(config: T): Readonly<T> {
  return Object.freeze(
    Object.keys(config).reduce((acc, key) => {
      const value = (config as Record<string, unknown>)[key]
      if (value && typeof value === "object" && !Object.isFrozen(value)) {
        ;(acc as Record<string, unknown>)[key] = freezeConfig(value as object)
      }
      return acc
    }, config)
  ) as Readonly<T>
}

// 导出冻结的默认配置，防止意外修改
export const FROZEN_DEFAULT_CONFIG: Readonly<SubAgentConfig> = freezeConfig({ ...DEFAULT_CONFIG })

// ============================================================================
// Configuration Validation
// ============================================================================

/**
 * 配置验证错误
 */
export interface ConfigValidationError {
  /** 字段路径 */
  field: string
  /** 错误消息 */
  message: string
  /** 实际值 */
  value: unknown
}

/**
 * 配置验证结果
 */
export interface ConfigValidationResult {
  /** 是否有效 */
  valid: boolean
  /** 验证错误列表 */
  errors: ConfigValidationError[]
}

/**
 * 验证配置值
 *
 * 检查配置值是否符合要求：
 * - 数值字段必须为正数
 * - 字符串字段不能为空（如果提供）
 * - 嵌套对象递归验证
 *
 * @param config - 要验证的配置
 * @returns 验证结果
 *
 * @example
 * ```typescript
 * const result = validateConfig({ defaultTimeout: -1 })
 * // result.valid === false
 * // result.errors[0].field === "defaultTimeout"
 * ```
 */
export function validateConfig(config: Partial<SubAgentConfig>): ConfigValidationResult {
  const errors: ConfigValidationError[] = []

  // 验证 defaultTimeout
  if (config.defaultTimeout !== undefined) {
    if (typeof config.defaultTimeout !== "number") {
      errors.push({
        field: "defaultTimeout",
        message: "必须是数字类型",
        value: config.defaultTimeout,
      })
    } else if (config.defaultTimeout <= 0) {
      errors.push({
        field: "defaultTimeout",
        message: "必须是正数",
        value: config.defaultTimeout,
      })
    }
  }

  // 验证 maxConcurrency
  if (config.maxConcurrency !== undefined) {
    if (typeof config.maxConcurrency !== "number") {
      errors.push({
        field: "maxConcurrency",
        message: "必须是数字类型",
        value: config.maxConcurrency,
      })
    } else if (!Number.isInteger(config.maxConcurrency) || config.maxConcurrency <= 0) {
      errors.push({
        field: "maxConcurrency",
        message: "必须是正整数",
        value: config.maxConcurrency,
      })
    }
  }

  // 验证 retry 配置
  if (config.retry !== undefined) {
    if (typeof config.retry !== "object" || config.retry === null) {
      errors.push({
        field: "retry",
        message: "必须是对象类型",
        value: config.retry,
      })
    } else {
      // 验证 retry.maxAttempts
      if (config.retry.maxAttempts !== undefined) {
        if (typeof config.retry.maxAttempts !== "number") {
          errors.push({
            field: "retry.maxAttempts",
            message: "必须是数字类型",
            value: config.retry.maxAttempts,
          })
        } else if (!Number.isInteger(config.retry.maxAttempts) || config.retry.maxAttempts <= 0) {
          errors.push({
            field: "retry.maxAttempts",
            message: "必须是正整数",
            value: config.retry.maxAttempts,
          })
        }
      }

      // 验证 retry.initialDelay
      if (config.retry.initialDelay !== undefined) {
        if (typeof config.retry.initialDelay !== "number") {
          errors.push({
            field: "retry.initialDelay",
            message: "必须是数字类型",
            value: config.retry.initialDelay,
          })
        } else if (config.retry.initialDelay < 0) {
          errors.push({
            field: "retry.initialDelay",
            message: "不能为负数",
            value: config.retry.initialDelay,
          })
        }
      }

      // 验证 retry.maxDelay
      if (config.retry.maxDelay !== undefined) {
        if (typeof config.retry.maxDelay !== "number") {
          errors.push({
            field: "retry.maxDelay",
            message: "必须是数字类型",
            value: config.retry.maxDelay,
          })
        } else if (config.retry.maxDelay < 0) {
          errors.push({
            field: "retry.maxDelay",
            message: "不能为负数",
            value: config.retry.maxDelay,
          })
        }
      }

      // 验证 retry.backoffMultiplier
      if (config.retry.backoffMultiplier !== undefined) {
        if (typeof config.retry.backoffMultiplier !== "number") {
          errors.push({
            field: "retry.backoffMultiplier",
            message: "必须是数字类型",
            value: config.retry.backoffMultiplier,
          })
        } else if (config.retry.backoffMultiplier < 1) {
          errors.push({
            field: "retry.backoffMultiplier",
            message: "必须大于等于 1",
            value: config.retry.backoffMultiplier,
          })
        }
      }

      // 验证 initialDelay <= maxDelay
      if (
        config.retry.initialDelay !== undefined &&
        config.retry.maxDelay !== undefined &&
        typeof config.retry.initialDelay === "number" &&
        typeof config.retry.maxDelay === "number" &&
        config.retry.initialDelay > config.retry.maxDelay
      ) {
        errors.push({
          field: "retry.initialDelay",
          message: "初始延迟不能大于最大延迟",
          value: config.retry.initialDelay,
        })
      }
    }
  }

  // 验证 defaultModel
  if (config.defaultModel !== undefined) {
    if (typeof config.defaultModel !== "string") {
      errors.push({
        field: "defaultModel",
        message: "必须是字符串类型",
        value: config.defaultModel,
      })
    } else if (config.defaultModel.trim() === "") {
      errors.push({
        field: "defaultModel",
        message: "不能为空字符串",
        value: config.defaultModel,
      })
    }
  }

  // 验证 customAgentsDir
  if (config.customAgentsDir !== undefined) {
    if (typeof config.customAgentsDir !== "string") {
      errors.push({
        field: "customAgentsDir",
        message: "必须是字符串类型",
        value: config.customAgentsDir,
      })
    } else if (config.customAgentsDir.trim() === "") {
      errors.push({
        field: "customAgentsDir",
        message: "不能为空字符串",
        value: config.customAgentsDir,
      })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// ============================================================================
// Environment Variable Support
// ============================================================================

/**
 * 环境变量名称映射
 */
export const ENV_VAR_NAMES = {
  defaultTimeout: "NAUGHTY_SUBAGENT_TIMEOUT",
  maxConcurrency: "NAUGHTY_SUBAGENT_MAX_CONCURRENCY",
  retryMaxAttempts: "NAUGHTY_SUBAGENT_RETRY_MAX_ATTEMPTS",
  retryInitialDelay: "NAUGHTY_SUBAGENT_RETRY_INITIAL_DELAY",
  retryMaxDelay: "NAUGHTY_SUBAGENT_RETRY_MAX_DELAY",
  retryBackoffMultiplier: "NAUGHTY_SUBAGENT_RETRY_BACKOFF_MULTIPLIER",
  defaultModel: "NAUGHTY_SUBAGENT_DEFAULT_MODEL",
  customAgentsDir: "NAUGHTY_SUBAGENT_CUSTOM_AGENTS_DIR",
} as const

/**
 * 从环境变量加载配置覆盖
 *
 * 支持的环境变量：
 * - NAUGHTY_SUBAGENT_TIMEOUT: 默认超时（毫秒）
 * - NAUGHTY_SUBAGENT_MAX_CONCURRENCY: 最大并发数
 * - NAUGHTY_SUBAGENT_RETRY_MAX_ATTEMPTS: 最大重试次数
 * - NAUGHTY_SUBAGENT_RETRY_INITIAL_DELAY: 初始延迟（毫秒）
 * - NAUGHTY_SUBAGENT_RETRY_MAX_DELAY: 最大延迟（毫秒）
 * - NAUGHTY_SUBAGENT_RETRY_BACKOFF_MULTIPLIER: 退避乘数
 * - NAUGHTY_SUBAGENT_DEFAULT_MODEL: 默认模型
 * - NAUGHTY_SUBAGENT_CUSTOM_AGENTS_DIR: 自定义 Agent 目录
 *
 * @returns 从环境变量解析的部分配置
 *
 * @example
 * ```typescript
 * // 设置环境变量
 * process.env.NAUGHTY_SUBAGENT_TIMEOUT = "300000"
 * process.env.NAUGHTY_SUBAGENT_MAX_CONCURRENCY = "5"
 *
 * const envConfig = loadConfigFromEnv()
 * // envConfig.defaultTimeout === 300000
 * // envConfig.maxConcurrency === 5
 * ```
 */
export function loadConfigFromEnv(): Partial<SubAgentConfig> {
  const config: Partial<SubAgentConfig> = {}
  const retry: Partial<RetrySettings> = {}

  // 解析数值型环境变量
  const parseNumber = (envVar: string): number | undefined => {
    const value = process.env[envVar]
    if (value === undefined || value === "") return undefined
    const num = Number(value)
    return Number.isNaN(num) ? undefined : num
  }

  // 解析字符串型环境变量
  const parseString = (envVar: string): string | undefined => {
    const value = process.env[envVar]
    return value === undefined || value === "" ? undefined : value
  }

  // 加载顶级配置
  const timeout = parseNumber(ENV_VAR_NAMES.defaultTimeout)
  if (timeout !== undefined) config.defaultTimeout = timeout

  const concurrency = parseNumber(ENV_VAR_NAMES.maxConcurrency)
  if (concurrency !== undefined) config.maxConcurrency = concurrency

  const model = parseString(ENV_VAR_NAMES.defaultModel)
  if (model !== undefined) config.defaultModel = model

  const agentsDir = parseString(ENV_VAR_NAMES.customAgentsDir)
  if (agentsDir !== undefined) config.customAgentsDir = agentsDir

  // 加载重试配置
  const maxAttempts = parseNumber(ENV_VAR_NAMES.retryMaxAttempts)
  if (maxAttempts !== undefined) retry.maxAttempts = maxAttempts

  const initialDelay = parseNumber(ENV_VAR_NAMES.retryInitialDelay)
  if (initialDelay !== undefined) retry.initialDelay = initialDelay

  const maxDelay = parseNumber(ENV_VAR_NAMES.retryMaxDelay)
  if (maxDelay !== undefined) retry.maxDelay = maxDelay

  const backoffMultiplier = parseNumber(ENV_VAR_NAMES.retryBackoffMultiplier)
  if (backoffMultiplier !== undefined) retry.backoffMultiplier = backoffMultiplier

  // 只有当有重试配置时才添加
  if (Object.keys(retry).length > 0) {
    config.retry = retry as RetrySettings
  }

  return config
}

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * 配置文件路径
 */
export const CONFIG_FILE_NAME = ".naughty/config.json"

/**
 * 配置加载错误
 */
export class ConfigLoadError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly validationErrors?: ConfigValidationError[]
  ) {
    super(message)
    this.name = "ConfigLoadError"
  }
}

/**
 * 从文件加载配置
 *
 * @param cwd - 工作目录
 * @returns 从文件解析的部分配置，如果文件不存在则返回空对象
 * @throws ConfigLoadError 如果文件存在但无法解析
 *
 * @example
 * ```typescript
 * const fileConfig = await loadConfigFromFile("/path/to/project")
 * ```
 */
export async function loadConfigFromFile(cwd: string): Promise<Partial<SubAgentConfig>> {
  const configPath = path.join(cwd, CONFIG_FILE_NAME)

  // 检查文件是否存在
  if (!fs.existsSync(configPath)) {
    return {}
  }

  try {
    const content = fs.readFileSync(configPath, "utf-8")
    const json = JSON.parse(content)

    // 配置可能在 subagent 键下
    const subagentConfig = json.subagent || json

    return subagentConfig as Partial<SubAgentConfig>
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ConfigLoadError(`配置文件 ${configPath} 格式错误: ${error.message}`, error)
    }
    throw new ConfigLoadError(
      `无法读取配置文件 ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    )
  }
}

/**
 * 加载完整配置
 *
 * 配置加载优先级（从低到高）：
 * 1. 默认配置
 * 2. 配置文件 (.naughty/config.json)
 * 3. 环境变量
 *
 * @param cwd - 工作目录
 * @returns 合并后的完整配置
 * @throws ConfigLoadError 如果配置无效
 *
 * @example
 * ```typescript
 * const config = await loadConfig("/path/to/project")
 * console.log(config.defaultTimeout) // 180000 或自定义值
 * ```
 */
export async function loadConfig(cwd: string): Promise<SubAgentConfig> {
  // 1. 从文件加载配置
  const fileConfig = await loadConfigFromFile(cwd)

  // 2. 从环境变量加载配置
  const envConfig = loadConfigFromEnv()

  // 3. 合并配置（环境变量优先级最高）
  const mergedPartial: Partial<SubAgentConfig> = {
    ...fileConfig,
    ...envConfig,
  }

  // 处理嵌套的 retry 配置合并
  if (fileConfig.retry || envConfig.retry) {
    mergedPartial.retry = {
      ...(fileConfig.retry || {}),
      ...(envConfig.retry || {}),
    } as RetrySettings
  }

  // 4. 验证合并后的配置
  const validationResult = validateConfig(mergedPartial)
  if (!validationResult.valid) {
    const errorMessages = validationResult.errors
      .map((e) => `${e.field}: ${e.message} (值: ${JSON.stringify(e.value)})`)
      .join("; ")
    throw new ConfigLoadError(`配置验证失败: ${errorMessages}`, undefined, validationResult.errors)
  }

  // 5. 使用默认值填充缺失字段
  return mergeConfig(mergedPartial)
}

// ============================================================================
// Configuration Manager
// ============================================================================

/**
 * 配置管理器接口
 */
export interface ConfigManager {
  /** 加载配置 */
  load(cwd: string): Promise<SubAgentConfig>
  /** 获取当前配置 */
  get(): SubAgentConfig
  /** 合并配置 */
  merge(partial: Partial<SubAgentConfig>): SubAgentConfig
}

/**
 * 创建配置管理器
 *
 * @returns 配置管理器实例
 *
 * @example
 * ```typescript
 * const configManager = createConfigManager()
 * await configManager.load("/path/to/project")
 * const config = configManager.get()
 * ```
 */
export function createConfigManager(): ConfigManager {
  let currentConfig: SubAgentConfig = { ...DEFAULT_CONFIG }

  return {
    async load(cwd: string): Promise<SubAgentConfig> {
      currentConfig = await loadConfig(cwd)
      return currentConfig
    },

    get(): SubAgentConfig {
      return currentConfig
    },

    merge(partial: Partial<SubAgentConfig>): SubAgentConfig {
      currentConfig = mergeConfig({
        ...currentConfig,
        ...partial,
        retry: partial.retry
          ? {
              ...currentConfig.retry,
              ...partial.retry,
            }
          : currentConfig.retry,
      })
      return currentConfig
    },
  }
}

// 全局配置管理器实例
let globalConfigManager: ConfigManager | null = null

/**
 * 获取全局配置管理器
 *
 * @returns 全局配置管理器实例
 */
export function getConfigManager(): ConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = createConfigManager()
  }
  return globalConfigManager
}

/**
 * 重置全局配置管理器（主要用于测试）
 */
export function resetConfigManager(): void {
  globalConfigManager = null
}
