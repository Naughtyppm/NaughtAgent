/**
 * 子代理工具群
 * 
 * 提供 7 种子代理调用模式：
 * - ask_llm: 单次查询，无工具，简单问答
 * - run_agent: 自主代理，独立任务执行
 * - run_workflow: 多阶段流程，结构化多轮对话
 * - fork_agent: 分叉代理，保留完整上下文
 * - parallel_agents: 并行执行，多视角分析
 * - multi_agent: 多代理协作，角色讨论
 * - handoff: 控制转移，multi_agent 内部使用
 */

export { AskLlmTool } from "./ask-llm-tool"
export { RunAgentTool, setSubAgentEventListener, getSubAgentEventListener } from "./run-agent-tool"
export { RunWorkflowTool } from "./run-workflow-tool"
export { ForkAgentTool } from "./fork-agent-tool"
export { ParallelAgentsTool } from "./parallel-agents-tool"
export { MultiAgentTool } from "./multi-agent-tool"
export { DispatchAgentTool, setDispatchAgentRuntime, setDispatchAgentProvider } from "./dispatch-agent-tool"
export { TaskTool } from "../../subtask/task-tool"
export {
  RequestShutdownTool,
  RespondShutdownTool,
  SubmitPlanTool,
  ReviewPlanTool,
  ListPendingPlansTool,
} from "./protocol-tools"
export {
  scanTasksTool,
  claimTaskTool,
  completeTaskTool,
  createTeamTaskTool,
  listTeamTasksTool,
} from "./autonomous-tools"
export {
  worktreeCreateTool,
  worktreeRunTool,
  worktreeCloseoutTool,
  worktreeListTool,
  worktreeStatusTool,
  worktreeEventsTool,
} from "./worktree-tools"

// 工具注册辅助
export { registerSubagentTools, updateParentContext, SUBAGENT_TOOL_IDS, type SubagentToolId } from "./register"
