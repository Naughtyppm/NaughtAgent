# Tool: Write

> 来源: OpenCode `packages/opencode/src/tool/write.ts` + `write.txt`
> 许可证: MIT

## Description

Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.

## Parameters

| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| filePath | string | 是 | The absolute path to the file to write |
| content | string | 是 | The content to write to the file |

## 实现要点

- 写入前必须先读取文件（防止覆盖未知内容）
- 优先使用 Edit 工具编辑现有文件
- 创建新文件需要用户确认

## 权限

- 权限类型: `edit`
- 默认: `ask`（需要用户确认）
