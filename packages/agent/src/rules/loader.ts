/**
 * 规则加载器
 *
 * 负责加载规则索引和规则内容
 */

import * as fs from "fs/promises"
import * as path from "path"
import type {
  RulesIndex,
  RuleMeta,
  LoadedRule,
  MatchContext,
  RulesConfig,
} from "./types"
import { matchRules, getAlwaysLoadRules } from "./matcher"

// ============================================================================
// Constants
// ============================================================================

const NAUGHT_DIR = ".naughty"
const RULES_DIR = "rules"
const INDEX_FILE = "index.yaml"
const INDEX_FILE_JSON = "index.json"

// ============================================================================
// YAML Parser (Simple)
// ============================================================================

/**
 * 简单的 YAML 解析器
 * 只支持规则索引文件的格式
 */
function parseSimpleYaml(content: string): RulesIndex {
  const lines = content.split("\n")
  const index: RulesIndex = { version: 1, rules: [] }
  let currentRule: Partial<RuleMeta> | null = null
  let currentTrigger: Record<string, unknown> | null = null
  let inTriggers = false
  let inWords = false
  let inNames = false

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    // 跳过空行和注释
    if (!line.trim() || line.trim().startsWith("#")) {
      continue
    }

    // 版本
    const versionMatch = line.match(/^version:\s*(\d+)/)
    if (versionMatch) {
      index.version = parseInt(versionMatch[1], 10)
      continue
    }

    // rules 数组开始
    if (line.match(/^rules:\s*$/)) {
      continue
    }

    // 新规则开始 (- id: xxx)
    const idMatch = line.match(/^\s+-\s*id:\s*(.+)/)
    if (idMatch) {
      // 保存上一个触发条件
      if (currentTrigger && currentTrigger.type && currentRule) {
        currentRule.triggers!.push(currentTrigger as any)
      }
      // 保存上一个规则
      if (currentRule && currentRule.id) {
        index.rules.push(currentRule as RuleMeta)
      }
      currentRule = {
        id: idMatch[1].trim(),
        file: "",
        description: "",
        triggers: [],
      }
      inTriggers = false
      currentTrigger = null
      inWords = false
      inNames = false
      continue
    }

    if (!currentRule) continue

    // 规则属性（缩进的 key: value）
    const propMatch = line.match(/^\s+(file|description|priority|alwaysLoad|triggers):\s*(.*)/)
    if (propMatch) {
      const [, key, value] = propMatch

      if (key === "file") {
        currentRule.file = value.trim()
      } else if (key === "description") {
        currentRule.description = value.trim()
      } else if (key === "priority") {
        currentRule.priority = parseInt(value.trim(), 10)
      } else if (key === "alwaysLoad") {
        currentRule.alwaysLoad = value.trim() === "true"
      } else if (key === "triggers") {
        inTriggers = true
        // 保存上一个触发条件
        if (currentTrigger && currentTrigger.type) {
          currentRule.triggers!.push(currentTrigger as any)
        }
        currentTrigger = null
        inWords = false
        inNames = false
      }
      continue
    }

    if (!inTriggers) continue

    // 新触发条件 (- type: xxx)
    const typeMatch = line.match(/^\s+-\s*type:\s*(.+)/)
    if (typeMatch) {
      // 保存上一个触发条件
      if (currentTrigger && currentTrigger.type) {
        currentRule.triggers!.push(currentTrigger as any)
      }
      currentTrigger = { type: typeMatch[1].trim() }
      inWords = false
      inNames = false
      continue
    }

    if (!currentTrigger) continue

    // 触发条件属性
    const triggerPropMatch = line.match(/^\s+(pattern|words|names):\s*(.*)/)
    if (triggerPropMatch) {
      const [, key, value] = triggerPropMatch

      if (key === "pattern") {
        // 去掉引号
        currentTrigger.pattern = value.trim().replace(/^["']|["']$/g, "")
      } else if (key === "words") {
        inWords = true
        inNames = false
        // 检查内联数组
        const inlineMatch = value.match(/^\[([^\]]*)\]/)
        if (inlineMatch) {
          currentTrigger.words = inlineMatch[1]
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean)
          inWords = false
        } else {
          currentTrigger.words = []
        }
      } else if (key === "names") {
        inNames = true
        inWords = false
        // 检查内联数组
        const inlineMatch = value.match(/^\[([^\]]*)\]/)
        if (inlineMatch) {
          currentTrigger.names = inlineMatch[1]
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean)
          inNames = false
        } else {
          currentTrigger.names = []
        }
      }
      continue
    }

    // 数组项 (- value)
    const itemMatch = line.match(/^\s+-\s*"?([^"]+)"?/)
    if (itemMatch) {
      const value = itemMatch[1].trim()
      if (inWords && Array.isArray(currentTrigger.words)) {
        currentTrigger.words.push(value)
      } else if (inNames && Array.isArray(currentTrigger.names)) {
        currentTrigger.names.push(value)
      }
      continue
    }
  }

  // 保存最后的触发条件和规则
  if (currentTrigger && currentTrigger.type && currentRule) {
    currentRule.triggers!.push(currentTrigger as any)
  }
  if (currentRule && currentRule.id) {
    index.rules.push(currentRule as RuleMeta)
  }

  return index
}

// ============================================================================
// Index Loading
// ============================================================================

/**
 * 加载规则索引
 */
export async function loadRulesIndex(cwd: string): Promise<RulesIndex> {
  const rulesDir = path.join(cwd, NAUGHT_DIR, RULES_DIR)

  // 尝试加载 YAML 索引
  try {
    const yamlPath = path.join(rulesDir, INDEX_FILE)
    const content = await fs.readFile(yamlPath, "utf-8")
    return parseSimpleYaml(content)
  } catch {
    // YAML 不存在，尝试 JSON
  }

  // 尝试加载 JSON 索引
  try {
    const jsonPath = path.join(rulesDir, INDEX_FILE_JSON)
    const content = await fs.readFile(jsonPath, "utf-8")
    return JSON.parse(content) as RulesIndex
  } catch {
    // JSON 也不存在，生成默认索引
  }

  // 自动生成默认索引
  return generateDefaultIndex(rulesDir)
}

/**
 * 自动生成默认索引
 * 扫描 rules 目录下的所有 .md 文件
 */
export async function generateDefaultIndex(rulesDir: string): Promise<RulesIndex> {
  const rules: RuleMeta[] = []

  try {
    const files = await fs.readdir(rulesDir)

    for (const file of files) {
      if (!file.endsWith(".md")) continue

      const id = file.replace(/\.md$/, "")
      rules.push({
        id,
        file,
        description: `Rules from ${file}`,
        triggers: [], // 无触发条件，需要显式加载
      })
    }
  } catch {
    // 目录不存在，返回空索引
  }

  return { version: 1, rules }
}

// ============================================================================
// Rule Loading
// ============================================================================

/**
 * 加载单个规则内容
 */
export async function loadRule(cwd: string, meta: RuleMeta): Promise<LoadedRule> {
  const rulesDir = path.join(cwd, NAUGHT_DIR, RULES_DIR)
  const filePath = path.join(rulesDir, meta.file)

  const content = await fs.readFile(filePath, "utf-8")

  return {
    meta,
    content,
  }
}

/**
 * 批量加载规则内容
 */
export async function loadRules(cwd: string, metas: RuleMeta[]): Promise<LoadedRule[]> {
  const results: LoadedRule[] = []

  for (const meta of metas) {
    try {
      const rule = await loadRule(cwd, meta)
      results.push(rule)
    } catch {
      // 跳过无法加载的规则
      console.warn(`Failed to load rule: ${meta.id} (${meta.file})`)
    }
  }

  return results
}

/**
 * 加载始终加载的规则
 */
export async function loadAlwaysRules(cwd: string): Promise<LoadedRule[]> {
  const index = await loadRulesIndex(cwd)
  const alwaysRules = getAlwaysLoadRules(index)
  return loadRules(cwd, alwaysRules)
}

/**
 * 加载匹配上下文的规则
 */
export async function loadMatchedRules(
  cwd: string,
  context: MatchContext,
  config?: RulesConfig
): Promise<LoadedRule[]> {
  const maxRules = config?.maxRulesPerRequest ?? 5

  const index = await loadRulesIndex(cwd)
  const matched = matchRules(index, context, maxRules)

  return loadRules(cwd, matched)
}

// ============================================================================
// Rules Loader Class
// ============================================================================

/**
 * 规则加载器类
 * 提供缓存和统一接口
 */
export class RulesLoader {
  private indexCache: Map<string, { index: RulesIndex; timestamp: number }> = new Map()
  private config: Required<RulesConfig>

  constructor(config?: RulesConfig) {
    this.config = {
      autoDiscover: config?.autoDiscover ?? true,
      maxRulesPerRequest: config?.maxRulesPerRequest ?? 5,
      cacheTimeout: config?.cacheTimeout ?? 5 * 60 * 1000,
    }
  }

  /**
   * 加载规则索引（带缓存）
   */
  async loadIndex(cwd: string): Promise<RulesIndex> {
    const cached = this.indexCache.get(cwd)
    const now = Date.now()

    if (cached && now - cached.timestamp < this.config.cacheTimeout) {
      return cached.index
    }

    const index = await loadRulesIndex(cwd)
    this.indexCache.set(cwd, { index, timestamp: now })

    return index
  }

  /**
   * 清除缓存
   */
  clearCache(cwd?: string): void {
    if (cwd) {
      this.indexCache.delete(cwd)
    } else {
      this.indexCache.clear()
    }
  }

  /**
   * 加载始终加载的规则
   */
  async loadAlwaysRules(cwd: string): Promise<LoadedRule[]> {
    const index = await this.loadIndex(cwd)
    const alwaysRules = getAlwaysLoadRules(index)
    return loadRules(cwd, alwaysRules)
  }

  /**
   * 加载匹配上下文的规则
   */
  async loadMatchedRules(cwd: string, context: MatchContext): Promise<LoadedRule[]> {
    const index = await this.loadIndex(cwd)
    const matched = matchRules(index, context, this.config.maxRulesPerRequest)
    return loadRules(cwd, matched)
  }

  /**
   * 加载所有相关规则（始终加载 + 匹配）
   * 自动去重
   */
  async loadRelevantRules(cwd: string, context: MatchContext): Promise<LoadedRule[]> {
    const index = await this.loadIndex(cwd)

    // 获取始终加载的规则
    const alwaysRules = getAlwaysLoadRules(index)

    // 获取匹配的规则
    const matchedRules = matchRules(index, context, this.config.maxRulesPerRequest)

    // 合并去重
    const allRules = [...alwaysRules]
    const ids = new Set(alwaysRules.map((r) => r.id))

    for (const rule of matchedRules) {
      if (!ids.has(rule.id)) {
        allRules.push(rule)
        ids.add(rule.id)
      }
    }

    // 按优先级排序
    allRules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

    // 限制总数
    const limited = allRules.slice(0, this.config.maxRulesPerRequest)

    return loadRules(cwd, limited)
  }
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * 将加载的规则构建为系统提示
 */
export function buildRulesPrompt(rules: LoadedRule[]): string {
  if (rules.length === 0) {
    return ""
  }

  const parts: string[] = ["# Project Rules\n"]

  for (const rule of rules) {
    parts.push(`## ${rule.meta.id}`)
    if (rule.meta.description) {
      parts.push(`> ${rule.meta.description}\n`)
    }
    parts.push(rule.content)
    parts.push("")
  }

  return parts.join("\n")
}
