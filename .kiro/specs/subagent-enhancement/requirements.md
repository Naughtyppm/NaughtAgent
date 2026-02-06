# Requirements Document

## Introduction

本文档定义了 NaughtyAgent 子 Agent 系统增强功能的需求。该功能旨在提升子 Agent 的可用性、可观测性和灵活性，参考 Claude Code 的 Task 模式，提供统一的子 Agent 调用接口，并支持自定义子 Agent 定义。

当前系统已有 6 种子 Agent 工具（ask_llm、run_agent、fork_agent、multi_agent、parallel_agents、run_workflow），并已实现基础的事件传递机制。本次增强将在此基础上进一步完善。

## Glossary

- **Task_Tool**: 统一的子 Agent 调用工具，参考 Claude Code 的 Task 模式，提供简化的接口
- **SubAgent_Event_System**: 子 Agent 事件系统，负责将子 Agent 执行状态传递给 UI
- **Custom_Agent**: 自定义子 Agent，通过 Markdown 文件定义的专用子 Agent
- **Agent_Registry**: Agent 注册表，管理内置和自定义子 Agent 的注册与查找
- **Abort_Signal_Chain**: 取消信号链，确保取消信号能够传递到所有嵌套的子 Agent
- **Concurrency_Controller**: 并发控制器，管理并行子 Agent 的并发数和资源分配
- **SubAgent_Panel**: 子 Agent 面板，UI 组件，显示子 Agent 执行状态

## Requirements

### Requirement 1: 统一 Task 工具接口

**User Story:** As a developer, I want a unified Task tool interface, so that I can easily delegate tasks to sub-agents without worrying about implementation details.

#### Acceptance Criteria

1. THE Task_Tool SHALL provide a simplified interface with parameters: description, type, and optional customAgent
2. WHEN a task is submitted, THE Task_Tool SHALL automatically select the appropriate sub-agent based on the type parameter
3. THE Task_Tool SHALL support four built-in types: explore (read-only), plan (read + planning), build (full access), and custom
4. WHEN type is "custom", THE Task_Tool SHALL load the sub-agent definition from the customAgent path
5. THE Task_Tool SHALL return a structured result containing success status, output, steps executed, and token usage

### Requirement 2: 自定义子 Agent 支持

**User Story:** As a power user, I want to define custom sub-agents via Markdown files, so that I can create specialized agents for specific tasks.

#### Acceptance Criteria

1. THE Agent_Registry SHALL scan the `.naughty/agents/` directory for custom agent definitions on startup
2. WHEN a Markdown file is found in `.naughty/agents/`, THE Agent_Registry SHALL parse its frontmatter for agent configuration
3. THE custom agent definition SHALL support the following frontmatter fields: name, description, tools, model, and permissionMode
4. THE custom agent definition SHALL use the Markdown body as the system prompt
5. WHEN a custom agent is requested, THE Agent_Registry SHALL return the parsed configuration or an error if not found
6. THE Agent_Registry SHALL validate that required fields (name, description) are present in the definition
7. WHEN a custom agent definition is invalid, THE Agent_Registry SHALL log a warning and skip the invalid definition

### Requirement 3: Abort 信号链完善

**User Story:** As a user, I want Ctrl+C to stop all running sub-agents, so that I can quickly cancel long-running operations.

#### Acceptance Criteria

1. WHEN the parent agent receives an abort signal, THE SubAgent_Event_System SHALL propagate the signal to all active sub-agents
2. WHEN a sub-agent receives an abort signal, THE sub-agent SHALL stop execution within 1 second
3. WHEN a sub-agent is aborted, THE sub-agent SHALL return partial results if available
4. THE Abort_Signal_Chain SHALL support nested sub-agents (sub-agent calling another sub-agent)
5. WHEN an abort signal is received during parallel execution, THE Concurrency_Controller SHALL cancel all pending and running tasks

### Requirement 4: 并行执行优化

**User Story:** As a developer, I want better control over parallel sub-agent execution, so that I can optimize resource usage and handle errors gracefully.

#### Acceptance Criteria

1. THE Concurrency_Controller SHALL limit the maximum number of concurrent sub-agents (default: 3, configurable)
2. WHEN a sub-agent fails during parallel execution, THE Concurrency_Controller SHALL continue executing other tasks unless failFast is enabled
3. THE Concurrency_Controller SHALL support a timeout parameter for individual sub-agent execution
4. WHEN a sub-agent times out, THE Concurrency_Controller SHALL abort the sub-agent and record the timeout error
5. THE parallel_agents tool SHALL report progress as each sub-agent completes

### Requirement 5: 状态可视化增强

**User Story:** As a user, I want to see detailed progress of sub-agent execution, so that I can understand what the system is doing.

#### Acceptance Criteria

1. THE SubAgent_Panel SHALL display the current step number and maximum steps for each active sub-agent
2. THE SubAgent_Panel SHALL display the most recent tool calls (up to 3) with their status
3. WHEN a sub-agent has child tasks (parallel_agents, multi_agent), THE SubAgent_Panel SHALL display child task status
4. THE StatusIndicator SHALL display a summary of all active sub-agents when multiple are running
5. THE SubAgent_Panel SHALL update in real-time as events are received (within 100ms)

### Requirement 6: 事件传递机制增强

**User Story:** As a developer, I want comprehensive event reporting from sub-agents, so that I can build better monitoring and debugging tools.

#### Acceptance Criteria

1. THE SubAgent_Event_System SHALL emit start events containing: id, mode, prompt, agentType, and maxSteps
2. THE SubAgent_Event_System SHALL emit text events for streaming output with delta support
3. THE SubAgent_Event_System SHALL emit tool_start and tool_end events with timing information
4. THE SubAgent_Event_System SHALL emit step events to track progress
5. THE SubAgent_Event_System SHALL emit end events containing: success, output, error, usage, and duration
6. WHEN a sub-agent spawns child tasks, THE SubAgent_Event_System SHALL emit child_start and child_end events
7. THE SubAgent_Event_System SHALL support event listeners at both global and per-instance levels

### Requirement 7: 错误处理优化

**User Story:** As a user, I want clear error messages and graceful degradation when sub-agents fail, so that I can understand and recover from failures.

#### Acceptance Criteria

1. WHEN a sub-agent encounters an error, THE sub-agent SHALL return a structured error with type, message, and context
2. WHEN a sub-agent fails, THE parent agent SHALL receive the error details and partial results
3. THE Task_Tool SHALL support automatic retry with configurable retry count and delay
4. WHEN all retries fail, THE Task_Tool SHALL return a comprehensive error report
5. IF a sub-agent times out, THEN THE Task_Tool SHALL include the timeout duration and last known state in the error

### Requirement 8: 配置管理

**User Story:** As a developer, I want to configure sub-agent behavior through a central configuration, so that I can customize the system for different use cases.

#### Acceptance Criteria

1. THE system SHALL support configuration via `.naughty/config.json` or environment variables
2. THE configuration SHALL include: default timeout, max concurrency, retry settings, and default model
3. WHEN configuration is not provided, THE system SHALL use sensible defaults
4. THE configuration SHALL be validated on load and report errors for invalid values
