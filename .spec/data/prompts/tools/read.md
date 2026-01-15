# Tool: Read

> 来源: OpenCode `packages/opencode/src/tool/read.ts` + `read.txt`
> 许可证: MIT

## Description

Reads a file from the local filesystem. You can access any file directly by using this tool.
Assume this tool is able to read all files on the machine. If the User provides a path to a file assume that path is valid. It is okay to read a file that does not exist; an error will be returned.

Usage:
- The filePath parameter must be an absolute path, not a relative path
- By default, it reads up to 2000 lines starting from the beginning of the file
- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters
- Any lines longer than 2000 characters will be truncated
- Results are returned using cat -n format, with line numbers starting at 1
- You have the capability to call multiple tools in a single response. It is always better to speculatively read multiple files as a batch that are potentially useful.
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents.
- You can read image files using this tool.

## Parameters

| 参数 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| filePath | string | 是 | The path to the file to read |
| offset | number | 否 | The line number to start reading from (0-based) |
| limit | number | 否 | The number of lines to read (defaults to 2000) |

## 实现要点

- 默认读取限制: 2000 行
- 单行最大长度: 2000 字符（超出截断）
- 最大字节数: 50KB
- 支持图片和 PDF 文件（返回 base64）
- 自动检测二进制文件并拒绝读取
- 输出格式: `00001| <line content>`

## 权限

- 权限类型: `read`
- 默认: `allow`
- `.env` 文件: `ask`
