# Requirements Document

## Introduction

统一命令系统（Unified Command System）为 NaughtyAgent 提供一个分层式命令管理框架。该系统采用"统一入口，分层执行"的设计哲学，整合三个执行层：Builtin Layer（内置命令）、External Layer（justfile 命令）、Skill Layer（AI 工作流技能）。用户通过统一的 `/` 前缀访问所有命令，系统根据命令类型自动路由到对应执行器。

## Glossary

- **Unified_Registry**: 统一命令注册表，聚合三层命令，提供统一发现和搜索
- **Command_Router**: 输入路由器，解析用户输入并分类（命令 vs 自然语言）
- **Command_Dispatcher**: 命令调度器，根据命令层级分发到对应执行器
- **Builtin_Layer**: 内置命令层，同步执行，无副作用（/help, /clear, /model）
- **External_Layer**: 外部命令层，子进程执行，有副作用（justfile 命令）
- **Skill_Layer**: 技能层，AI Workflow 执行，需要推理（/commit, /pr, /review）
- **Error_Diagnostics**: 错误诊断模块，分析失败原因并提供修复建议
- **Completion_Provider**: 补全提供器，为 UI 提供命令补全建议

## Requirements

### Requirement 1: 统一命令注册表

**User Story:** As a user, I want a single command registry that shows all available commands, so that I can discover and use commands from any layer through one interface.

#### Acceptance Criteria

1. THE Unified_Registry SHALL aggregate commands from Builtin_Layer, External_Layer (justfile), and Skill_Layer
2. THE Unified_Registry SHALL provide a unified getAll() method returning all commands with layer information
3. THE Unified_Registry SHALL support filtering commands by layer (getBuiltin, getExternal, getSkills)
4. THE Unified_Registry SHALL support fuzzy search across all layers by name and description
5. WHEN multiple commands have the same name across layers, THE Unified_Registry SHALL apply priority: builtin > skill > external
6. THE Unified_Registry SHALL store command metadata: name, description, layer, source, parameters, and execution mode
7. THE Unified_Registry SHALL support dynamic reload when underlying sources change

### Requirement 2: 内置命令层 (Builtin Layer)

**User Story:** As a user, I want built-in commands that execute instantly without AI, so that I can perform common operations quickly.

#### Acceptance Criteria

1. THE Builtin_Layer SHALL provide commands: /help, /clear, /model, /mode, /history, /exit, /refresh, /config
2. WHEN /help is invoked, THE System SHALL display all commands grouped by layer with descriptions
3. WHEN /clear is invoked, THE System SHALL clear conversation history and return immediately
4. WHEN /model [name] is invoked, THE System SHALL switch to the specified model
5. WHEN /mode is invoked, THE System SHALL toggle between auto and manual permission modes
6. WHEN /history is invoked, THE System SHALL display recent command history
7. WHEN /exit is invoked, THE System SHALL terminate the application gracefully
8. WHEN /refresh is invoked, THE System SHALL reload all command sources
9. WHEN /config is invoked, THE System SHALL open or display configuration
10. ALL Builtin commands SHALL execute synchronously without spawning subprocesses
11. ALL Builtin commands SHALL be marked with layer='builtin' and executionMode='sync'

### Requirement 3: 外部命令层 (External Layer)

**User Story:** As a user, I want to execute justfile commands through the same interface, so that I can run project tasks without leaving the agent.

#### Acceptance Criteria

1. THE External_Layer SHALL integrate with existing justfile module (src/justfile/)
2. THE External_Layer SHALL load commands from global justfile (~/.naughtyagent/justfile)
3. THE External_Layer SHALL load commands from project justfile (./justfile)
4. WHEN project justfile has same command as global, THE External_Layer SHALL use project version
5. THE External_Layer SHALL execute commands via `just` CLI in subprocess
6. THE External_Layer SHALL capture stdout, stderr, and exit code
7. THE External_Layer SHALL support timeout configuration for long-running commands
8. ALL External commands SHALL be marked with layer='external' and executionMode='subprocess'

### Requirement 4: 技能层 (Skill Layer)

**User Story:** As a user, I want AI-powered skills that can perform complex tasks, so that I can automate workflows like commit, PR, and code review.

#### Acceptance Criteria

1. THE Skill_Layer SHALL integrate with existing skill module (src/skill/)
2. THE Skill_Layer SHALL load built-in skills: /commit, /pr, /review, /test
3. THE Skill_Layer SHALL support custom skills from ~/.naughtyagent/skills/ and .naughtyagent/skills/
4. WHEN a skill is invoked, THE System SHALL execute it through the AI workflow engine
5. THE Skill_Layer SHALL pass skill parameters to the workflow
6. THE Skill_Layer SHALL support skill-specific model override
7. THE Skill_Layer SHALL support context isolation (fork mode) for skills
8. THE Skill_Layer SHALL support tool restrictions per skill (allowedTools)
9. ALL Skill commands SHALL be marked with layer='skill' and executionMode='workflow'
10. Skills MAY be auto-invoked by AI when disableModelInvocation is false

### Requirement 5: 输入路由

**User Story:** As a user, I want the system to automatically understand my input type, so that commands are executed and natural language goes to AI.

#### Acceptance Criteria

1. WHEN input starts with '/', THE Command_Router SHALL treat it as a command
2. WHEN input does not start with '/', THE Command_Router SHALL pass it to AI as natural language
3. THE Command_Router SHALL parse command name and arguments from input
4. THE Command_Router SHALL support quoted arguments and named parameters (--key=value)
5. WHEN command is not found, THE Command_Router SHALL suggest similar commands
6. THE Command_Router SHALL return a structured RoutingResult with type and parsed data

### Requirement 6: 分层执行调度

**User Story:** As a developer, I want commands to be dispatched to the correct executor based on their layer, so that each command type is handled appropriately.

#### Acceptance Criteria

1. THE Command_Dispatcher SHALL route builtin commands to BuiltinExecutor
2. THE Command_Dispatcher SHALL route external commands to JustfileExecutor (existing)
3. THE Command_Dispatcher SHALL route skill commands to SkillExecutor (existing)
4. THE Command_Dispatcher SHALL return a unified ExecutionResult regardless of layer
5. THE Command_Dispatcher SHALL handle execution errors and pass to Error_Diagnostics
6. THE Command_Dispatcher SHALL track execution duration for all command types
7. THE Command_Dispatcher SHALL support cancellation via AbortSignal

### Requirement 7: 错误诊断与恢复

**User Story:** As a user, I want helpful error messages when commands fail, so that I can quickly understand and fix issues.

#### Acceptance Criteria

1. THE Error_Diagnostics SHALL categorize errors: not_found, permission_denied, timeout, dependency_missing, syntax_error, runtime_error, workflow_error
2. WHEN command is not found, THE Error_Diagnostics SHALL suggest similar commands (edit distance <= 3)
3. WHEN just is not installed, THE Error_Diagnostics SHALL provide installation instructions
4. WHEN skill workflow fails, THE Error_Diagnostics SHALL show workflow step that failed
5. THE Error_Diagnostics SHALL provide human-readable error messages
6. THE Error_Diagnostics SHALL suggest fix actions when recoverable

### Requirement 8: 命令补全

**User Story:** As a user, I want command completion suggestions when I type '/', so that I can quickly find and execute commands.

#### Acceptance Criteria

1. WHEN user types '/', THE Completion_Provider SHALL return all available commands
2. WHEN user types partial command, THE Completion_Provider SHALL filter by prefix
3. THE Completion_Provider SHALL include command description in suggestions
4. THE Completion_Provider SHALL indicate command layer with icon (⚡builtin, 📁external, 🤖skill)
5. THE Completion_Provider SHALL show parameter hints for commands with parameters
6. THE Completion_Provider SHALL sort suggestions by relevance and layer priority

### Requirement 9: 真实 Agent 集成测试

**User Story:** As a developer, I want integration tests that run real Agent instances, so that I can verify the command system works end-to-end.

#### Acceptance Criteria

1. Integration tests SHALL start a real Agent instance with test configuration
2. Integration tests SHALL verify builtin commands execute correctly
3. Integration tests SHALL verify external commands execute via just CLI
4. Integration tests SHALL verify skill commands trigger AI workflow
5. Integration tests SHALL verify error diagnostics produce correct suggestions
6. Integration tests SHALL verify command completion returns correct results
7. Integration tests SHALL use mock LLM responses for deterministic testing
8. Integration tests SHALL clean up resources after each test

