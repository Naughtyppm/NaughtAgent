/**
 * 子代理工具群
 *
 * 提供 3 种核心子代理调用模式：
 * - ask_llm: 单次查询，无工具，简单问答
 * - run_agent: 自主代理，独立任务执行
 * - fork_agent: 分叉代理，保留完整上下文
 */

export { AskLlmTool } from "./ask-llm-tool"
export { RunAgentTool, setSubAgentEventListener, getSubAgentEventListener } from "./run-agent-tool"
export { ForkAgentTool } from "./fork-agent-tool"
export { TaskTool } from "../../subtask/task-tool"
export { ParallelAgentsTool } from "./parallel-agents-tool"
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
