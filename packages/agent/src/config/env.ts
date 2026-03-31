/**
 * 统一环境变量读取
 *
 * 替代 34 处散落的 process.env 直接访问。
 * 所有环境变量的读取都通过 getEnvConfig() 进行，可缓存、可 reload。
 */

export interface EnvConfig {
  // LLM Provider
  anthropicApiKey: string | undefined
  anthropicBaseUrl: string | undefined
  openaiApiKey: string | undefined
  openaiBaseUrl: string | undefined

  // Proxy
  httpsProxy: string | undefined
  httpProxy: string | undefined

  // Runtime
  debug: boolean
  ci: boolean
  legacyRepl: boolean
  shell: string | undefined

  // Kiro
  kiroDebug: boolean
}

let _cache: EnvConfig | null = null

/**
 * 获取环境配置（带缓存）
 * @param reload 强制重新读取 process.env
 */
export function getEnvConfig(reload = false): EnvConfig {
  if (_cache && !reload) return _cache

  _cache = {
    // LLM Provider
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || undefined,
    openaiApiKey: process.env.OPENAI_API_KEY || undefined,
    openaiBaseUrl: process.env.OPENAI_BASE_URL || undefined,

    // Proxy
    httpsProxy:
      process.env.HTTPS_PROXY || process.env.https_proxy || undefined,
    httpProxy: process.env.HTTP_PROXY || process.env.http_proxy || undefined,

    // Runtime
    debug: process.env.DEBUG === "1" || process.env.DEBUG === "true",
    ci: !!process.env.CI,
    legacyRepl: process.env.NAUGHTY_LEGACY_REPL === "1",
    shell: process.env.SHELL || undefined,

    // Kiro
    kiroDebug: process.env.KIRO_DEBUG === "1",
  }

  return _cache
}

/**
 * 清除缓存（测试用）
 */
export function resetEnvConfig(): void {
  _cache = null
}
