/**
 * Agent 系统核心定义
 *
 * Agent 是 LLM + Tool 的执行单元，负责：
 * 1. 接收用户输入
 * 2. 调用 LLM 生成响应
 * 3. 执行工具调用
 * 4. 返回结果给用户
 */

import type { Tool } from "../tool/tool"
import type { ModelConfig } from "../provider"
import type { AgentType, TokenUsage } from "../session/session"

// 重新导出 Session 中的类型
export type { AgentType, TokenUsage } from "../session/session"

/**
 * Agent 模式
 * - primary: 主 Agent，可以启动子 Agent
 * - subagent: 子 Agent，不能启动其他 Agent
 */
export type AgentMode = "primary" | "subagent"

/**
 * Agent 事件（流式输出）
 */
export type AgentEvent =
  | { type: "text"; content: string }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_end"; id: string; result: Tool.Result; isError?: boolean }
  | { type: "error"; error: Error }
  | { type: "done"; usage: TokenUsage }

/**
 * Agent 定义
 */
export interface AgentDefinition {
  /** Agent 类型标识 */
  type: AgentType
  /** Agent 模式 */
  mode: AgentMode
  /** 显示名称 */
  name: string
  /** Agent 描述 */
  description: string
  /** 系统提示词 */
  systemPrompt: string
  /** 可用工具 ID 列表 */
  tools: string[]
  /** 模型配置（可选，覆盖默认） */
  model?: ModelConfig
  /** 温度参数 */
  temperature?: number
  /** 最大步数限制 */
  maxSteps?: number
}

/**
 * Agent 运行时配置
 */
export interface AgentRunConfig {
  /** 会话 ID */
  sessionId: string
  /** 工作目录 */
  cwd: string
  /** 取消信号 */
  abort?: AbortSignal
}

/**
 * 内置 Agent 定义
 */
export const BUILTIN_AGENTS: Record<AgentType, AgentDefinition> = {
  build: {
    type: "build",
    mode: "primary",
    name: "Build",
    description: "默认全功能 Agent，可编辑文件、执行命令",
    systemPrompt: "", // 将在 prompt.ts 中定义
    tools: ["read", "write", "edit", "bash", "glob", "grep"],
    maxSteps: 100,
  },
  plan: {
    type: "plan",
    mode: "primary",
    name: "Plan",
    description: "规划分析 Agent，可读取代码并保存计划，不执行命令",
    systemPrompt: "",
    tools: ["read", "write", "glob", "grep"],  // 允许写入计划文件
    maxSteps: 50,
  },
  explore: {
    type: "explore",
    mode: "subagent",
    name: "Explore",
    description: "快速代码探索 Agent，用于搜索和分析代码",
    systemPrompt: "",
    tools: ["read", "glob", "grep"],
    maxSteps: 20,
  },
}

/**
 * 获取 Agent 定义
 */
export function getAgentDefinition(type: AgentType): AgentDefinition {
  const definition = BUILTIN_AGENTS[type]
  if (!definition) {
    throw new Error(`Unknown agent type: ${type}`)
  }
  return { ...definition }
}

/**
 * 列出所有可用 Agent
 */
export function listAgents(mode?: AgentMode): AgentDefinition[] {
  const agents = Object.values(BUILTIN_AGENTS)
  if (mode) {
    return agents.filter((a) => a.mode === mode)
  }
  return agents
}
