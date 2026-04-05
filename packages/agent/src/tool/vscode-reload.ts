/**
 * vscode_reload 工具 - 编译并重载 VSCode Extension
 *
 * 在 Agent 修改 VSCode 扩展代码后，执行编译并通知前端重载。
 * 支持自我迭代：编译错误会完整返回给 LLM 供修复。
 */

import { z } from "zod"
import { Tool } from "./tool"
import { execSync } from "child_process"

const DESCRIPTION = `Build the VSCode extension and trigger automatic reload. Use this after modifying TypeScript/JavaScript/CSS files in the extension codebase.

This tool will:
1. Run the build command (npm run build) in the specified package directory
2. Optionally run type checking (tsc --noEmit)
3. Return build output including any errors for you to fix
4. Write a .reload-signal file that auto-reloads the VSCode window (no user confirmation needed)

After reload completes, use webview_snapshot(mode="compare") to verify UI changes.
If the build fails, analyze the errors and fix the code, then call this tool again.`

export const VSCodeReloadTool = Tool.define({
  id: "vscode_reload",
  description: DESCRIPTION,
  isConcurrencySafe: false,

  parameters: z.object({
    packageDir: z.string().describe("Absolute path to the package directory to build (e.g., /path/to/packages/vscode)"),
    typeCheck: z.boolean().optional().describe("Also run tsc --noEmit for full type checking (default: false)"),
  }),

  async execute(params, _ctx) {
    const { packageDir, typeCheck } = params
    const results: string[] = []
    let hasError = false

    // Step 1: Run build
    try {
      const buildOutput = execSync("npm run build 2>&1", {
        cwd: packageDir,
        timeout: 60000,
        encoding: "utf-8",
        env: { ...process.env, FORCE_COLOR: "0" },
      })
      results.push("✅ Build succeeded:\n" + buildOutput.trim())
    } catch (err: unknown) {
      hasError = true
      const execErr = err as { stdout?: string; stderr?: string; message?: string }
      const output = execErr.stdout || execErr.stderr || execErr.message || "Unknown build error"
      results.push("❌ Build FAILED:\n" + output)
    }

    // Step 2: Optional type checking
    if (typeCheck && !hasError) {
      try {
        const tscOutput = execSync("npx tsc --noEmit 2>&1", {
          cwd: packageDir,
          timeout: 60000,
          encoding: "utf-8",
          env: { ...process.env, FORCE_COLOR: "0" },
        })
        results.push("✅ Type check passed" + (tscOutput.trim() ? ":\n" + tscOutput.trim() : ""))
      } catch (err: unknown) {
        hasError = true
        const execErr = err as { stdout?: string; stderr?: string; message?: string }
        const output = execErr.stdout || execErr.stderr || execErr.message || "Unknown type check error"
        results.push("❌ Type check FAILED:\n" + output)
      }
    }

    // Step 3: Signal reload via marker file
    // The VSCode extension watches for this file and triggers reload
    if (!hasError) {
      try {
        const markerPath = require("path").join(packageDir, ".reload-signal")
        require("fs").writeFileSync(markerPath, Date.now().toString())
        results.push("🔄 Reload signal sent")
      } catch {
        results.push("⚠️ Could not write reload signal (non-critical)")
      }
    }

    return {
      title: hasError ? "Build failed — fix errors and retry" : "Build & reload succeeded",
      output: results.join("\n\n"),
      isError: hasError,
    }
  },
})
