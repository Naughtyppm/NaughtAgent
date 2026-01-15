import { Tool } from "./tool"

/**
 * 工具注册表
 */
export namespace ToolRegistry {
  const tools = new Map<string, Tool.Definition>()

  /**
   * 注册工具
   */
  export function register<T>(tool: Tool.Definition<T>): void {
    tools.set(tool.id, tool as Tool.Definition)
  }

  /**
   * 获取工具
   */
  export function get(id: string): Tool.Definition | undefined {
    return tools.get(id)
  }

  /**
   * 获取所有工具
   */
  export function list(): Tool.Definition[] {
    return Array.from(tools.values())
  }

  /**
   * 获取所有工具 ID
   */
  export function ids(): string[] {
    return Array.from(tools.keys())
  }

  /**
   * 执行工具
   */
  export async function execute(
    id: string,
    params: unknown,
    ctx: Tool.Context
  ): Promise<Tool.Result> {
    const tool = get(id)
    if (!tool) {
      throw new Error(`Tool not found: ${id}`)
    }
    return tool.execute(params, ctx)
  }

  /**
   * 清空注册表（用于测试）
   */
  export function clear(): void {
    tools.clear()
  }
}
