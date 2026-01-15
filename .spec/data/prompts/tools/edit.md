# Tool: Edit

> 来源: OpenCode `packages/opencode/src/tool/edit.ts` + `edit.txt`
> 许可证: MIT

## Description

Performs exact string replacements in files.

Usage:
- You must use your `Read` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: spaces + line number + tab. Everything after that tab is the actual file content to match. Never include any part of the line number prefix in the oldString or newString.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if `oldString` is not found in the file with an error "oldString not found in content".
- The edit will FAIL if `oldString` is found multiple times in the file with an error "oldString found multiple times and requires more code context to uniquely identify the intended match". Either provide a larger string with more surrounding context to make it unique or use `replaceAll` to change every instance of `oldString`.
- Use `replaceAll` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.

## Parameters

| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| filePath | string | 是 | The absolute path to the file to modify |
| oldString | string | 是 | The text to replace |
| newString | string | 是 | The text to replace it with (must be different from oldString) |
| replaceAll | boolean | 否 | Replace all occurrences of oldString (default false) |

## 实现要点

### 智能匹配策略

Edit 工具使用多种 Replacer 策略来容错匹配：

1. **SimpleReplacer** - 精确匹配
2. **LineTrimmedReplacer** - 忽略行首尾空白
3. **BlockAnchorReplacer** - 基于首尾行锚点匹配（使用 Levenshtein 距离）
4. **WhitespaceNormalizedReplacer** - 空白字符归一化
5. **IndentationFlexibleReplacer** - 忽略缩进差异
6. **EscapeNormalizedReplacer** - 处理转义字符
7. **TrimmedBoundaryReplacer** - 边界空白容错
8. **ContextAwareReplacer** - 上下文感知匹配
9. **MultiOccurrenceReplacer** - 多次出现处理

### 错误处理

- `oldString not found in content` - 未找到匹配
- `Found multiple matches` - 找到多个匹配，需要更多上下文

### LSP 集成

编辑后自动触发 LSP 诊断，返回文件中的错误信息。

## 权限

- 权限类型: `edit`
- 默认: `ask`（需要用户确认 diff）
