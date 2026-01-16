/**
 * /commit Skill - 生成 commit 消息并提交
 *
 * 用法：
 * - /commit          自动生成 commit 消息
 * - /commit --all    先 git add -A 再提交
 * - /commit "msg"    使用指定消息
 */

import type { SkillDefinition } from "../types"
import type { WorkflowContext } from "../../subtask"

export const commitSkill: SkillDefinition = {
  name: "commit",
  description: "Generate commit message and commit staged changes",
  aliases: ["ci"],
  parameters: [
    {
      name: "message",
      description: "Override generated message",
      required: false,
    },
    {
      name: "all",
      description: "Stage all changes before commit",
      required: false,
      default: "false",
    },
  ],
  workflow: {
    name: "commit",
    description: "Generate and execute git commit",
    steps: [
      // 1. 可选：暂存所有变更
      {
        name: "stage-all",
        type: "condition",
        condition: {
          check: (ctx: WorkflowContext) => ctx.params.all === "true" || ctx.params.all === true,
          then: "do-stage-all",
          else: "get-diff",
        },
      },
      {
        name: "do-stage-all",
        type: "tool",
        tool: {
          name: "bash",
          params: { command: "git add -A" },
        },
        optional: true,
      },
      // 2. 获取 staged diff
      {
        name: "get-diff",
        type: "tool",
        tool: {
          name: "bash",
          params: { command: "git diff --staged" },
        },
      },
      // 3. 检查是否有变更
      {
        name: "check-empty",
        type: "condition",
        condition: {
          check: (ctx: WorkflowContext) => {
            const diff = ctx.results["get-diff"]
            return typeof diff === "string" && diff.trim() !== ""
          },
          then: "check-override",
          else: "no-changes",
        },
      },
      // 4. 检查是否有覆盖消息
      {
        name: "check-override",
        type: "condition",
        condition: {
          check: (ctx: WorkflowContext) => {
            const msg = ctx.params.message
            return typeof msg === "string" && msg.trim() !== ""
          },
          then: "use-override",
          else: "generate-message",
        },
      },
      // 5a. 使用覆盖消息
      {
        name: "use-override",
        type: "tool",
        tool: {
          name: "bash",
          params: (ctx: WorkflowContext) => ({
            command: `git commit -m "${String(ctx.params.message).replace(/"/g, '\\"')}"`,
          }),
        },
      },
      // 5b. 生成 commit 消息
      {
        name: "generate-message",
        type: "llm",
        llm: {
          systemPrompt: "You are a helpful assistant that generates concise git commit messages.",
          prompt: (ctx: WorkflowContext) => `Generate a git commit message for the following changes.

Use Conventional Commits format: <type>(<scope>): <description>

Types: feat, fix, docs, style, refactor, test, chore, perf, ci, build

Rules:
- Keep the description under 72 characters
- Use imperative mood ("add" not "added")
- Be specific but concise
- No period at the end

Diff:
${ctx.results["get-diff"]}

Output ONLY the commit message, nothing else.`,
          outputFormat: "text",
        },
      },
      // 6. 显示生成的消息并确认
      {
        name: "confirm",
        type: "tool",
        tool: {
          name: "question",
          params: (ctx: WorkflowContext) => ({
            type: "confirm",
            message: `Commit message:\n\n  ${ctx.results["generate-message"]}\n\nProceed with commit?`,
            default: true,
          }),
        },
      },
      // 7. 检查确认结果
      {
        name: "check-confirm",
        type: "condition",
        condition: {
          check: (ctx: WorkflowContext) => {
            const result = ctx.results["confirm"]
            if (typeof result === "object" && result !== null) {
              return (result as { value?: boolean }).value === true
            }
            return result === true
          },
          then: "do-commit",
          else: "cancelled",
        },
      },
      // 8. 执行 commit
      {
        name: "do-commit",
        type: "tool",
        tool: {
          name: "bash",
          params: (ctx: WorkflowContext) => {
            const message = String(ctx.results["generate-message"]).trim()
            return {
              command: `git commit -m "${message.replace(/"/g, '\\"')}"`,
            }
          },
        },
      },
      // 错误/取消处理
      {
        name: "no-changes",
        type: "llm",
        llm: {
          prompt: () => "No staged changes found. Use `git add <files>` to stage changes first, or use `/commit --all` to stage all changes.",
          outputFormat: "text",
        },
      },
      {
        name: "cancelled",
        type: "llm",
        llm: {
          prompt: () => "Commit cancelled.",
          outputFormat: "text",
        },
      },
    ],
  },
}
