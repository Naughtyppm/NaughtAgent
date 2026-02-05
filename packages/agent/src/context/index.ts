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

export {
  // Types
  type HashCalculatorConfig,
  type HashCalculator,
  // Functions
  createHashCalculator,
  // Constants
  DEFAULT_KEY_FILES,
  DEFAULT_EXCLUDE_PATTERNS,
} from "./hash-calculator"

export {
  // Types
  type TokenCompressionConfig,
  type OutputTruncationConfig,
  type ContentCacheOptConfig,
  type ContextInjectionOptConfig,
  type IndexCacheOptConfig,
  type OptimizationConfig,
  type OptimizationConfigManager,
  // Functions
  createOptimizationConfigManager,
  isValidCompressionStrategy,
  isValidOptimizationConfig,
  // Constants
  DEFAULT_OPTIMIZATION_CONFIG,
} from "./optimization-config"

export {
  // Types
  type ProjectIndex,
  type IndexCacheConfig,
  type IndexCache,
  // Functions
  createIndexCache,
  createDefaultIndexCache,
  isValidProjectIndex,
  // Constants
  INDEX_VERSION,
  DEFAULT_TTL,
  DEFAULT_CACHE_DIR,
  DEFAULT_CACHE_FILE,
} from "./index-cache"

export {
  // Types
  type ContextInjectorConfig,
  type ContextInjector,
  type IndexProvider,
  // Functions
  createContextInjector,
  // Constants
  DEFAULT_CONTEXT_INJECTOR_CONFIG,
  CHARS_PER_TOKEN,
  PROJECT_CONTEXT_TAG_OPEN,
  PROJECT_CONTEXT_TAG_CLOSE,
} from "./context-injector"

export {
  // Types
  type TokenCompressorConfig,
  type CompressionResult,
  type TokenCompressor,
  // Functions
  createTokenCompressor,
  // Re-exports from subtask/context
  SimpleTokenCounter,
  evaluateMessageImportance,
  // Constants
  DEFAULT_TOKEN_COMPRESSOR_CONFIG,
} from "./token-compressor"

export {
  // Types
  type CacheEntry,
  type ContentCache,
  type CacheStats,
  // Functions
  createContentCache,
  isHashReference,
  extractHashFromReference,
} from "./content-cache"
