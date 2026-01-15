/**
 * Context 模块导出
 */

export {
  // Types
  type RuleFile,
  type RuleSet,
  type TechStack,
  type ProjectStructure,
  type GitCommit,
  type GitContext,
  type AgentConfig,
  type Context,
  // Functions
  loadRules,
  mergeRulesToPrompt,
  loadProjectStructure,
  loadGitContext,
  loadConfig,
  loadContext,
  buildContextPrompt,
} from "./context"
