import { z } from "zod"

/**
 * Tool 工具系统核心定义
 */
export namespace Tool {
  /**
   * 工具执行上下文
   */
  export interface Context {
    /** 会话 ID */
    sessionID: string
    /** 当前工作目录 */
    cwd: string
    /** 取消信号 */
    abort: AbortSignal
  }

  /**
   * 工具执行结果
   */
  export interface Result {
    /** 显示标题 */
    title: string
    /** 主要输出内容 */
    output: string
    /** 元数据（可选） */
    metadata?: Record<string, unknown>
  }

  /**
   * 工具定义
   */
  export interface Definition<TParams = unknown> {
    /** 工具 ID */
    id: string
    /** 工具描述（给 LLM 看） */
    description: string
    /** 参数 Schema */
    parameters: z.ZodType<TParams>
    /** 执行函数 */
    execute(params: TParams, ctx: Context): Promise<Result>
  }

  /**
   * 定义一个工具
   */
  export function define<TParams>(
    definition: Definition<TParams>
  ): Definition<TParams> {
    return {
      ...definition,
      execute: async (params, ctx) => {
        // 参数验证
        const parsed = definition.parameters.parse(params)
        // 执行工具
        return definition.execute(parsed, ctx)
      },
    }
  }

  /**
   * 创建默认上下文
   */
  export function createContext(options: Partial<Context> = {}): Context {
    return {
      sessionID: options.sessionID ?? "default",
      cwd: options.cwd ?? process.cwd(),
      abort: options.abort ?? new AbortController().signal,
    }
  }
}
