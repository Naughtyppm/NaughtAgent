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

// ─── 项目级运行时目录（对齐 CC 的 .claude/）────────────────
/** 项目级运行时数据统一根目录 */
export const NAUGHTY_PROJECT_DIR = ".naughty"

// ─── Token 限额 ────────────────────────────────────────
/** 默认最大输出 token（不含 thinking，仅限文本 + 工具调用） */
export const DEFAULT_MAX_TOKENS = 32_000
/** 升级后最大输出 token（命中 max_tokens 时自动升级） */
export const ESCALATED_MAX_TOKENS = 64_000
/** max_tokens 恢复最大重试次数（CC: MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3） */
export const MAX_TOKENS_RECOVERY_LIMIT = 3
/** 快速模型最大输出 token */
export const FAST_MAX_TOKENS = 4_096
/** 默认 thinking budget（独立于 max_tokens，不占用输出配额） */
export const DEFAULT_THINKING_BUDGET = 10_000

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
/** 默认最大步骤数（20000 步，持久模式下需要足够长的运行空间，靠 compact 续命） */
export const DEFAULT_MAX_STEPS = 20000
/** 连续错误阈值（超过则终止） */
export const MAX_CONSECUTIVE_ERRORS = 3
/** 自动压缩的 token 阈值（参照 CC: ~167K for 200K window，NA 上下文窗口约 200K） */
export const AUTO_COMPACT_TOKEN_THRESHOLD = 140_000
/** Compact 摘要 LLM 输入字符上限 */
export const COMPACT_SUMMARY_INPUT_LIMIT = 80_000
/** Compact 记忆提取输入字符上限 */
export const COMPACT_MEMORY_INPUT_LIMIT = 40_000

// ─── 工具输出 ──────────────────────────────────────────
/** Bash 工具最大输出字节 */
export const BASH_MAX_OUTPUT_LENGTH = 100_000
/** Read 工具单行最大字符 */
export const READ_MAX_LINE_LENGTH = 5_000
/** Write 工具单次最大行数 */
export const WRITE_MAX_LINES = 150
/** Glob 最大结果数 */
export const GLOB_MAX_RESULTS = 500
/** Grep 最大匹配数 */
export const GREP_MAX_MATCHES = 200
