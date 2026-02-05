/**
 * HashCalculator 哈希计算器
 *
 * 负责：
 * - 计算项目哈希（基于关键文件）
 * - 计算单文件哈希
 * - 计算字符串内容哈希
 * - 支持排除 .gitignore 和常见排除模式
 *
 * 需求: 2.1, 2.2, 2.3
 */

import * as fs from "fs/promises"
import * as path from "path"
import * as crypto from "crypto"
import { minimatch } from "minimatch"

// ============================================================================
// Types
// ============================================================================

/**
 * 哈希计算器配置
 */
export interface HashCalculatorConfig {
  /** 要包含在哈希计算中的关键文件 */
  keyFiles: string[]
  /** 排除模式 */
  excludePatterns: string[]
  /** 是否包含文件修改时间 */
  includeTimestamps: boolean
}

/**
 * 哈希计算器接口
 */
export interface HashCalculator {
  /** 计算项目哈希 */
  computeProjectHash(cwd: string): Promise<string>

  /** 计算单个文件内容哈希 */
  computeFileHash(filePath: string): Promise<string>

  /** 计算字符串内容哈希 */
  computeContentHash(content: string): string
}

// ============================================================================
// Constants
// ============================================================================

/** 默认关键文件列表 */
const DEFAULT_KEY_FILES = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "tsconfig.json",
  "tsconfig.*.json",
  "Cargo.toml",
  "Cargo.lock",
  "go.mod",
  "go.sum",
  "pyproject.toml",
  "requirements.txt",
  "poetry.lock",
  "Pipfile",
  "Pipfile.lock",
  ".nvmrc",
  ".node-version",
  ".python-version",
  "Makefile",
  "justfile",
]

/** 默认排除模式（常见排除目录/文件） */
const DEFAULT_EXCLUDE_PATTERNS = [
  "node_modules/**",
  ".git/**",
  "dist/**",
  "build/**",
  "coverage/**",
  ".next/**",
  ".nuxt/**",
  ".output/**",
  "__pycache__/**",
  ".pytest_cache/**",
  "target/**",
  "vendor/**",
  ".DS_Store",
  "*.log",
  ".env",
  ".env.*",
  "*.tmp",
  "*.temp",
]

// ============================================================================
// Implementation
// ============================================================================

/**
 * 创建哈希计算器
 */
export function createHashCalculator(config?: Partial<HashCalculatorConfig>): HashCalculator {
  const finalConfig: HashCalculatorConfig = {
    keyFiles: config?.keyFiles ?? DEFAULT_KEY_FILES,
    excludePatterns: config?.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS,
    includeTimestamps: config?.includeTimestamps ?? true,
  }

  return {
    computeProjectHash: (cwd: string) => computeProjectHash(cwd, finalConfig),
    computeFileHash,
    computeContentHash,
  }
}

/**
 * 计算项目哈希
 *
 * 基于关键项目文件计算哈希，用于检测项目变更。
 * 需求 2.1: 基于关键项目文件计算哈希
 * 需求 2.2: 包含文件修改时间戳
 * 需求 2.3: 忽略 .gitignore 和常见排除模式
 */
async function computeProjectHash(cwd: string, config: HashCalculatorConfig): Promise<string> {
  // 加载 .gitignore 模式
  const gitignorePatterns = await loadGitignorePatterns(cwd)
  const allExcludePatterns = [...config.excludePatterns, ...gitignorePatterns]

  // 收集关键文件信息
  const fileInfos: Array<{ path: string; content: string; mtime?: number }> = []

  for (const pattern of config.keyFiles) {
    const matchedFiles = await findMatchingFiles(cwd, pattern, allExcludePatterns)

    for (const filePath of matchedFiles) {
      const fullPath = path.join(cwd, filePath)

      try {
        const [content, stats] = await Promise.all([
          fs.readFile(fullPath, "utf-8"),
          config.includeTimestamps ? fs.stat(fullPath) : Promise.resolve(null),
        ])

        fileInfos.push({
          path: filePath,
          content,
          mtime: stats?.mtimeMs,
        })
      } catch {
        // 文件不可读，跳过
      }
    }
  }

  // 按路径排序，确保哈希稳定
  fileInfos.sort((a, b) => a.path.localeCompare(b.path))

  // 构建哈希输入
  const hashInput = fileInfos
    .map((info) => {
      const parts = [info.path, info.content]
      if (config.includeTimestamps && info.mtime !== undefined) {
        parts.push(String(info.mtime))
      }
      return parts.join("\n")
    })
    .join("\n---\n")

  return computeContentHash(hashInput)
}

/**
 * 计算单个文件内容哈希
 */
async function computeFileHash(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, "utf-8")
  return computeContentHash(content)
}

/**
 * 计算字符串内容哈希
 *
 * 使用 SHA-256 算法
 */
function computeContentHash(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex")
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 加载 .gitignore 模式
 */
async function loadGitignorePatterns(cwd: string): Promise<string[]> {
  const gitignorePath = path.join(cwd, ".gitignore")
  const patterns: string[] = []

  try {
    const content = await fs.readFile(gitignorePath, "utf-8")
    const lines = content.split("\n")

    for (const line of lines) {
      const trimmed = line.trim()
      // 跳过空行和注释
      if (!trimmed || trimmed.startsWith("#")) {
        continue
      }

      // 转换 gitignore 模式为 glob 模式
      const pattern = convertGitignoreToGlob(trimmed)
      if (pattern) {
        patterns.push(pattern)
      }
    }
  } catch {
    // .gitignore 不存在或不可读
  }

  return patterns
}

/**
 * 将 gitignore 模式转换为 glob 模式
 */
function convertGitignoreToGlob(pattern: string): string {
  // 处理否定模式（以 ! 开头）- 暂不支持
  if (pattern.startsWith("!")) {
    return ""
  }

  // 处理目录模式（以 / 结尾）
  if (pattern.endsWith("/")) {
    return pattern + "**"
  }

  // 处理绝对路径模式（以 / 开头）
  if (pattern.startsWith("/")) {
    return pattern.slice(1)
  }

  // 如果模式不包含 /，则匹配任意深度
  if (!pattern.includes("/")) {
    return "**/" + pattern
  }

  return pattern
}

/**
 * 查找匹配的文件
 */
async function findMatchingFiles(
  cwd: string,
  pattern: string,
  excludePatterns: string[]
): Promise<string[]> {
  const results: string[] = []

  // 检查是否是 glob 模式
  if (pattern.includes("*")) {
    // 使用简单的 glob 匹配
    const files = await walkDirectory(cwd, excludePatterns)
    for (const file of files) {
      if (minimatch(file, pattern, { dot: true })) {
        results.push(file)
      }
    }
  } else {
    // 精确匹配
    const fullPath = path.join(cwd, pattern)
    try {
      await fs.access(fullPath)
      // 检查是否被排除
      if (!isExcluded(pattern, excludePatterns)) {
        results.push(pattern)
      }
    } catch {
      // 文件不存在
    }
  }

  return results
}

/**
 * 遍历目录（浅层，只遍历根目录和一级子目录）
 */
async function walkDirectory(cwd: string, excludePatterns: string[]): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string, relativePath: string, depth: number): Promise<void> {
    // 限制深度，避免遍历过深
    if (depth > 2) return

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const entryRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name

        // 检查是否被排除
        if (isExcluded(entryRelativePath, excludePatterns)) {
          continue
        }

        if (entry.isFile()) {
          results.push(entryRelativePath)
        } else if (entry.isDirectory()) {
          await walk(path.join(dir, entry.name), entryRelativePath, depth + 1)
        }
      }
    } catch {
      // 目录不可读
    }
  }

  await walk(cwd, "", 0)
  return results
}

/**
 * 检查路径是否被排除
 */
function isExcluded(filePath: string, excludePatterns: string[]): boolean {
  for (const pattern of excludePatterns) {
    if (minimatch(filePath, pattern, { dot: true })) {
      return true
    }
  }
  return false
}

// ============================================================================
// Exports
// ============================================================================

export { DEFAULT_KEY_FILES, DEFAULT_EXCLUDE_PATTERNS, computeContentHash }
