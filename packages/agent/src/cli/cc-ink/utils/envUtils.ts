/** Stub: utils/envUtils */
export function isEnvTruthy(key: string): boolean {
  const val = process.env[key]
  return val === "1" || val === "true"
}

export function getClaudeConfigHomeDir(): string {
  return ""
}
