/**
 * /alias 命令 - 管理命令别名
 *
 * 支持添加、删除、列出别名
 *
 * @example
 * /alias                    - 列出所有别名
 * /alias add ll /list -l    - 添加别名
 * /alias remove ll          - 删除别名
 * /alias list               - 列出所有别名
 */

import type { BuiltinCommandDefinition } from "./types.js"
import type { ExecutionResult } from "../types.js"
import { createAliasManager } from "../alias.js"

/**
 * 格式化别名列表
 */
function formatAliasList(
  aliases: Array<{ name: string; command: string; description?: string }>
): string {
  if (aliases.length === 0) {
    return "没有定义任何别名\n\n使用 /alias add <name> <command> 添加别名"
  }

  const lines: string[] = ["命令别名列表", "─".repeat(40)]

  for (const alias of aliases) {
    lines.push(`  ${alias.name} → ${alias.command}`)
    if (alias.description) {
      lines.push(`    ${alias.description}`)
    }
  }

  lines.push("")
  lines.push("使用 /alias add <name> <command> 添加别名")
  lines.push("使用 /alias remove <name> 删除别名")

  return lines.join("\n")
}

/**
 * /alias 命令定义
 */
export const aliasCommand: BuiltinCommandDefinition = {
  name: "alias",
  description: "管理命令别名（add/remove/list）",
  aliases: [],
  parameters: [
    {
      name: "action",
      description: "操作类型: add, remove, list",
      required: false,
    },
    {
      name: "name",
      description: "别名名称",
      required: false,
    },
    {
      name: "command",
      description: "目标命令（add 时需要）",
      required: false,
    },
  ],
  handler: async (args, _namedArgs, _context): Promise<ExecutionResult> => {
    const startTime = Date.now()
    const manager = createAliasManager()

    // 无参数或 list：列出所有别名
    if (args.length === 0 || args[0] === "list") {
      const aliases = await manager.getAll()
      return {
        success: true,
        output: formatAliasList(aliases),
        duration: Date.now() - startTime,
        layer: "builtin",
      }
    }

    const action = args[0]

    // add 操作
    if (action === "add") {
      if (args.length < 3) {
        return {
          success: false,
          output: "",
          error: "用法: /alias add <name> <command>\n例如: /alias add ll /list -l",
          duration: Date.now() - startTime,
          layer: "builtin",
        }
      }

      const name = args[1]
      const command = args.slice(2).join(" ")

      // 检查冲突
      if (manager.hasConflict(name)) {
        return {
          success: false,
          output: "",
          error: `别名 "${name}" 与内置命令冲突`,
          duration: Date.now() - startTime,
          layer: "builtin",
        }
      }

      const success = await manager.add(name, command)

      if (success) {
        return {
          success: true,
          output: `已添加别名: ${name} → ${command}`,
          duration: Date.now() - startTime,
          layer: "builtin",
        }
      } else {
        return {
          success: false,
          output: "",
          error: `添加别名失败: ${name}`,
          duration: Date.now() - startTime,
          layer: "builtin",
        }
      }
    }

    // remove 操作
    if (action === "remove") {
      if (args.length < 2) {
        return {
          success: false,
          output: "",
          error: "用法: /alias remove <name>",
          duration: Date.now() - startTime,
          layer: "builtin",
        }
      }

      const name = args[1]
      const success = await manager.remove(name)

      if (success) {
        return {
          success: true,
          output: `已删除别名: ${name}`,
          duration: Date.now() - startTime,
          layer: "builtin",
        }
      } else {
        return {
          success: false,
          output: "",
          error: `别名不存在: ${name}`,
          duration: Date.now() - startTime,
          layer: "builtin",
        }
      }
    }

    // 未知操作
    return {
      success: false,
      output: "",
      error: `未知操作: ${action}\n可用操作: add, remove, list`,
      duration: Date.now() - startTime,
      layer: "builtin",
    }
  },
}
