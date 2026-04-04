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
import { DEFAULT_MAX_STEPS } from "../config"

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
  | { type: "text_delta"; delta: string }
  | { type: "thinking"; content: string }
  | { type: "thinking_end" }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_end"; id: string; result: Tool.Result; isError?: boolean }
  | { type: "error"; error: Error }
  | { type: "done"; usage: TokenUsage; stopReason?: string; writeOpCount?: number }
  | { type: "await_input" }

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
    tools: [
      // 基础工具
      "read", "write", "append", "edit", "bash", "glob", "grep",
      // 交互工具（s03: Todo Write / Question）
      "todo", "question",
      // 上下文压缩（s06: Layer 3 LLM 主动触发）
      "compact",
      // Skill 加载（s05: Layer 2 按需加载）
      "load_skill",
      // 持久记忆（跨会话记忆保存）
      "memory",
      // CC 对齐工具
      "web_fetch", "notebook_edit", "task_output", "task_stop",
      "enter_plan_mode", "exit_plan_mode",
      // MCP 资源工具
      "list_mcp_resources", "read_mcp_resource",
      // Cron 定时任务
      "cron_create", "cron_delete", "cron_list",
      // 子代理工具（核心 3 原语 + 统一入口）
      "ask_llm", "run_agent", "fork_agent", "task",
      // 团队协作工具（s10 Team Protocols）
      "request_shutdown", "respond_shutdown", "submit_plan", "review_plan", "list_pending_plans",
      // 自主任务工具（s11 Autonomous Agents）
      "scan_tasks", "claim_task", "complete_task", "create_team_task", "list_team_tasks",
      // Worktree 隔离工具（s12 Worktree Task Isolation）
      "worktree_create", "worktree_run", "worktree_closeout", "worktree_list", "worktree_status", "worktree_events",
    ],
    maxSteps: DEFAULT_MAX_STEPS,
  },
  plan: {
    type: "plan",
    mode: "primary",
    name: "Plan",
    description: "规划分析 Agent，可读取代码并保存计划，不执行命令",
    systemPrompt: "",
    tools: [
      "read", "write", "append", "glob", "grep",
      // 规划模式可用的子代理
      "ask_llm", "fork_agent",
    ],
    maxSteps: 50,
  },
  explore: {
    type: "explore",
    mode: "subagent",
    name: "Explore",
    description: "快速代码探索 Agent，用于搜索和分析代码",
    systemPrompt: "",
    tools: ["read", "glob", "grep", "ask_llm"],  // 探索模式只能用 ask_llm
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
