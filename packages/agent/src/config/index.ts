/**
 * 配置中心 —— NaughtAgent 所有配置的统一入口
 *
 * 使用方式：
 *   import { VERSION, DEFAULT_MAX_TOKENS, getEnvConfig, resolveModelId } from "@/config"
 */

// 常量
export {
  VERSION,
  DEFAULT_DAEMON_PORT,
  NAUGHTY_DIR_NAME,
  DEFAULT_MAX_TOKENS,
  ESCALATED_MAX_TOKENS,
  MAX_TOKENS_RECOVERY_LIMIT,
  FAST_MAX_TOKENS,
  DEFAULT_THINKING_BUDGET,
  THINKING_BUDGETS,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_STEPS,
  MAX_CONSECUTIVE_ERRORS,
  AUTO_COMPACT_TOKEN_THRESHOLD,
  COMPACT_SUMMARY_INPUT_LIMIT,
  COMPACT_MEMORY_INPUT_LIMIT,
  BASH_MAX_OUTPUT_LENGTH,
  READ_MAX_LINE_LENGTH,
  WRITE_MAX_LINES,
  GLOB_MAX_RESULTS,
  GREP_MAX_MATCHES,
} from "./constants.js"
export type { ReasoningEffort } from "./constants.js"

// 环境变量
export { getEnvConfig, resetEnvConfig } from "./env.js"
export type { EnvConfig } from "./env.js"

// 模型注册表
export {
  MODEL_REGISTRY,
  resolveModelId,
  resolveModelName,
  isProxyBaseURL,
  getModelByShortName,
  getAvailableModels,
  getModelEntry,
} from "./models.js"
export type { ModelEntry, ModelProviderType } from "./models.js"
