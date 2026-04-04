/** Stub: utils/env — 精简环境检测 */

function detectTerminal(): string | undefined {
  const tp = process.env.TERM_PROGRAM
  if (tp === "vscode") return "vscode"
  if (tp === "iTerm.app") return "iterm"
  if (tp === "ghostty") return "ghostty"
  if (process.env.KITTY_WINDOW_ID) return "kitty"
  if (process.env.WT_SESSION) return "windows-terminal"
  if (process.env.TMUX) return "tmux"
  return tp || undefined
}

export const env = {
  terminal: detectTerminal(),
}
