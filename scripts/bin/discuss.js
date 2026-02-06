#!/usr/bin/env node

/**
 * 全局命令入口 - discuss
 * 
 * 用法：
 *   discuss "你的讨论主题"
 *   discuss "主题" --task "讨论完要做的事"
 *   discuss --config path/to/config.json
 *   discuss "主题" --agents "架构师:关注设计,批评者:找问题"
 *   discuss "主题" --rounds 5
 *   discuss "主题" --model claude-opus-4-20250514
 *   discuss "主题" --output result.md
 */

import { execFileSync } from "child_process"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const scriptPath = join(__dirname, "..", "multi-agent-discuss.ts")

// 透传所有参数给 tsx
const args = process.argv.slice(2)

try {
  execFileSync("npx", ["tsx", scriptPath, ...args], {
    stdio: "inherit",
    env: process.env,
    shell: true,
  })
} catch (e) {
  process.exit(e.status || 1)
}
