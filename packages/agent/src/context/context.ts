/**
 * Context 上下文系统
 *
 * 负责：
 * - 加载项目规则 (.naughty/rules/)
 * - 收集项目结构（目录树、技术栈）
 * - 获取 Git 上下文
 * - 加载配置文件
 */

import * as fs from "fs/promises"
import * as path from "path"
import { spawn } from "child_process"

// ============================================================================
// Types
// ============================================================================

/**
 * 规则文件
 */
export interface RuleFile {
  /** 文件名（不含扩展名） */
  name: string
  /** 文件路径 */
  path: string
  /** 内容 */
  content: string
}

/**
 * 规则集合
 */
export interface RuleSet {
  /** 项目级规则 */
  project: RuleFile[]
  /** 用户全局规则 */
  user: RuleFile[]
}

/**
 * 技术栈信息
 */
export interface TechStack {
  /** 语言 */
  languages: string[]
  /** 框架 */
  frameworks: string[]
  /** 包管理器 */
  packageManager?: "npm" | "yarn" | "pnpm" | "bun"
  /** 测试框架 */
  testFramework?: string
  /** 构建工具 */
  buildTool?: string
}

/**
 * 项目结构
 */
export interface ProjectStructure {
  /** 根目录 */
  root: string
  /** 目录树（字符串格式） */
  tree: string
  /** 关键文件列表 */
  keyFiles: string[]
  /** 检测到的技术栈 */
  techStack: TechStack
}

/**
 * Git 提交信息
 */
export interface GitCommit {
  hash: string
  message: string
}

/**
 * Git 上下文
 */
export interface GitContext {
  /** 是否是 Git 仓库 */
  isRepo: boolean
  /** 当前分支 */
  branch?: string
  /** 是否有未提交更改 */
  isDirty?: boolean
  /** 暂存文件数 */
  stagedCount?: number
  /** 未暂存文件数 */
  unstagedCount?: number
  /** 最近提交 */
  recentCommits?: GitCommit[]
}

/**
 * Agent 配置
 */
export interface AgentConfig {
  /** 默认模型 */
  model?: string
  /** 自动确认的权限类型 */
  autoConfirm?: string[]
  /** 最大执行步数 */
  maxSteps?: number
  /** 自定义权限规则 */
  permissions?: Array<{
    type: string
    action: "allow" | "deny" | "ask"
    pattern?: string
  }>
  /** 环境变量 */
  env?: Record<string, string>
}

/**
 * 完整上下文
 */
export interface Context {
  /** 规则集合 */
  rules: RuleSet
  /** 项目结构 */
  structure: ProjectStructure
  /** Git 上下文 */
  git: GitContext
  /** Agent 配置 */
  config: AgentConfig
}

// ============================================================================
// Constants
// ============================================================================

const NAUGHT_DIR = ".naughty"
const RULES_DIR = "rules"
const CONFIG_FILE = "config.json"

/** 默认排除的目录/文件 */
const DEFAULT_EXCLUDES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  "__pycache__",
  ".pytest_cache",
  "target",
  "vendor",
  ".DS_Store",
  "*.log",
]

/** 关键文件（优先包含） */
const KEY_FILES = [
  "README.md",
  "package.json",
  "tsconfig.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "requirements.txt",
  ".naughty/rules/*.md",
]

// ============================================================================
// Rules Loading
// ============================================================================

/**
 * 加载规则文件
 */
export async function loadRules(cwd: string): Promise<RuleSet> {
  const projectRules = await loadRulesFromDir(path.join(cwd, NAUGHT_DIR, RULES_DIR))
  const userRules = await loadRulesFromDir(path.join(getUserHome(), NAUGHT_DIR, RULES_DIR))

  return {
    project: projectRules,
    user: userRules,
  }
}

/**
 * 从目录加载所有规则文件
 */
async function loadRulesFromDir(dir: string): Promise<RuleFile[]> {
  const rules: RuleFile[] = []

  try {
    const files = await fs.readdir(dir)
    for (const file of files) {
      if (!file.endsWith(".md")) continue

      const filePath = path.join(dir, file)
      try {
        const content = await fs.readFile(filePath, "utf-8")
        rules.push({
          name: file.replace(/\.md$/, ""),
          path: filePath,
          content,
        })
      } catch {
        // 跳过无法读取的文件
      }
    }
  } catch {
    // 目录不存在，返回空数组
  }

  return rules
}

/**
 * 合并规则为系统提示
 */
export function mergeRulesToPrompt(rules: RuleSet): string {
  const parts: string[] = []

  // 用户全局规则
  if (rules.user.length > 0) {
    parts.push("## User Rules\n")
    for (const rule of rules.user) {
      parts.push(`### ${rule.name}\n\n${rule.content}\n`)
    }
  }

  // 项目规则（优先级更高，放后面）
  if (rules.project.length > 0) {
    parts.push("## Project Rules\n")
    for (const rule of rules.project) {
      parts.push(`### ${rule.name}\n\n${rule.content}\n`)
    }
  }

  return parts.join("\n")
}

// ============================================================================
// Project Structure
// ============================================================================

/**
 * 收集项目结构
 */
export async function loadProjectStructure(
  cwd: string,
  options?: {
    maxDepth?: number
    maxFiles?: number
    exclude?: string[]
  }
): Promise<ProjectStructure> {
  const maxDepth = options?.maxDepth ?? 3
  const maxFiles = options?.maxFiles ?? 100
  const exclude = [...DEFAULT_EXCLUDES, ...(options?.exclude ?? [])]

  const tree = await generateTree(cwd, maxDepth, maxFiles, exclude)
  const keyFiles = await findKeyFiles(cwd)
  const techStack = await detectTechStack(cwd)

  return {
    root: cwd,
    tree,
    keyFiles,
    techStack,
  }
}

/**
 * 生成目录树
 */
async function generateTree(
  dir: string,
  maxDepth: number,
  maxFiles: number,
  exclude: string[],
  prefix = "",
  depth = 0,
  fileCount = { count: 0 }
): Promise<string> {
  if (depth > maxDepth || fileCount.count >= maxFiles) {
    return ""
  }

  const lines: string[] = []

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const filtered = entries.filter((e) => !shouldExclude(e.name, exclude))

    // 排序：目录在前，文件在后
    filtered.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    for (let i = 0; i < filtered.length && fileCount.count < maxFiles; i++) {
      const entry = filtered[i]
      const isLast = i === filtered.length - 1
      const connector = isLast ? "└── " : "├── "
      const childPrefix = isLast ? "    " : "│   "

      fileCount.count++
      lines.push(`${prefix}${connector}${entry.name}${entry.isDirectory() ? "/" : ""}`)

      if (entry.isDirectory()) {
        const childTree = await generateTree(
          path.join(dir, entry.name),
          maxDepth,
          maxFiles,
          exclude,
          prefix + childPrefix,
          depth + 1,
          fileCount
        )
        if (childTree) {
          lines.push(childTree)
        }
      }
    }

    if (fileCount.count >= maxFiles) {
      lines.push(`${prefix}... (truncated)`)
    }
  } catch {
    // 无法读取目录
  }

  return lines.join("\n")
}

/**
 * 检查是否应该排除
 */
function shouldExclude(name: string, exclude: string[]): boolean {
  for (const pattern of exclude) {
    if (pattern.startsWith("*")) {
      // 简单的后缀匹配
      if (name.endsWith(pattern.slice(1))) return true
    } else if (name === pattern) {
      return true
    }
  }
  return false
}

/**
 * 查找关键文件
 */
async function findKeyFiles(cwd: string): Promise<string[]> {
  const found: string[] = []

  for (const pattern of KEY_FILES) {
    if (pattern.includes("*")) {
      // glob 模式，简单处理
      const dir = path.dirname(pattern)
      const ext = path.extname(pattern)
      const fullDir = path.join(cwd, dir)
      try {
        const files = await fs.readdir(fullDir)
        for (const file of files) {
          if (file.endsWith(ext)) {
            found.push(path.join(dir, file))
          }
        }
      } catch {
        // 目录不存在
      }
    } else {
      // 精确匹配
      try {
        await fs.access(path.join(cwd, pattern))
        found.push(pattern)
      } catch {
        // 文件不存在
      }
    }
  }

  return found
}

/**
 * 检测技术栈
 */
async function detectTechStack(cwd: string): Promise<TechStack> {
  const stack: TechStack = {
    languages: [],
    frameworks: [],
  }

  // 检测 package.json
  try {
    const pkgPath = path.join(cwd, "package.json")
    const pkgContent = await fs.readFile(pkgPath, "utf-8")
    const pkg = JSON.parse(pkgContent)

    stack.languages.push("JavaScript")

    // TypeScript
    if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
      stack.languages.push("TypeScript")
    }

    // 框架检测
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (allDeps.react) stack.frameworks.push("React")
    if (allDeps.vue) stack.frameworks.push("Vue")
    if (allDeps.angular) stack.frameworks.push("Angular")
    if (allDeps.next) stack.frameworks.push("Next.js")
    if (allDeps.nuxt) stack.frameworks.push("Nuxt")
    if (allDeps.express) stack.frameworks.push("Express")
    if (allDeps.hono) stack.frameworks.push("Hono")
    if (allDeps.fastify) stack.frameworks.push("Fastify")

    // 测试框架
    if (allDeps.vitest) stack.testFramework = "Vitest"
    else if (allDeps.jest) stack.testFramework = "Jest"
    else if (allDeps.mocha) stack.testFramework = "Mocha"

    // 构建工具
    if (allDeps.vite) stack.buildTool = "Vite"
    else if (allDeps.webpack) stack.buildTool = "Webpack"
    else if (allDeps.esbuild) stack.buildTool = "esbuild"
    else if (allDeps.tsup) stack.buildTool = "tsup"
  } catch {
    // 没有 package.json
  }

  // 检测包管理器
  try {
    await fs.access(path.join(cwd, "bun.lockb"))
    stack.packageManager = "bun"
  } catch {
    try {
      await fs.access(path.join(cwd, "pnpm-lock.yaml"))
      stack.packageManager = "pnpm"
    } catch {
      try {
        await fs.access(path.join(cwd, "yarn.lock"))
        stack.packageManager = "yarn"
      } catch {
        try {
          await fs.access(path.join(cwd, "package-lock.json"))
          stack.packageManager = "npm"
        } catch {
          // 无法确定
        }
      }
    }
  }

  // 检测其他语言
  try {
    await fs.access(path.join(cwd, "Cargo.toml"))
    stack.languages.push("Rust")
  } catch {}

  try {
    await fs.access(path.join(cwd, "go.mod"))
    stack.languages.push("Go")
  } catch {}

  try {
    await fs.access(path.join(cwd, "pyproject.toml"))
    stack.languages.push("Python")
  } catch {
    try {
      await fs.access(path.join(cwd, "requirements.txt"))
      stack.languages.push("Python")
    } catch {}
  }

  return stack
}

// ============================================================================
// Git Context
// ============================================================================

/**
 * 获取 Git 上下文
 */
export async function loadGitContext(cwd: string): Promise<GitContext> {
  // 检查是否是 Git 仓库
  const isRepo = await runGitCommand(cwd, ["rev-parse", "--git-dir"])
    .then(() => true)
    .catch(() => false)

  if (!isRepo) {
    return { isRepo: false }
  }

  // 获取当前分支
  const branch = await runGitCommand(cwd, ["branch", "--show-current"])
    .then((out) => out.trim())
    .catch(() => undefined)

  // 获取状态
  const status = await runGitCommand(cwd, ["status", "--porcelain"])
    .then((out) => out.trim())
    .catch(() => "")

  const lines = status ? status.split("\n") : []
  const stagedCount = lines.filter((l) => /^[MADRC]/.test(l)).length
  const unstagedCount = lines.filter((l) => /^.[MADRC?]/.test(l)).length
  const isDirty = lines.length > 0

  // 获取最近提交
  const recentCommits = await runGitCommand(cwd, ["log", "--oneline", "-n", "5"])
    .then((out) =>
      out
        .trim()
        .split("\n")
        .filter((l) => l)
        .map((l) => {
          const [hash, ...rest] = l.split(" ")
          return { hash, message: rest.join(" ") }
        })
    )
    .catch(() => [])

  return {
    isRepo: true,
    branch,
    isDirty,
    stagedCount,
    unstagedCount,
    recentCommits,
  }
}

/**
 * 执行 Git 命令
 */
function runGitCommand(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""

    proc.stdout?.on("data", (data) => {
      stdout += data.toString()
    })
    proc.stderr?.on("data", (data) => {
      stderr += data.toString()
    })

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(stderr || `git exited with code ${code}`))
      }
    })

    proc.on("error", reject)
  })
}

// ============================================================================
// Config Loading
// ============================================================================

/**
 * 加载配置
 */
export async function loadConfig(cwd: string): Promise<AgentConfig> {
  const defaultConfig: AgentConfig = {
    maxSteps: 50,
  }

  // 加载用户全局配置
  const userConfig = await loadConfigFile(path.join(getUserHome(), NAUGHT_DIR, CONFIG_FILE))

  // 加载项目配置
  const projectConfig = await loadConfigFile(path.join(cwd, NAUGHT_DIR, CONFIG_FILE))

  // 合并配置：默认 < 用户 < 项目
  return {
    ...defaultConfig,
    ...userConfig,
    ...projectConfig,
    // 权限规则需要特殊合并（项目规则优先）
    permissions: [
      ...(projectConfig.permissions ?? []),
      ...(userConfig.permissions ?? []),
    ],
  }
}

/**
 * 加载配置文件
 */
async function loadConfigFile(filePath: string): Promise<AgentConfig> {
  try {
    const content = await fs.readFile(filePath, "utf-8")
    return JSON.parse(content)
  } catch {
    return {}
  }
}

// ============================================================================
// Full Context Loading
// ============================================================================

/**
 * 加载完整上下文
 */
export async function loadContext(cwd: string): Promise<Context> {
  const [rules, structure, git, config] = await Promise.all([
    loadRules(cwd),
    loadProjectStructure(cwd),
    loadGitContext(cwd),
    loadConfig(cwd),
  ])

  return { rules, structure, git, config }
}

/**
 * 构建包含上下文的系统提示
 */
export function buildContextPrompt(context: Context): string {
  const parts: string[] = []

  // 项目规则
  const rulesPrompt = mergeRulesToPrompt(context.rules)
  if (rulesPrompt) {
    parts.push("# Project Rules\n")
    parts.push(rulesPrompt)
  }

  // 项目结构
  parts.push("# Project Structure\n")
  parts.push("```")
  parts.push(context.structure.tree || "(empty)")
  parts.push("```\n")

  // 技术栈
  const { techStack } = context.structure
  if (techStack.languages.length > 0 || techStack.frameworks.length > 0) {
    parts.push("## Tech Stack\n")
    if (techStack.languages.length > 0) {
      parts.push(`- Languages: ${techStack.languages.join(", ")}`)
    }
    if (techStack.frameworks.length > 0) {
      parts.push(`- Frameworks: ${techStack.frameworks.join(", ")}`)
    }
    if (techStack.packageManager) {
      parts.push(`- Package Manager: ${techStack.packageManager}`)
    }
    if (techStack.testFramework) {
      parts.push(`- Test Framework: ${techStack.testFramework}`)
    }
    if (techStack.buildTool) {
      parts.push(`- Build Tool: ${techStack.buildTool}`)
    }
    parts.push("")
  }

  // Git 状态
  if (context.git.isRepo) {
    parts.push("# Git Status\n")
    parts.push(`- Branch: ${context.git.branch || "(detached)"}`)
    parts.push(`- Status: ${context.git.isDirty ? "has uncommitted changes" : "clean"}`)
    if (context.git.stagedCount) {
      parts.push(`- Staged: ${context.git.stagedCount} files`)
    }
    if (context.git.unstagedCount) {
      parts.push(`- Unstaged: ${context.git.unstagedCount} files`)
    }
    if (context.git.recentCommits && context.git.recentCommits.length > 0) {
      parts.push("\nRecent commits:")
      for (const commit of context.git.recentCommits.slice(0, 3)) {
        parts.push(`- ${commit.hash} ${commit.message}`)
      }
    }
    parts.push("")
  }

  return parts.join("\n")
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * 获取用户主目录
 */
function getUserHome(): string {
  return process.env.HOME || process.env.USERPROFILE || ""
}
