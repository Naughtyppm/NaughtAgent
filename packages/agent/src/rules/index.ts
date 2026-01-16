/**
 * Rules 索引系统
 *
 * 按需加载项目规则，动态发现项目指令
 */

// Types
export type {
  RuleTrigger,
  GlobTrigger,
  CommandTrigger,
  KeywordTrigger,
  ToolTrigger,
  RuleMeta,
  RulesIndex,
  LoadedRule,
  MatchContext,
  CommandSource,
  ProjectCommand,
  CommandsIndex,
  RulesConfig,
  CommandsConfig,
} from "./types"

export { DEFAULT_RULES_CONFIG, DEFAULT_COMMANDS_CONFIG } from "./types"

// Matcher
export {
  matchGlob,
  matchTrigger,
  matchRule,
  matchRules,
  getAlwaysLoadRules,
  extractFilePaths,
  buildMatchContext,
} from "./matcher"

// Loader
export {
  loadRulesIndex,
  generateDefaultIndex,
  loadRule,
  loadRules,
  loadAlwaysRules,
  loadMatchedRules,
  RulesLoader,
  buildRulesPrompt,
} from "./loader"

// Commands
export {
  parseJustfile,
  parseMakefile,
  parsePackageScripts,
  detectPackageManager,
  scanScriptsDir,
  discoverCommands,
  CommandsDiscovery,
  buildCommandsPrompt,
} from "./commands"
