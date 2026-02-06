/**
 * 子 Agent 事件系统
 *
 * 定义子 Agent 执行过程中的事件类型，用于向 UI 传递状态
 * 支持所有子 Agent 模式：run_agent, fork_agent, parallel_agents, multi_agent, run_workflow, ask_llm
 */

/**
 * 子 Agent 模式类型
 */
export type SubAgentMode = 
  | "run_agent" 
  | "fork_agent" 
  | "parallel_agents" 
  | "multi_agent" 
  | "run_workflow" 
  | "ask_llm"

/**
 * 子 Agent 事件类型
 */
export type SubAgentEventType =
  | "start"
  | "text"
  | "tool_start"
  | "tool_end"
  | "step"
  | "thinking"
  | "end"
  // 并行/多 Agent 特有事件
  | "child_start"
  | "child_end"
  // 增强事件
  | "config"
  | "retry"

/**
 * 子 Agent 开始事件
 */
export interface SubAgentStartEvent {
  type: "start"
  id: string
  mode: SubAgentMode
  prompt: string
  agentType: string
  maxSteps: number
}

/**
 * 子 Agent 文本输出事件
 */
export interface SubAgentTextEvent {
  type: "text"
  id: string
  content: string
  delta?: string
}

/**
 * 子 Agent 工具开始事件
 */
export interface SubAgentToolStartEvent {
  type: "tool_start"
  id: string
  toolId: string
  name: string
  input: unknown
}

/**
 * 子 Agent 工具结束事件
 */
export interface SubAgentToolEndEvent {
  type: "tool_end"
  id: string
  toolId: string
  output: string
  isError: boolean
  duration: number
}

/**
 * 子 Agent 步骤进度事件
 */
export interface SubAgentStepEvent {
  type: "step"
  id: string
  current: number
  total: number
}

/**
 * 子 Agent 思考状态事件
 */
export interface SubAgentThinkingEvent {
  type: "thinking"
  id: string
  message: string
}

/**
 * 子 Agent 结束事件
 */
export interface SubAgentEndEvent {
  type: "end"
  id: string
  success: boolean
  output: string
  error?: string
  usage?: {
    inputTokens: number
    outputTokens: number
  }
  duration: number
}

/**
 * 子 Agent 子任务开始事件（用于 parallel_agents, multi_agent）
 */
export interface SubAgentChildStartEvent {
  type: "child_start"
  id: string
  childId: string
  childName: string
  prompt: string
}

/**
 * 子 Agent 子任务结束事件（用于 parallel_agents, multi_agent）
 */
export interface SubAgentChildEndEvent {
  type: "child_end"
  id: string
  childId: string
  childName: string
  success: boolean
  output: string
  error?: string
}

/**
 * 子 Agent 配置变更事件
 * @see Requirements 6.1, 6.4
 */
export interface SubAgentConfigEvent {
  type: "config"
  id: string
  config: {
    maxTurns?: number
    timeout?: number
    tools?: string[]
    agentType?: string
  }
}

/**
 * 子 Agent 重试事件
 * @see Requirements 6.2
 */
export interface SubAgentRetryEvent {
  type: "retry"
  id: string
  attempt: number
  maxAttempts: number
  error: string
  delay: number
}

/**
 * 子 Agent 事件联合类型
 */
export type SubAgentEvent =
  | SubAgentStartEvent
  | SubAgentTextEvent
  | SubAgentToolStartEvent
  | SubAgentToolEndEvent
  | SubAgentStepEvent
  | SubAgentThinkingEvent
  | SubAgentEndEvent
  | SubAgentChildStartEvent
  | SubAgentChildEndEvent
  | SubAgentConfigEvent
  | SubAgentRetryEvent

/**
 * 子 Agent 事件监听器
 */
export type SubAgentEventListener = (event: SubAgentEvent) => void

/**
 * 生成唯一的子 Agent ID
 */
export function generateSubAgentId(): string {
  return `sa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 创建子 Agent 事件发射器选项
 */
export interface CreateSubAgentEmitterOptions {
  /** 实例级事件监听器（per-instance，与全局监听器并存） */
  instanceListener?: SubAgentEventListener
}

/**
 * 向所有监听器广播事件
 * 同时调用全局监听器和实例级监听器
 */
function broadcastEvent(
  event: SubAgentEvent,
  listener: SubAgentEventListener | undefined,
  instanceListener: SubAgentEventListener | undefined
) {
  listener?.(event)
  instanceListener?.(event)
}

/**
 * 创建子 Agent 事件发射器
 *
 * 支持全局监听器和实例级监听器（Requirements 6.7）
 * - listener: 全局监听器，通常由 UI 层通过 setGlobalSubAgentEventListener 设置
 * - options.instanceListener: 实例级监听器，per-instance 事件监听
 * 两个监听器会同时被调用，互不影响
 */
export function createSubAgentEmitter(
  id: string,
  listener: SubAgentEventListener | undefined,
  mode: SubAgentMode = "run_agent",
  options?: CreateSubAgentEmitterOptions
) {
  const instanceListener = options?.instanceListener
  return {
    start(prompt: string, agentType: string, maxSteps: number) {
      broadcastEvent({ type: "start", id, mode, prompt, agentType, maxSteps }, listener, instanceListener)
    },
    text(content: string, delta?: string) {
      broadcastEvent({ type: "text", id, content, delta }, listener, instanceListener)
    },
    toolStart(toolId: string, name: string, input: unknown) {
      broadcastEvent({ type: "tool_start", id, toolId, name, input }, listener, instanceListener)
    },
    toolEnd(toolId: string, output: string, isError: boolean, duration: number) {
      broadcastEvent({ type: "tool_end", id, toolId, output, isError, duration }, listener, instanceListener)
    },
    step(current: number, total: number) {
      broadcastEvent({ type: "step", id, current, total }, listener, instanceListener)
    },
    thinking(message: string) {
      broadcastEvent({ type: "thinking", id, message }, listener, instanceListener)
    },
    end(success: boolean, output: string, duration: number, error?: string, usage?: { inputTokens: number; outputTokens: number }) {
      broadcastEvent({ type: "end", id, success, output, error, usage, duration }, listener, instanceListener)
    },
    // 子任务事件（用于 parallel_agents, multi_agent）
    childStart(childId: string, childName: string, prompt: string) {
      broadcastEvent({ type: "child_start", id, childId, childName, prompt }, listener, instanceListener)
    },
    childEnd(childId: string, childName: string, success: boolean, output: string, error?: string) {
      broadcastEvent({ type: "child_end", id, childId, childName, success, output, error }, listener, instanceListener)
    },
    // 配置事件
    config(config: SubAgentConfigEvent["config"]) {
      broadcastEvent({ type: "config", id, config }, listener, instanceListener)
    },
    // 重试事件
    retry(attempt: number, maxAttempts: number, error: string, delay: number) {
      broadcastEvent({ type: "retry", id, attempt, maxAttempts, error, delay }, listener, instanceListener)
    },
  }
}

export type SubAgentEmitter = ReturnType<typeof createSubAgentEmitter>
