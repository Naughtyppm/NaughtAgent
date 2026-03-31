/**
 * 统一模型注册表
 *
 * 合并原来散落在 provider/types.ts 中的 3 套映射表
 * (KIRO_MODEL_MAP, ANTHROPIC_MODEL_MAP, COPILOT_MODEL_MAP)
 * 为单一数据源。新增模型只需在 MODEL_REGISTRY 中添加一行。
 */

// ─── 模型条目定义 ──────────────────────────────────────

export interface ModelEntry {
  /** 用户输入的简写：sonnet, opus, haiku */
  shortName: string
  /** Anthropic API 完整格式（带日期后缀） */
  anthropicId: string
  /** Copilot API 格式（不带日期后缀） */
  copilotId: string
  /** Kiro 格式 */
  kiroId: string
  /** UI 显示名 */
  displayName: string
  /** 性能档次 */
  tier: "fast" | "standard" | "premium"
  /** 是否支持 extended thinking */
  supportsThinking: boolean
  /** copilot-api 是否自动启用 adaptive thinking（不能发 temperature: 0） */
  copilotAdaptiveThinking: boolean
}

// ─── 模型注册表（单一数据源） ──────────────────────────

export const MODEL_REGISTRY: readonly ModelEntry[] = [
  // Haiku 系列
  {
    shortName: "haiku",
    anthropicId: "claude-haiku-4-20250514",
    copilotId: "claude-haiku-4.5",
    kiroId: "claude-haiku-4.5",
    displayName: "Claude Haiku 4",
    tier: "fast",
    supportsThinking: false,
    copilotAdaptiveThinking: false,
  },

  // Sonnet 系列
  {
    shortName: "sonnet",
    anthropicId: "claude-sonnet-4-20250514",
    copilotId: "claude-sonnet-4",
    kiroId: "claude-sonnet-4",
    displayName: "Claude Sonnet 4",
    tier: "standard",
    supportsThinking: true,
    copilotAdaptiveThinking: false,
  },
  {
    shortName: "sonnet-4.5",
    anthropicId: "claude-sonnet-4-5-20250514",
    copilotId: "claude-sonnet-4.5",
    kiroId: "claude-sonnet-4.5",
    displayName: "Claude Sonnet 4.5",
    tier: "standard",
    supportsThinking: true,
    copilotAdaptiveThinking: false,
  },
  {
    shortName: "sonnet-4.6",
    anthropicId: "claude-sonnet-4-6-20260206",
    copilotId: "claude-sonnet-4.6",
    kiroId: "claude-sonnet-4.6",
    displayName: "Claude Sonnet 4.6",
    tier: "standard",
    supportsThinking: true,
    copilotAdaptiveThinking: true,
  },

  // Opus 系列
  {
    shortName: "opus",
    anthropicId: "claude-opus-4-20250514",
    copilotId: "claude-opus-4.5",
    kiroId: "claude-opus-4.5",
    displayName: "Claude Opus 4",
    tier: "premium",
    supportsThinking: true,
    copilotAdaptiveThinking: false,
  },
  {
    shortName: "opus-4.5",
    anthropicId: "claude-opus-4-5-20251101",
    copilotId: "claude-opus-4.5",
    kiroId: "claude-opus-4.5",
    displayName: "Claude Opus 4.5",
    tier: "premium",
    supportsThinking: true,
    copilotAdaptiveThinking: false,
  },
  {
    shortName: "opus-4.6",
    anthropicId: "claude-opus-4-6-20260206",
    copilotId: "claude-opus-4.6",
    kiroId: "claude-opus-4.6",
    displayName: "Claude Opus 4.6",
    tier: "premium",
    supportsThinking: true,
    copilotAdaptiveThinking: true,
  },
] as const

// ─── Provider 类型 ─────────────────────────────────────

export type ModelProviderType = "anthropic" | "copilot" | "kiro"

// ─── 查询和解析函数 ────────────────────────────────────

// 构建反向索引（模块加载时一次性构建）
const _byShortName = new Map<string, ModelEntry>()
const _byAnthropicId = new Map<string, ModelEntry>()
const _byCopilotId = new Map<string, ModelEntry>()
const _byKiroId = new Map<string, ModelEntry>()

for (const entry of MODEL_REGISTRY) {
  _byShortName.set(entry.shortName, entry)
  _byAnthropicId.set(entry.anthropicId, entry)
  _byCopilotId.set(entry.copilotId, entry)
  _byKiroId.set(entry.kiroId, entry)
}

/** 通过简写获取模型条目 */
export function getModelByShortName(name: string): ModelEntry | undefined {
  return _byShortName.get(name)
}

/** 获取所有可用模型（用于 CLI 帮助和模型选择器） */
export function getAvailableModels(): readonly ModelEntry[] {
  return MODEL_REGISTRY
}

/**
 * 解析任意模型输入为指定 Provider 的模型 ID
 *
 * 支持以下输入格式：
 * - 简写：sonnet, opus, haiku, sonnet-4.5, opus-4.6 等
 * - Anthropic 完整格式：claude-sonnet-4-20250514
 * - Copilot 格式：claude-sonnet-4, claude-opus-4.6
 * - Kiro 格式：同 Copilot
 * - claude- 前缀简写：claude-sonnet, claude-opus
 * - OpenAI 兼容：gpt-4o, gpt-4o-mini, o1
 */
export function resolveModelId(
  input: string,
  providerType: ModelProviderType,
): string {
  if (!input) return getDefaultModelId(providerType)

  // 1. 精确匹配简写
  const byShort = _byShortName.get(input)
  if (byShort) return getModelId(byShort, providerType)

  // 2. 精确匹配任意 Provider 的 ID
  const byAnthropic = _byAnthropicId.get(input)
  if (byAnthropic) return getModelId(byAnthropic, providerType)

  const byCopilot = _byCopilotId.get(input)
  if (byCopilot) return getModelId(byCopilot, providerType)

  const byKiro = _byKiroId.get(input)
  if (byKiro) return getModelId(byKiro, providerType)

  // 3. 带版本号的简写：sonnet-4, opus-4, haiku-4
  const withVersion = _byShortName.get(input.replace(/-4$/, ""))
  if (withVersion) return getModelId(withVersion, providerType)

  // 4. claude- 前缀简写
  const claudePrefix = input.replace(/^claude-/, "")
  if (claudePrefix !== input) {
    const byPrefix = _byShortName.get(claudePrefix)
    if (byPrefix) return getModelId(byPrefix, providerType)
  }

  // 5. OpenAI 兼容名称
  const openaiMap: Record<string, string> = {
    "gpt-4o": "sonnet",
    "gpt-4o-mini": "haiku",
    o1: "opus",
  }
  const mapped = openaiMap[input]
  if (mapped) {
    const entry = _byShortName.get(mapped)
    if (entry) return getModelId(entry, providerType)
  }

  // 6. 模糊匹配
  const lower = input.toLowerCase()
  const fuzzyEntry = fuzzyMatch(lower)
  if (fuzzyEntry) return getModelId(fuzzyEntry, providerType)

  // 7. 兜底：返回默认模型
  return getDefaultModelId(providerType)
}

/**
 * 检测 baseURL 是否为本地反代（copilot-api 等）
 */
export function isProxyBaseURL(baseURL?: string): boolean {
  if (!baseURL) return false
  return baseURL.includes("localhost") || baseURL.includes("127.0.0.1")
}

/**
 * 根据 baseURL 自动选择模型名格式
 * 反代用 copilot 格式，原生用 anthropic 格式
 */
export function resolveModelName(model: string, baseURL?: string): string {
  const providerType: ModelProviderType = isProxyBaseURL(baseURL)
    ? "copilot"
    : "anthropic"
  return resolveModelId(model, providerType)
}

/**
 * 获取模型条目信息（用于 UI 显示、thinking 判断等）
 */
export function getModelEntry(modelId: string): ModelEntry | undefined {
  return (
    _byAnthropicId.get(modelId) ??
    _byCopilotId.get(modelId) ??
    _byKiroId.get(modelId) ??
    _byShortName.get(modelId)
  )
}

// ─── 内部辅助 ──────────────────────────────────────────

function getModelId(entry: ModelEntry, providerType: ModelProviderType): string {
  switch (providerType) {
    case "anthropic":
      return entry.anthropicId
    case "copilot":
      return entry.copilotId
    case "kiro":
      return entry.kiroId
  }
}

function getDefaultModelId(providerType: ModelProviderType): string {
  const defaultEntry = _byShortName.get("sonnet")!
  return getModelId(defaultEntry, providerType)
}

function fuzzyMatch(lower: string): ModelEntry | undefined {
  if (lower.includes("opus")) {
    if (lower.includes("4.6")) return _byShortName.get("opus-4.6")
    if (lower.includes("4.5")) return _byShortName.get("opus-4.5")
    return _byShortName.get("opus")
  }
  if (lower.includes("haiku")) {
    return _byShortName.get("haiku")
  }
  if (lower.includes("sonnet")) {
    if (lower.includes("4.6")) return _byShortName.get("sonnet-4.6")
    if (lower.includes("4.5")) return _byShortName.get("sonnet-4.5")
    return _byShortName.get("sonnet")
  }
  return undefined
}
