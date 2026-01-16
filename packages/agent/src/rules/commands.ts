/**
 * 动态指令发现
 *
 * 从项目中发现可用的命令（Justfile, Makefile, package.json scripts）
 */

import * as fs from "fs/promises"
import * as path from "path"
import type {
  ProjectCommand,
  CommandsIndex,
  CommandsConfig,
  CommandSource,
} from "./types"

// ============================================================================
// Justfile Parser
// ============================================================================

/**
 * 解析 Justfile
 *
 * Justfile 格式：
 * ```
 * # 注释说明
 * recipe-name arg1 arg2:
 *     command
 * ```
 */
export function parseJustfile(content: string): ProjectCommand[] {
  const commands: ProjectCommand[] = []
  const lines = content.split("\n")

  let currentComment = ""

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 收集注释
    const commentMatch = line.match(/^#\s*(.+)/)
    if (commentMatch) {
      currentComment = commentMatch[1].trim()
      continue
    }

    // 匹配 recipe 定义
    // 格式: name [args...]:
    const recipeMatch = line.match(/^([\w\-]+)(?:\s+[^:]+)?:\s*(?:[^#]*)?$/)
    if (recipeMatch) {
      const name = recipeMatch[1]

      // 跳过私有 recipe（以 _ 开头）
      if (name.startsWith("_")) {
        currentComment = ""
        continue
      }

      commands.push({
        name,
        description: currentComment || undefined,
        command: `just ${name}`,
        source: "justfile",
      })

      currentComment = ""
      continue
    }

    // 非注释非 recipe 行，清除注释
    if (line.trim() && !line.startsWith(" ") && !line.startsWith("\t")) {
      currentComment = ""
    }
  }

  return commands
}

// ============================================================================
// Makefile Parser
// ============================================================================

/**
 * 解析 Makefile
 *
 * Makefile 格式：
 * ```
 * # 注释说明
 * target: dependencies
 *     command
 * ```
 */
export function parseMakefile(content: string): ProjectCommand[] {
  const commands: ProjectCommand[] = []
  const lines = content.split("\n")

  let currentComment = ""

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 收集注释
    const commentMatch = line.match(/^#\s*(.+)/)
    if (commentMatch) {
      currentComment = commentMatch[1].trim()
      continue
    }

    // 匹配 target 定义
    // 格式: target: [dependencies]
    const targetMatch = line.match(/^([\w\-]+):\s*(.*)$/)
    if (targetMatch) {
      const name = targetMatch[1]

      // 跳过特殊 target
      if (name.startsWith(".") || name === "all" || name === "default") {
        // 保留 all 和 default，但跳过 .PHONY 等
        if (name.startsWith(".")) {
          currentComment = ""
          continue
        }
      }

      commands.push({
        name,
        description: currentComment || undefined,
        command: `make ${name}`,
        source: "makefile",
      })

      currentComment = ""
      continue
    }

    // 非注释非 target 行，清除注释
    if (line.trim() && !line.startsWith(" ") && !line.startsWith("\t")) {
      currentComment = ""
    }
  }

  return commands
}

// ============================================================================
// package.json Parser
// ============================================================================

/**
 * 解析 package.json scripts
 */
export function parsePackageScripts(
  pkg: { scripts?: Record<string, string> },
  packageManager: string = "npm"
): ProjectCommand[] {
  const commands: ProjectCommand[] = []

  if (!pkg.scripts) {
    return commands
  }

  // 确定运行命令前缀
  const runPrefix = packageManager === "npm" ? "npm run" : packageManager

  for (const [name, script] of Object.entries(pkg.scripts)) {
    // 跳过生命周期脚本
    if (
      name.startsWith("pre") ||
      name.startsWith("post") ||
      name === "prepare" ||
      name === "prepublishOnly"
    ) {
      continue
    }

    commands.push({
      name,
      description: extractScriptDescription(script),
      command: `${runPrefix} ${name}`,
      source: "package.json",
    })
  }

  return commands
}

/**
 * 从脚本内容提取描述
 * 简单实现：如果脚本很短，直接用作描述
 */
function extractScriptDescription(script: string): string | undefined {
  // 如果脚本很短（单个命令），可以作为描述
  if (script.length <= 50 && !script.includes("&&")) {
    return script
  }
  return undefined
}

/**
 * 检测包管理器
 */
export async function detectPackageManager(cwd: string): Promise<string> {
  // 按优先级检测
  const checks: Array<{ file: string; manager: string }> = [
    { file: "bun.lockb", manager: "bun" },
    { file: "pnpm-lock.yaml", manager: "pnpm" },
    { file: "yarn.lock", manager: "yarn" },
    { file: "package-lock.json", manager: "npm" },
  ]

  for (const { file, manager } of checks) {
    try {
      await fs.access(path.join(cwd, file))
      return manager
    } catch {
      // 继续检查下一个
    }
  }

  return "npm"
}

// ============================================================================
// Scripts Directory Scanner
// ============================================================================

/**
 * 扫描脚本目录
 */
export async function scanScriptsDir(dir: string): Promise<ProjectCommand[]> {
  const commands: ProjectCommand[] = []

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isFile()) continue

      const name = entry.name
      const filePath = path.join(dir, name)

      // 检查是否可执行（简单检查：有执行权限或特定扩展名）
      try {
        const stat = await fs.stat(filePath)
        const isExecutable =
          (stat.mode & 0o111) !== 0 || // Unix 可执行权限
          name.endsWith(".sh") ||
          name.endsWith(".bash") ||
          name.endsWith(".ps1") ||
          name.endsWith(".bat") ||
          name.endsWith(".cmd")

        if (!isExecutable) continue

        // 提取名称（去掉扩展名）
        const cmdName = name.replace(/\.(sh|bash|ps1|bat|cmd)$/, "")

        commands.push({
          name: cmdName,
          command: filePath,
          source: "scripts",
        })
      } catch {
        // 跳过无法访问的文件
      }
    }
  } catch {
    // 目录不存在
  }

  return commands
}

// ============================================================================
// Commands Discovery
// ============================================================================

/**
 * 发现项目指令
 */
export async function discoverCommands(
  cwd: string,
  config?: CommandsConfig
): Promise<CommandsIndex> {
  const sources = config?.sources ?? ["justfile", "makefile", "package.json", "scripts"]
  const commands: ProjectCommand[] = []

  // Justfile
  if (sources.includes("justfile")) {
    const justCommands = await discoverJustfile(cwd)
    commands.push(...justCommands)
  }

  // Makefile
  if (sources.includes("makefile")) {
    const makeCommands = await discoverMakefile(cwd)
    commands.push(...makeCommands)
  }

  // package.json
  if (sources.includes("package.json")) {
    const pkgCommands = await discoverPackageScripts(cwd)
    commands.push(...pkgCommands)
  }

  // scripts 目录
  if (sources.includes("scripts")) {
    const scriptCommands = await discoverScriptsDir(cwd)
    commands.push(...scriptCommands)
  }

  return {
    commands,
    discoveredAt: new Date().toISOString(),
  }
}

/**
 * 发现 Justfile 指令
 */
async function discoverJustfile(cwd: string): Promise<ProjectCommand[]> {
  const files = ["Justfile", "justfile", ".justfile"]

  for (const file of files) {
    try {
      const content = await fs.readFile(path.join(cwd, file), "utf-8")
      return parseJustfile(content)
    } catch {
      // 继续尝试下一个
    }
  }

  return []
}

/**
 * 发现 Makefile 指令
 */
async function discoverMakefile(cwd: string): Promise<ProjectCommand[]> {
  const files = ["Makefile", "makefile", "GNUmakefile"]

  for (const file of files) {
    try {
      const content = await fs.readFile(path.join(cwd, file), "utf-8")
      return parseMakefile(content)
    } catch {
      // 继续尝试下一个
    }
  }

  return []
}

/**
 * 发现 package.json scripts
 */
async function discoverPackageScripts(cwd: string): Promise<ProjectCommand[]> {
  try {
    const pkgPath = path.join(cwd, "package.json")
    const content = await fs.readFile(pkgPath, "utf-8")
    const pkg = JSON.parse(content)

    const packageManager = await detectPackageManager(cwd)
    return parsePackageScripts(pkg, packageManager)
  } catch {
    return []
  }
}

/**
 * 发现 scripts 目录
 */
async function discoverScriptsDir(cwd: string): Promise<ProjectCommand[]> {
  const dirs = ["scripts", "bin", ".scripts"]
  const commands: ProjectCommand[] = []

  for (const dir of dirs) {
    const dirPath = path.join(cwd, dir)
    const dirCommands = await scanScriptsDir(dirPath)
    commands.push(...dirCommands)
  }

  return commands
}

// ============================================================================
// Commands Discovery Class
// ============================================================================

/**
 * 指令发现器类
 * 提供缓存和统一接口
 */
export class CommandsDiscovery {
  private cache: Map<string, { index: CommandsIndex; timestamp: number }> = new Map()
  private config: Required<CommandsConfig>
  private cacheTimeout: number

  constructor(config?: CommandsConfig, cacheTimeout: number = 5 * 60 * 1000) {
    this.config = {
      discover: config?.discover ?? true,
      sources: config?.sources ?? ["justfile", "makefile", "package.json", "scripts"],
    }
    this.cacheTimeout = cacheTimeout
  }

  /**
   * 发现项目指令（带缓存）
   */
  async discover(cwd: string): Promise<CommandsIndex> {
    if (!this.config.discover) {
      return { commands: [], discoveredAt: new Date().toISOString() }
    }

    const cached = this.cache.get(cwd)
    const now = Date.now()

    if (cached && now - cached.timestamp < this.cacheTimeout) {
      return cached.index
    }

    const index = await discoverCommands(cwd, this.config)
    this.cache.set(cwd, { index, timestamp: now })

    return index
  }

  /**
   * 清除缓存
   */
  clearCache(cwd?: string): void {
    if (cwd) {
      this.cache.delete(cwd)
    } else {
      this.cache.clear()
    }
  }

  /**
   * 按名称查找指令
   */
  async findCommand(cwd: string, name: string): Promise<ProjectCommand | undefined> {
    const index = await this.discover(cwd)
    return index.commands.find((cmd) => cmd.name === name)
  }

  /**
   * 按来源过滤指令
   */
  async getCommandsBySource(cwd: string, source: CommandSource): Promise<ProjectCommand[]> {
    const index = await this.discover(cwd)
    return index.commands.filter((cmd) => cmd.source === source)
  }
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * 将发现的指令构建为系统提示
 */
export function buildCommandsPrompt(index: CommandsIndex): string {
  if (index.commands.length === 0) {
    return ""
  }

  const parts: string[] = ["# Available Project Commands\n"]
  parts.push("The project has the following commands available. Prefer using these existing commands over writing new scripts.\n")

  // 按来源分组
  const bySource = new Map<CommandSource, ProjectCommand[]>()
  for (const cmd of index.commands) {
    const list = bySource.get(cmd.source) ?? []
    list.push(cmd)
    bySource.set(cmd.source, list)
  }

  const sourceNames: Record<CommandSource, string> = {
    justfile: "Justfile",
    makefile: "Makefile",
    "package.json": "npm scripts",
    scripts: "Scripts",
  }

  for (const [source, commands] of bySource) {
    parts.push(`## ${sourceNames[source]}\n`)
    for (const cmd of commands) {
      if (cmd.description) {
        parts.push(`- \`${cmd.command}\`: ${cmd.description}`)
      } else {
        parts.push(`- \`${cmd.command}\``)
      }
    }
    parts.push("")
  }

  return parts.join("\n")
}
