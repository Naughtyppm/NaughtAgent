/**
 * NaughtAgent 统一常量定义
 *
 * 所有魔术数字和配置值都从这里导出，严禁在其他文件中硬编码。
 * 修改前搜索引用方，确认影响范围。
 */

import { createRequire } from "module"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"
import { existsSync } from "fs"

// 从 package.json 读取版本号（兼容 src 和 dist 两种目录结构）
const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

function findPackageJson(): string {
  // 从当前目录向上查找包含 package.json 的目录
  let dir = __dirname
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(dir, "package.json")
    if (existsSync(candidate)) {
      // 确认是 agent 包（不是 monorepo root）
      try {
        const pkg = require(candidate) as { name?: string }
        if (pkg.name === "@naughtyagent/agent") return candidate
      } catch { /* ignore */ }
    }
    dir = resolve(dir, "..")
  }
  // 兜底
  return resolve(__dirname, "../../package.json")
}

const pkg = require(findPackageJson()) as { version: string }
export const VERSION: string = pkg.version

// ─── Daemon ────────────────────────────────────────────
export const DEFAULT_DAEMON_PORT = 31_415
export const NAUGHTY_DIR_NAME = ".naughtyagent"

// ─── Token 限额 ────────────────────────────────────────
/** 默认最大输出 token（替代 9 处硬编码 8192） */
export const DEFAULT_MAX_TOKENS = 8_192
/** 快速模型最大输出 token */
export const FAST_MAX_TOKENS = 4_096
/** 默认 thinking budget（替代 7 处硬编码 16000） */
export const DEFAULT_THINKING_BUDGET = 16_000

/** reasoning effort 对应的 thinking budget */
export const THINKING_BUDGETS = {
  low: 1_024,
  medium: 8_000,
  high: 32_000,
} as const

export type ReasoningEffort = keyof typeof THINKING_BUDGETS

/** 默认 temperature */
export const DEFAULT_TEMPERATURE = 0

// ─── Agent Loop ────────────────────────────────────────
/** 默认最大步骤数（设高避免中断，靠 compact 和 context window 自然限制） */
export const DEFAULT_MAX_STEPS = 20_000
/** 连续错误阈值（超过则终止） */
export const MAX_CONSECUTIVE_ERRORS = 3
/** 自动压缩的 token 阈值 */
export const AUTO_COMPACT_TOKEN_THRESHOLD = 50_000

// ─── 工具输出 ──────────────────────────────────────────
/** Bash 工具最大输出字节 */
export const BASH_MAX_OUTPUT_LENGTH = 100_000
/** Read 工具单行最大字符 */
export const READ_MAX_LINE_LENGTH = 2_000
/** Write 工具单次最大行数 */
export const WRITE_MAX_LINES = 80
/** Glob 最大结果数 */
export const GLOB_MAX_RESULTS = 500
/** Grep 最大匹配数 */
export const GREP_MAX_MATCHES = 100
