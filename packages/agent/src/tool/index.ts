/**
 * Tool 工具系统
 *
 * 提供 Agent 与文件系统、命令行交互的能力
 */

// 核心定义
export { Tool } from "./tool"
export { ToolRegistry } from "./registry"

// 内置工具
export { ReadTool } from "./read"
export { WriteTool } from "./write"
export { EditTool } from "./edit"
export { BashTool } from "./bash"
export { GlobTool } from "./glob"
export { GrepTool } from "./grep"

// 注册所有内置工具
import { ToolRegistry } from "./registry"
import { ReadTool } from "./read"
import { WriteTool } from "./write"
import { EditTool } from "./edit"
import { BashTool } from "./bash"
import { GlobTool } from "./glob"
import { GrepTool } from "./grep"

export function registerBuiltinTools(): void {
  ToolRegistry.register(ReadTool)
  ToolRegistry.register(WriteTool)
  ToolRegistry.register(EditTool)
  ToolRegistry.register(BashTool)
  ToolRegistry.register(GlobTool)
  ToolRegistry.register(GrepTool)
}
