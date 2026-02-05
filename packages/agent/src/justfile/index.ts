/**
 * Justfile 命令系统
 * 
 * 提供全局和项目 justfile 命令的解析、注册和执行功能
 */

// 类型导出
export type {
  JustParameter,
  JustCommand,
  ParseError,
  ParseResult,
  CommandSource,
  RegisteredCommand,
  RegistryConfig,
  CommandRegistry,
  ExecuteOptions,
  ExecuteResult,
  CommandExecutor,
  CommandInfo,
} from './types.js'

// 解析器导出
export { parseJustfile, parseJustfileFromPath } from './parser.js'

// 注册表导出
export { createCommandRegistry, DEFAULT_GLOBAL_PATH, DEFAULT_PROJECT_PATH } from './registry.js'

// 执行器导出
export { createCommandExecutor } from './executor.js'

// 默认 justfile 模板
export { DEFAULT_JUSTFILE } from './default-justfile.js'
