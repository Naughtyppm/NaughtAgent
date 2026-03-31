# 任务：验证并修复 NAUGHTY.md 运行时自动加载 ✅ 已完成

> **结论**：链路完整，无断裂。NAUGHTY.md 内容从文件到 LLM system prompt 路径畅通。
>
> **完整路径**：runner.ts(cwd) → loop.ts:93 buildSystemPrompt → prompt.ts:170 createPromptManager(cwd) → prompt-manager.ts loadInstructions() → 读取全局+项目 NAUGHTY.md → 注入 system prompt → provider.chat()
>
> **P3 优化点**：PromptManager 每轮 run() 都 new 一个，缓存无效。可提升到 loop 级别复用。

## 背景

NaughtAgent 目前有 `PromptManager` 机制（`agent/prompt-manager.ts`）读取项目级和全局级的 `NAUGHTY.md`，将其注入到 LLM 的 system prompt 中。这等同于 Claude Code 自动加载 `CLAUDE.md` 的机制。

但是，**我们不确定这个机制是否在当前的 runner.ts 重构后仍然正确接入**。

## 目标

1. 验证 `PromptManager` 在 `buildSystemPrompt()` 中是否被正确调用
2. 验证 runner.ts → loop.ts → prompt.ts 的完整调用链中，NAUGHTY.md 内容是否真的会出现在 system prompt 里
3. 如果有断裂，修复它
4. 修改后运行 `npx tsc --noEmit` 确认零 typecheck 错误

## 相关文件

- `packages/agent/src/agent/prompt-manager.ts` — PromptManager 类，读取 NAUGHTY.md
- `packages/agent/src/agent/prompt.ts` — `buildSystemPrompt()`，构建 system prompt
- `packages/agent/src/agent/loop.ts` — Agent 主循环，调用 buildSystemPrompt
- `packages/agent/src/cli/runner.ts` — 创建 AgentLoop 的入口

## 验证步骤

1. 读取 `prompt-manager.ts`，理解 PromptManager 如何加载 NAUGHTY.md
2. 读取 `prompt.ts` 的 `buildSystemPrompt()`，确认它是否调用了 PromptManager
3. 读取 `loop.ts`，确认 buildSystemPrompt 在哪里被调用，以及 cwd 参数是否正确传入
4. 如果发现断裂（比如 PromptManager 没被实例化、cwd 没传、或结果没被使用），修复它
5. 运行 `npx tsc --noEmit` 验证

## 成功标准

- typecheck 零错误
- 能明确说出 NAUGHTY.md 内容从文件到 LLM system prompt 的完整路径
- 如果有修复，列出具体改了什么
