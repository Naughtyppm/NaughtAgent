/**
 * Security 模块导出
 */

export {
  // Types
  type PathCheckResult,
  type CommandCheckResult,
  type SecurityConfig,
  type SecurityChecker,
  // Constants
  SENSITIVE_PATHS,
  SENSITIVE_PATTERNS,
  DANGEROUS_COMMANDS,
  WARNING_COMMANDS,
  // Functions
  normalizePath,
  isInsidePath,
  isSensitivePath,
  checkPath,
  normalizeCommand,
  checkCommand,
  createSecurityChecker,
} from "./security"
