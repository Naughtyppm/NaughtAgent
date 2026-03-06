# NaughtyAgent Agent Teams 设计方案

## 目录

1. [概述](#概述)
2. [与现有系统的关系](#与现有系统的关系)
3. [核心概念](#核心概念)
4. [架构设计](#架构设计)
5. [组件详细设计](#组件详细设计)
6. [通信协议](#通信协议)
7. [任务管理系统](#任务管理系统)
8. [显示模式](#显示模式)
9. [权限与安全](#权限与安全)
10. [生命周期管理](#生命周期管理)
11. [质量门控（Hooks）](#质量门控hooks)
12. [实现计划](#实现计划)
13. [API 参考](#api-参考)
14. [最佳实践](#最佳实践)
15. [已知限制](#已知限制)

---

## 概述

### 背景

NaughtyAgent 当前已有完善的子 Agent 系统（6 种工具 + 事件系统 + 并发控制），但所有子 Agent 都是"汇报型"的——执行完毕后将结果返回给主 Agent，子 Agent 之间无法直接通信。

Agent Teams 是在现有 Subagent 基础上的升级，引入**团队协作模式**：多个 Agent 实例作为 Teammate 并行工作，拥有共享任务列表和直接通信能力，由一个 Team Lead 协调。

### 设计目标

| 目标 | 描述 |
|------|------|
| 团队协作 | Teammate 之间可以直接发消息、共享发现、互相挑战 |
| 共享任务 | 统一的任务列表，支持依赖关系、自动认领、状态追踪 |
| 用户可控 | 用户可以直接与任意 Teammate 对话，不必通过 Lead |
| 渐进增强 | 在现有 subtask 基础设施上构建，不破坏已有功能 |
| 资源可控 | Token 使用透明，支持限制 Teammate 数量和并发 |

### 与 Claude Code Agent Teams 的对比

| 特性 | Claude Code | NaughtyAgent（计划） |
|------|------------|---------------------|
| 运行方式 | 多个 CLI 进程（tmux） | 单进程内多 Agent Loop |
| 通信机制 | 文件系统邮箱 | 内存消息队列 + 事件系统 |
| 任务管理 | 文件系统 JSON | 内存 TaskBoard + 持久化 |
| 显示模式 | in-process / tmux split | in-process（Ink 多面板） |
| 权限模型 | 继承 Lead 权限 | 继承 + 可覆盖 |
| 自定义 Agent | CLAUDE.md | .naughty/agents/*.md |


---

## 与现有系统的关系

### 现有子 Agent 工具（保持不变）

```
ask_llm          → 单次 LLM 调用，无工具（快速查询）
run_agent        → 独立 Agent Loop，返回结果给调用者
fork_agent       → 继承父上下文的独立 Agent
parallel_agents  → 融合 Agent 协调多个子 Agent 并行
multi_agent      → 多角色讨论 + 可选执行阶段
run_workflow     → 预定义多步骤流程
task             → 统一入口（explore/plan/build/custom）
```

### Agent Teams 新增能力

```
现有 Subagent:
  主 Agent → 子 Agent → 结果返回主 Agent
  （单向，子 Agent 之间不通信）

Agent Teams:
  Lead ←→ Teammate A ←→ Teammate B
    ↕         ↕              ↕
  共享任务列表 + 邮箱消息系统
  （双向，Teammate 之间可直接通信）
```

### 复用关系

Agent Teams 复用现有基础设施：

| 现有模块 | Teams 中的角色 |
|---------|---------------|
| `run-agent.ts` | Teammate 的执行引擎 |
| `events.ts` | 扩展为 Team 级别事件 |
| `concurrency.ts` | Teammate 并发控制 |
| `agent-registry.ts` | 自定义 Teammate 角色定义 |
| `config.ts` | Team 配置管理 |
| `global-listener.ts` | Team 事件广播 |
| `SubAgentPanel.tsx` | 扩展为 Teammate 面板 |


---

## 核心概念

### 角色定义

| 角色 | 描述 | 能力 |
|------|------|------|
| **Team Lead** | 创建团队的主 Agent session | 协调工作、分配任务、合成结果、生成/关闭 Teammate |
| **Teammate** | 独立的 Agent 实例 | 独立上下文窗口、工具调用、任务认领、消息收发 |
| **User** | 人类用户 | 与 Lead 或任意 Teammate 直接对话 |

### 核心组件

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent Team                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐     ┌──────────────────────────────────────┐     │
│  │Team Lead │────▶│           Team Registry               │     │
│  │(主 Agent)│     │  ┌──────────┐  ┌──────────┐          │     │
│  └──────────┘     │  │Teammate A│  │Teammate B│  ...     │     │
│       │           │  └──────────┘  └──────────┘          │     │
│       │           └──────────────────────────────────────┘     │
│       │                        │                                │
│       ▼                        ▼                                │
│  ┌──────────────────────────────────────────────────────┐      │
│  │                    Task Board                         │      │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐     │      │
│  │  │Task #1 │  │Task #2 │  │Task #3 │  │Task #4 │     │      │
│  │  │pending │  │running │  │blocked │  │done    │     │      │
│  │  └────────┘  └────────┘  └────────┘  └────────┘     │      │
│  └──────────────────────────────────────────────────────┘      │
│       │                        │                                │
│       ▼                        ▼                                │
│  ┌──────────────────────────────────────────────────────┐      │
│  │                    Mailbox                            │      │
│  │  Lead → Teammate A: "请审查 auth 模块"                │      │
│  │  Teammate A → Teammate B: "发现 JWT 过期问题"         │      │
│  │  Teammate B → Lead: "已修复，请验证"                   │      │
│  └──────────────────────────────────────────────────────┘      │
│       │                                                         │
│       ▼                                                         │
│  ┌──────────────────────────────────────────────────────┐      │
│  │                 Event Bus (扩展)                       │      │
│  │  team_created | teammate_spawned | task_claimed |     │      │
│  │  message_sent | teammate_idle | team_cleanup          │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 与 Subagent 的选择指南

| 场景 | 推荐方式 | 原因 |
|------|---------|------|
| 快速查询/分析 | `ask_llm` / `task(explore)` | 无需协作，结果即用 |
| 独立任务执行 | `run_agent` / `task(build)` | 单向委托，结果返回 |
| 需要父上下文 | `fork_agent` | 继承对话历史 |
| 多视角分析 | `parallel_agents` | 融合 Agent 协调 |
| 角色讨论 | `multi_agent` | Handoff 机制 |
| **需要 Teammate 间协作** | **Agent Teams** | 共享任务 + 直接通信 |
| **复杂跨模块开发** | **Agent Teams** | 各 Teammate 负责不同模块 |
| **竞争假设调查** | **Agent Teams** | Teammate 互相挑战 |


---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                           UI Layer (Ink)                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐   │
│  │TeamPanel    │  │TaskBoard    │  │TeammateSelector          │   │
│  │(团队总览)    │  │(任务看板)    │  │(Shift+↑↓ 切换 Teammate) │   │
│  └─────────────┘  └─────────────┘  └──────────────────────────┘   │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐   │
│  │MessageList  │  │SubAgentPanel│  │StatusIndicator           │   │
│  │(当前 Agent) │  │(Teammate 详情)│ │(团队状态摘要)            │   │
│  └─────────────┘  └─────────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Team Coordinator                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐     │
│  │TeamManager   │  │TaskBoard     │  │Mailbox               │     │
│  │(团队生命周期) │  │(任务管理)     │  │(消息路由)             │     │
│  └──────────────┘  └──────────────┘  └──────────────────────┘     │
│         │                  │                    │                   │
│         ▼                  ▼                    ▼                   │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │                  Team Event Bus                           │     │
│  │  (扩展现有 SubAgentEvent，新增 Team 级别事件)             │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Execution Layer (复用现有)                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐      │
│  │run_agent │  │fork_agent│  │ask_llm   │  │Agent Registry │      │
│  │(执行引擎) │  │(上下文)   │  │(快速查询) │  │(角色定义)     │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘      │
│  ┌──────────────────┐  ┌──────────────────────────────────┐      │
│  │ConcurrencyCtrl   │  │AbortSignalChain                  │      │
│  │(并发控制)         │  │(取消信号传递)                     │      │
│  └──────────────────┘  └──────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

### 数据流

```
用户输入 "创建一个团队来审查 PR #142"
    │
    ▼
Team Lead 解析意图
    │
    ├─→ TeamManager.createTeam({ name: "pr-review-142" })
    │
    ├─→ TaskBoard.addTasks([
    │     { id: "t1", title: "安全审查", assignee: null },
    │     { id: "t2", title: "性能审查", assignee: null },
    │     { id: "t3", title: "测试覆盖", assignee: null },
    │   ])
    │
    ├─→ TeamManager.spawnTeammate({
    │     name: "security-reviewer",
    │     prompt: "审查 PR #142 的安全问题...",
    │     agentType: "explore",
    │   })
    │   → 创建独立 Agent Loop（复用 runRunAgent）
    │   → Teammate 自动认领 Task "t1"
    │
    ├─→ TeamManager.spawnTeammate({
    │     name: "perf-reviewer",
    │     prompt: "审查 PR #142 的性能影响...",
    │   })
    │
    └─→ TeamManager.spawnTeammate({
          name: "test-reviewer",
          prompt: "验证 PR #142 的测试覆盖...",
        })

Teammate 执行过程中：
    security-reviewer 发现问题
        │
        ├─→ Mailbox.send("security-reviewer", "perf-reviewer",
        │     "发现 auth 模块有 SQL 注入风险，可能影响性能优化方向")
        │
        └─→ perf-reviewer 收到消息，调整审查策略

所有 Teammate 完成后：
    │
    ├─→ Lead 收到 idle 通知
    ├─→ Lead 合成所有审查结果
    └─→ Lead 输出统一报告
```


---

## 组件详细设计

### 1. TeamManager（团队管理器）

负责团队的完整生命周期：创建、Teammate 管理、关闭清理。

```typescript
// packages/agent/src/team/team-manager.ts

interface TeamConfig {
  /** 团队名称（唯一标识） */
  name: string
  /** 最大 Teammate 数量 */
  maxTeammates?: number  // 默认 5
  /** Teammate 默认权限模式 */
  defaultPermissionMode?: PermissionMode  // 继承 Lead
  /** 是否启用 delegate 模式（Lead 只协调不执行） */
  delegateMode?: boolean
}

interface TeammateConfig {
  /** Teammate 名称 */
  name: string
  /** 生成提示词（任务描述 + 角色定义） */
  spawnPrompt: string
  /** Agent 类型 */
  agentType?: "build" | "plan" | "explore" | "custom"
  /** 自定义 Agent 名称（agentType 为 custom 时） */
  customAgent?: string
  /** 工具白名单 */
  tools?: string[]
  /** 最大轮数 */
  maxTurns?: number
  /** 是否要求计划审批 */
  requirePlanApproval?: boolean
  /** 权限模式覆盖 */
  permissionMode?: PermissionMode
}

interface TeamManager {
  /** 创建团队 */
  createTeam(config: TeamConfig): Team

  /** 生成 Teammate */
  spawnTeammate(config: TeammateConfig): Promise<Teammate>

  /** 向 Teammate 发送消息 */
  messageTeammate(name: string, message: string): Promise<void>

  /** 广播消息给所有 Teammate */
  broadcast(message: string): Promise<void>

  /** 请求 Teammate 关闭 */
  requestShutdown(name: string): Promise<ShutdownResult>

  /** 清理团队资源 */
  cleanup(): Promise<void>

  /** 获取团队状态 */
  getStatus(): TeamStatus
}
```

### 2. TaskBoard（任务看板）

共享任务列表，支持依赖关系和并发安全的任务认领。

```typescript
// packages/agent/src/team/task-board.ts

type TaskState = "pending" | "in_progress" | "completed" | "blocked"

interface TeamTask {
  id: string
  title: string
  description: string
  state: TaskState
  /** 负责人（Teammate 名称） */
  assignee?: string
  /** 依赖的任务 ID 列表 */
  dependencies?: string[]
  /** 创建时间 */
  createdAt: number
  /** 完成时间 */
  completedAt?: number
  /** 任务结果 */
  result?: string
}

interface TaskBoard {
  /** 添加任务 */
  addTask(task: Omit<TeamTask, "id" | "state" | "createdAt">): string

  /** 批量添加任务 */
  addTasks(tasks: Array<Omit<TeamTask, "id" | "state" | "createdAt">>): string[]

  /** 认领任务（原子操作，防止竞争） */
  claimTask(taskId: string, teammate: string): boolean

  /** 自动认领下一个可用任务 */
  claimNext(teammate: string): TeamTask | null

  /** 标记任务完成 */
  completeTask(taskId: string, result: string): void

  /** 获取所有任务 */
  getTasks(): TeamTask[]

  /** 获取 Teammate 的任务 */
  getTasksFor(teammate: string): TeamTask[]

  /** 检查是否所有任务完成 */
  isAllCompleted(): boolean

  /** 获取被阻塞的任务（依赖未完成） */
  getBlockedTasks(): TeamTask[]
}
```


### 3. Mailbox（邮箱消息系统）

Teammate 之间的异步消息通信。

```typescript
// packages/agent/src/team/mailbox.ts

interface TeamMessage {
  id: string
  from: string        // 发送者名称
  to: string          // 接收者名称（"*" 表示广播）
  content: string
  timestamp: number
  read: boolean
}

interface Mailbox {
  /** 发送消息给指定 Teammate */
  send(from: string, to: string, content: string): string

  /** 广播消息给所有 Teammate */
  broadcast(from: string, content: string): string[]

  /** 获取未读消息 */
  getUnread(recipient: string): TeamMessage[]

  /** 标记消息已读 */
  markRead(messageId: string): void

  /** 获取对话历史 */
  getConversation(agent1: string, agent2: string): TeamMessage[]

  /** 获取所有消息 */
  getAllMessages(): TeamMessage[]
}
```

消息投递机制：
- 消息发送后立即存入 Mailbox
- 接收方 Teammate 在下一个 Agent Loop 迭代时自动检查未读消息
- 未读消息作为系统消息注入 Teammate 的上下文
- Lead 自动接收所有 Teammate 的 idle 通知

### 4. Team Event Bus（团队事件总线）

扩展现有 `SubAgentEvent`，新增团队级别事件。

```typescript
// packages/agent/src/team/events.ts

/** 团队级别事件（扩展现有 SubAgentEvent） */
type TeamEventType =
  // 团队生命周期
  | "team_created"
  | "team_cleanup"
  // Teammate 生命周期
  | "teammate_spawned"
  | "teammate_idle"
  | "teammate_shutdown"
  // 任务事件
  | "task_added"
  | "task_claimed"
  | "task_completed"
  | "task_blocked"
  // 消息事件
  | "message_sent"
  | "message_delivered"
  // 计划审批
  | "plan_submitted"
  | "plan_approved"
  | "plan_rejected"

interface TeamEvent {
  type: TeamEventType
  teamName: string
  timestamp: number
  data: Record<string, unknown>
}

/** 团队事件监听器 */
type TeamEventListener = (event: TeamEvent) => void
```


---

## 通信协议

### Teammate 间通信

```
┌──────────────┐    Mailbox.send()    ┌──────────────┐
│ Teammate A   │ ──────────────────▶  │   Mailbox    │
│              │                      │              │
│ "发现 auth   │                      │  存储消息     │
│  有注入漏洞" │                      │  标记未读     │
└──────────────┘                      └──────┬───────┘
                                             │
                                    下一次 Loop 迭代
                                             │
                                             ▼
                                      ┌──────────────┐
                                      │ Teammate B   │
                                      │              │
                                      │ 收到消息注入  │
                                      │ 调整工作方向  │
                                      └──────────────┘
```

### 消息注入机制

Teammate 在每次 Agent Loop 迭代前，检查 Mailbox 中的未读消息：

```typescript
// 伪代码：Teammate Agent Loop 增强
async function* teammateAgentLoop(teammate: Teammate) {
  while (!done) {
    // 1. 检查未读消息
    const unread = mailbox.getUnread(teammate.name)
    if (unread.length > 0) {
      // 将消息作为系统通知注入上下文
      const notification = formatMessages(unread)
      injectSystemMessage(teammate, notification)
      mailbox.markAllRead(teammate.name, unread)
    }

    // 2. 检查任务状态变更
    const taskUpdates = taskBoard.getUpdatesFor(teammate.name)
    if (taskUpdates.length > 0) {
      injectSystemMessage(teammate, formatTaskUpdates(taskUpdates))
    }

    // 3. 正常 Agent Loop 迭代
    yield* normalAgentIteration(teammate)
  }
}
```

### Lead 与 Teammate 通信

Lead 拥有专用工具与 Teammate 交互：

| 工具 | 描述 |
|------|------|
| `spawn_teammate` | 创建新 Teammate |
| `message_teammate` | 向指定 Teammate 发消息 |
| `broadcast` | 向所有 Teammate 广播 |
| `assign_task` | 分配任务给 Teammate |
| `check_status` | 查看团队/任务状态 |
| `approve_plan` | 审批 Teammate 的计划 |
| `shutdown_teammate` | 请求 Teammate 关闭 |
| `cleanup_team` | 清理团队资源 |

### 用户与 Teammate 直接通信

用户可以绕过 Lead，直接与任意 Teammate 对话：

```
Ink UI:
  Shift+↑/↓  → 切换当前焦点 Teammate
  Enter      → 向当前焦点 Teammate 发送消息
  Ctrl+T     → 切换任务看板显示
  Escape     → 中断当前 Teammate 的执行
```


---

## 任务管理系统

### 任务状态机

```
                    ┌─────────┐
                    │ pending │
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
              ▼          │          ▼
        ┌──────────┐    │    ┌──────────┐
        │ blocked  │    │    │ claimed  │
        │(依赖未完)│    │    │(被认领)  │
        └────┬─────┘    │    └────┬─────┘
             │          │         │
             │  依赖完成  │         │
             └──────────┘         │
                                  ▼
                           ┌────────────┐
                           │in_progress │
                           └─────┬──────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            │            ▼
              ┌──────────┐      │     ┌──────────┐
              │completed │      │     │  failed  │
              └──────────┘      │     └──────────┘
                                │
                                ▼
                         ┌────────────┐
                         │ reassigned │
                         │(重新分配)   │
                         └────────────┘
```

### 任务依赖解析

```typescript
// 任务依赖示例
taskBoard.addTasks([
  {
    title: "分析现有 auth 代码",
    description: "阅读 src/auth/ 目录，理解认证流程",
    // 无依赖，可立即认领
  },
  {
    title: "设计新的 JWT 方案",
    description: "基于分析结果，设计改进方案",
    dependencies: ["task-1"],  // 依赖第一个任务
    // 状态自动设为 blocked，直到 task-1 完成
  },
  {
    title: "实现 JWT 刷新逻辑",
    description: "实现 token 刷新和过期处理",
    dependencies: ["task-2"],  // 依赖设计方案
  },
])
```

当 task-1 完成时，TaskBoard 自动：
1. 将 task-2 从 `blocked` 变为 `pending`
2. 发出 `task_unblocked` 事件
3. 等待 Teammate 认领

### 任务认领竞争控制

多个 Teammate 可能同时尝试认领同一任务，使用锁机制保证原子性：

```typescript
class TaskBoardImpl implements TaskBoard {
  private claimLock = new Map<string, boolean>()

  claimTask(taskId: string, teammate: string): boolean {
    // 原子检查并锁定
    if (this.claimLock.get(taskId)) return false

    const task = this.tasks.get(taskId)
    if (!task || task.state !== "pending") return false

    // 检查依赖是否满足
    if (task.dependencies?.some(dep => {
      const depTask = this.tasks.get(dep)
      return !depTask || depTask.state !== "completed"
    })) return false

    // 锁定并认领
    this.claimLock.set(taskId, true)
    task.state = "in_progress"
    task.assignee = teammate
    this.claimLock.delete(taskId)

    this.emit("task_claimed", { taskId, teammate })
    return true
  }

  claimNext(teammate: string): TeamTask | null {
    // 找到第一个可认领的任务（pending + 无未完成依赖）
    for (const task of this.tasks.values()) {
      if (task.state === "pending" && this.isDependenciesMet(task)) {
        if (this.claimTask(task.id, teammate)) {
          return task
        }
      }
    }
    return null
  }
}
```


---

## 显示模式

NaughtyAgent 采用 Ink（React for CLI）渲染 UI，Agent Teams 在此基础上扩展。

### In-Process 模式（默认）

所有 Teammate 在同一终端内运行，通过快捷键切换焦点：

```
┌─────────────────────────────────────────────────────────┐
│  NaughtyAgent - Team: pr-review-142                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Lead] 正在协调审查工作...                              │
│                                                         │
│  ┌─ 🤖 security-reviewer (explore) ──── 运行中 ─────┐  │
│  │  任务: 审查 auth 模块安全漏洞                      │  │
│  │  步骤 5/30  [████████░░░░░░░░░░░░] 17%            │  │
│  │  最近: grep "sql" → read auth/login.ts → ...      │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─ 🤖 perf-reviewer (explore) ──── 运行中 ──────────┐ │
│  │  任务: 分析性能影响                                 │ │
│  │  步骤 3/30  [█████░░░░░░░░░░░░░░░] 10%            │ │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─ 🤖 test-reviewer (explore) ──── 等待中 ──────────┐ │
│  │  任务: 验证测试覆盖                                 │ │
│  │  步骤 0/30  [░░░░░░░░░░░░░░░░░░░░] 0%             │ │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  📋 任务看板 (Ctrl+T)                                   │
│  ✅ #1 分析 auth 代码结构 (security-reviewer)           │
│  🔄 #2 检查 SQL 注入风险 (security-reviewer)            │
│  🔄 #3 分析查询性能 (perf-reviewer)                     │
│  ⏳ #4 验证单元测试 (未分配)                             │
│  🔒 #5 编写审查报告 (依赖 #2, #3, #4)                  │
├─────────────────────────────────────────────────────────┤
│  🤖 活跃: 3 | 📋 任务: 2/5 完成 | 💬 消息: 2 未读     │
│  Shift+↑↓ 切换 Teammate | Enter 发消息 | Ctrl+T 任务板 │
├─────────────────────────────────────────────────────────┤
│  > [Lead] █                                             │
└─────────────────────────────────────────────────────────┘
```

### 快捷键映射

| 快捷键 | 功能 |
|--------|------|
| `Shift+↑` | 选择上一个 Teammate |
| `Shift+↓` | 选择下一个 Teammate |
| `Enter` | 查看选中 Teammate 的详细 session |
| `Escape` | 中断当前 Teammate / 返回 Lead 视图 |
| `Ctrl+T` | 切换任务看板显示 |
| `Shift+Tab` | 切换 delegate 模式 |

### UI 组件层次

```
App.tsx
├── TeamHeader          // 团队名称、状态摘要
├── MessageList         // 当前焦点 Agent 的消息
│   ├── AIMessage
│   └── ToolPanel
│       └── SubAgentPanel  // 复用现有组件
├── TeammateList        // Teammate 列表（可折叠）
│   └── TeammateCard    // 单个 Teammate 状态卡片
├── TaskBoardPanel      // 任务看板（Ctrl+T 切换）
│   └── TaskItem        // 单个任务条目
├── StatusIndicator     // 扩展：显示团队级别状态
└── InputArea           // 输入区域（显示当前焦点）
```


---

## 权限与安全

### 权限继承

```
Lead 权限模式
    │
    ├─→ Teammate A: 继承 Lead 权限（默认）
    ├─→ Teammate B: 继承 Lead 权限（默认）
    └─→ Teammate C: 覆盖为 plan 模式（只读 + 规划）
```

规则：
1. Teammate 默认继承 Lead 的权限模式
2. 生成时可通过 `permissionMode` 覆盖
3. 生成后可以单独修改 Teammate 的权限
4. 自定义 Agent（`.naughty/agents/*.md`）中定义的权限优先

### 文件冲突防护

多个 Teammate 同时编辑同一文件会导致覆盖。防护策略：

```typescript
interface FileGuard {
  /** 文件锁：Teammate 声明正在编辑的文件 */
  lockFile(teammate: string, filePath: string): boolean
  /** 释放文件锁 */
  unlockFile(teammate: string, filePath: string): void
  /** 检查文件是否被锁定 */
  isLocked(filePath: string): { locked: boolean; by?: string }
}
```

工作方式：
- Teammate 在 `write` / `edit` 工具执行前，自动检查文件锁
- 如果文件被其他 Teammate 锁定，工具返回警告并建议等待
- Lead 可以强制解锁（用于处理死锁）
- 文件锁在 Teammate 关闭时自动释放

### Delegate 模式

启用后，Lead 的工具集被限制为协调类工具：

```typescript
const DELEGATE_MODE_TOOLS = [
  "spawn_teammate",
  "message_teammate",
  "broadcast",
  "assign_task",
  "check_status",
  "approve_plan",
  "shutdown_teammate",
  "cleanup_team",
  // 只读工具仍可用
  "read",
  "glob",
  "grep",
]
```

Lead 不能直接执行 `write`、`edit`、`bash` 等修改类工具，强制将实际工作委托给 Teammate。

---

## 生命周期管理

### 团队创建流程

```
1. 用户请求创建团队
   └─→ Lead 解析意图

2. Lead 调用 TeamManager.createTeam()
   ├─→ 初始化 TaskBoard
   ├─→ 初始化 Mailbox
   └─→ 初始化 Team Event Bus

3. Lead 规划任务
   └─→ TaskBoard.addTasks([...])

4. Lead 生成 Teammate
   ├─→ TeamManager.spawnTeammate(config)
   │   ├─→ 创建 AbortController（链接到 Lead）
   │   ├─→ 复用 runRunAgent 创建 Agent Loop
   │   ├─→ 注入团队工具（message、claim_task 等）
   │   └─→ 发出 teammate_spawned 事件
   └─→ 重复直到所有角色就位

5. Teammate 开始工作
   ├─→ 自动认领任务（claimNext）
   ├─→ 执行任务
   ├─→ 通过 Mailbox 与其他 Teammate 通信
   └─→ 完成后标记任务完成，认领下一个
```

### Teammate 关闭流程

```
1. Lead 请求关闭
   └─→ TeamManager.requestShutdown(name)

2. Teammate 收到关闭请求
   ├─→ 如果正在执行任务：完成当前工具调用后停止
   ├─→ 如果空闲：立即停止
   └─→ 返回 ShutdownResult（accepted / rejected + 原因）

3. 如果 Teammate 拒绝
   └─→ Lead 决定是否强制关闭（abort signal）

4. 清理
   ├─→ 释放文件锁
   ├─→ 未完成任务标记为 pending（可被其他 Teammate 认领）
   └─→ 发出 teammate_shutdown 事件
```

### 团队清理流程

```
1. Lead 调用 TeamManager.cleanup()

2. 检查活跃 Teammate
   ├─→ 如果有活跃 Teammate：报错，要求先关闭
   └─→ 如果全部已关闭：继续

3. 清理资源
   ├─→ 清空 TaskBoard
   ├─→ 清空 Mailbox
   ├─→ 清空 Event Bus 监听器
   └─→ 发出 team_cleanup 事件

4. Lead 恢复为普通 Agent（移除团队工具）
```


---

## 质量门控（Hooks）

参考 Claude Code 的 Hook 机制，Agent Teams 支持两种质量门控 Hook：

### TeammateIdle Hook

当 Teammate 即将进入空闲状态时触发。可用于：
- 检查代码质量（lint、type check）
- 验证测试通过
- 确认文档更新

```typescript
interface TeammateIdleHook {
  name: string
  /** 触发条件 */
  when: {
    type: "teammate_idle"
    /** 可选：只对特定 Teammate 触发 */
    teammates?: string[]
  }
  /** 执行动作 */
  then: {
    type: "runCommand" | "askAgent"
    command?: string   // runCommand 时
    prompt?: string    // askAgent 时
  }
  /**
   * 返回码含义：
   * - 0: 通过，Teammate 可以进入空闲
   * - 2: 不通过，反馈发送给 Teammate，继续工作
   */
}
```

示例：Teammate 完成任务后自动运行 lint

```json
{
  "name": "Lint on Teammate Idle",
  "version": "1.0.0",
  "when": {
    "type": "teammate_idle"
  },
  "then": {
    "type": "runCommand",
    "command": "pnpm lint --quiet"
  }
}
```

### TaskCompleted Hook

当任务被标记为完成时触发。可用于：
- 验证任务产出物
- 运行相关测试
- 检查代码规范

```json
{
  "name": "Test on Task Complete",
  "version": "1.0.0",
  "when": {
    "type": "task_completed"
  },
  "then": {
    "type": "runCommand",
    "command": "pnpm test --run"
  }
}
```

返回码 2 会阻止任务完成，并将反馈发送给负责的 Teammate。

---

## 实现计划

### Phase 1: 核心基础设施

目标：实现 TeamManager、TaskBoard、Mailbox 核心数据结构

新增文件：
```
packages/agent/src/team/
├── index.ts              # 桶导出
├── types.ts              # 类型定义
├── team-manager.ts       # 团队管理器
├── task-board.ts         # 任务看板
├── mailbox.ts            # 邮箱消息系统
├── events.ts             # 团队事件（扩展 SubAgentEvent）
└── file-guard.ts         # 文件冲突防护
```

关键任务：
1. 定义所有 TypeScript 接口和类型
2. 实现 TaskBoard（含依赖解析和竞争控制）
3. 实现 Mailbox（消息存储和投递）
4. 实现 TeamManager（生命周期管理）
5. 实现 FileGuard（文件锁）
6. 单元测试覆盖

### Phase 2: Lead 工具集

目标：为 Lead 提供团队管理工具

新增文件：
```
packages/agent/src/tool/team/
├── index.ts
├── spawn-teammate-tool.ts
├── message-teammate-tool.ts
├── broadcast-tool.ts
├── assign-task-tool.ts
├── check-status-tool.ts
├── approve-plan-tool.ts
├── shutdown-teammate-tool.ts
└── cleanup-team-tool.ts
```

关键任务：
1. 使用 `Tool.define()` 模式定义每个工具
2. 工具注册和运行时配置
3. Delegate 模式工具过滤
4. 集成测试


### Phase 3: Teammate 执行引擎

目标：Teammate 作为增强版 run_agent 运行，支持消息接收和任务认领

修改文件：
- `packages/agent/src/subtask/run-agent.ts` — 扩展支持 Teammate 模式
- `packages/agent/src/subtask/events.ts` — 新增团队事件类型

新增文件：
```
packages/agent/src/team/
├── teammate-loop.ts      # Teammate 增强 Agent Loop
├── teammate-tools.ts     # Teammate 专用工具（message、claim_task）
└── message-injector.ts   # 消息注入机制
```

关键任务：
1. 扩展 Agent Loop，支持消息检查和注入
2. 实现 Teammate 专用工具（发消息、认领任务、标记完成）
3. 实现计划审批流程（plan mode → 提交计划 → Lead 审批 → 切换模式）
4. Abort 信号链：Lead abort → 所有 Teammate abort
5. 集成测试

### Phase 4: UI 集成

目标：Ink UI 支持团队视图

修改文件：
- `packages/agent/src/cli/ink/App.tsx` — 团队模式入口
- `packages/agent/src/cli/ink/types.ts` — 团队相关类型
- `packages/agent/src/cli/ink/components/StatusIndicator.tsx` — 团队状态

新增文件：
```
packages/agent/src/cli/ink/
├── components/
│   ├── TeamHeader.tsx        # 团队头部信息
│   ├── TeammateList.tsx      # Teammate 列表
│   ├── TeammateCard.tsx      # 单个 Teammate 卡片
│   ├── TaskBoardPanel.tsx    # 任务看板面板
│   └── TaskItem.tsx          # 任务条目
├── hooks/
│   ├── useTeam.ts            # 团队状态管理
│   ├── useTaskBoard.ts       # 任务看板状态
│   └── useTeammateSelector.ts # Teammate 切换
```

关键任务：
1. 实现 Teammate 列表和切换（Shift+↑↓）
2. 实现任务看板面板（Ctrl+T）
3. 扩展 StatusIndicator 显示团队摘要
4. 实现焦点 Teammate 的消息视图
5. 快捷键绑定

### Phase 5: Hook 集成与打磨

目标：质量门控 Hook + 边界情况处理

关键任务：
1. 实现 TeammateIdle Hook
2. 实现 TaskCompleted Hook
3. 处理边界情况：Teammate 崩溃恢复、死锁检测、超时处理
4. 性能优化：限制消息历史长度、事件节流
5. 端到端测试

### 时间估算

| Phase | 预估工作量 | 依赖 |
|-------|-----------|------|
| Phase 1: 核心基础设施 | 3-4 天 | 无 |
| Phase 2: Lead 工具集 | 2-3 天 | Phase 1 |
| Phase 3: Teammate 执行引擎 | 3-4 天 | Phase 1, 2 |
| Phase 4: UI 集成 | 3-4 天 | Phase 1, 2, 3 |
| Phase 5: Hook 与打磨 | 2-3 天 | Phase 1-4 |
| 总计 | 13-18 天 | |


---

## API 参考

### Lead 工具 API

#### spawn_teammate

```typescript
Tool.define({
  id: "spawn_teammate",
  parameters: z.object({
    name: z.string().describe("Teammate 名称（唯一）"),
    prompt: z.string().describe("生成提示词，包含角色定义和任务描述"),
    agentType: z.enum(["build", "plan", "explore", "custom"]).optional(),
    customAgent: z.string().optional().describe("自定义 Agent 名称"),
    tools: z.array(z.string()).optional(),
    maxTurns: z.number().optional().describe("最大轮数，默认 30"),
    requirePlanApproval: z.boolean().optional()
      .describe("是否要求计划审批后才能执行"),
  }),
})
```

#### message_teammate

```typescript
Tool.define({
  id: "message_teammate",
  parameters: z.object({
    to: z.string().describe("目标 Teammate 名称"),
    message: z.string().describe("消息内容"),
  }),
})
```

#### assign_task

```typescript
Tool.define({
  id: "assign_task",
  parameters: z.object({
    taskId: z.string().optional().describe("指定任务 ID"),
    teammate: z.string().describe("分配给哪个 Teammate"),
    title: z.string().optional().describe("新建任务时的标题"),
    description: z.string().optional().describe("新建任务时的描述"),
    dependencies: z.array(z.string()).optional(),
  }),
})
```

#### check_status

```typescript
Tool.define({
  id: "check_status",
  parameters: z.object({
    target: z.enum(["team", "tasks", "teammate"]).optional(),
    teammate: z.string().optional().describe("查看特定 Teammate"),
  }),
})
// 返回：团队状态、任务列表、Teammate 状态、未读消息数
```

#### approve_plan

```typescript
Tool.define({
  id: "approve_plan",
  parameters: z.object({
    teammate: z.string().describe("提交计划的 Teammate"),
    approved: z.boolean().describe("是否批准"),
    feedback: z.string().optional().describe("反馈（拒绝时必填）"),
  }),
})
```

### Teammate 工具 API

Teammate 拥有标准工具集（read/write/edit/bash/glob/grep）加上团队专用工具：

#### send_message

```typescript
Tool.define({
  id: "send_message",
  parameters: z.object({
    to: z.string().describe("目标 Teammate 或 'lead'"),
    message: z.string().describe("消息内容"),
  }),
})
```

#### claim_task

```typescript
Tool.define({
  id: "claim_task",
  parameters: z.object({
    taskId: z.string().optional().describe("指定任务 ID，不填则自动认领"),
  }),
})
```

#### complete_task

```typescript
Tool.define({
  id: "complete_task",
  parameters: z.object({
    taskId: z.string().describe("完成的任务 ID"),
    result: z.string().describe("任务结果摘要"),
  }),
})
```

#### submit_plan

```typescript
Tool.define({
  id: "submit_plan",
  parameters: z.object({
    plan: z.string().describe("计划内容"),
  }),
})
// 仅在 requirePlanApproval 模式下可用
// 提交后 Teammate 进入等待状态，直到 Lead 审批
```


---

## 最佳实践

### 1. 给 Teammate 足够的上下文

Teammate 不继承 Lead 的对话历史。在 spawn prompt 中包含必要信息：

```
✅ 好的 spawn prompt:
"审查 src/auth/ 目录的安全漏洞。该应用使用 JWT token 存储在 httpOnly cookie 中。
重点关注：SQL 注入、XSS、认证绕过。输出结构化报告，包含严重级别。"

❌ 差的 spawn prompt:
"审查安全问题"
```

### 2. 合理划分任务粒度

| 粒度 | 问题 |
|------|------|
| 太小 | 协调开销超过收益 |
| 太大 | Teammate 工作太久没有检查点，浪费风险高 |
| 合适 | 自包含单元，有明确交付物（一个函数、一个测试文件、一份审查） |

建议每个 Teammate 分配 5-6 个任务，保持生产力并允许 Lead 重新分配。

### 3. 避免文件冲突

两个 Teammate 编辑同一文件会导致覆盖。拆分工作使每个 Teammate 负责不同文件集：

```
✅ 好的分工:
  Teammate A → src/auth/login.ts, src/auth/register.ts
  Teammate B → src/auth/jwt.ts, src/auth/refresh.ts
  Teammate C → test/auth/*.test.ts

❌ 差的分工:
  Teammate A → 修改 src/auth/index.ts 的导出
  Teammate B → 修改 src/auth/index.ts 的类型
```

### 4. 先研究后实现

如果对 Agent Teams 不熟悉，从不需要写代码的任务开始：
- 审查 PR
- 调研技术方案
- 分析 Bug

这些任务展示并行探索的价值，同时避免并行实现的协调挑战。

### 5. 监控和引导

定期检查 Teammate 进度，重定向不工作的方法，及时合成发现。
让团队无人值守运行太久会增加浪费风险。

### 6. 使用竞争假设模式

调查 Bug 时，让多个 Teammate 各自调查不同假设并互相挑战：

```
"用户报告应用在一条消息后退出。生成 5 个 Teammate 调查不同假设。
让他们互相讨论，试图推翻对方的理论，像科学辩论一样。
将共识写入 findings.md。"
```

这种辩论结构避免了锚定效应——顺序调查容易被第一个看似合理的解释锚定。

---

## 已知限制

| 限制 | 描述 | 缓解方案 |
|------|------|---------|
| 单进程 | 所有 Teammate 在同一 Node.js 进程中运行 | 利用异步并发，非 CPU 密集型任务影响不大 |
| 无 Session 恢复 | 重启后无法恢复 Teammate 状态 | 任务列表可持久化，Teammate 需重新生成 |
| 一个团队/Session | 一个 Lead 只能管理一个团队 | 清理当前团队后可创建新团队 |
| 无嵌套团队 | Teammate 不能创建自己的团队 | Teammate 可以使用普通 subagent 工具 |
| Lead 固定 | 不能转移 Lead 角色 | 设计决策，保持简单 |
| Token 消耗高 | 每个 Teammate 独立上下文窗口 | 用于真正需要并行的任务，简单任务用 subagent |
| 文件冲突 | 并行编辑同一文件可能覆盖 | FileGuard 提供警告，但不是强制锁 |
| 消息延迟 | 消息在下一次 Loop 迭代才被接收 | 对于大多数场景可接受 |

---

## 附录：文件结构规划

```
packages/agent/src/
├── team/                          # 新增：团队系统
│   ├── index.ts                   # 桶导出
│   ├── types.ts                   # 类型定义
│   ├── team-manager.ts            # 团队管理器
│   ├── task-board.ts              # 任务看板
│   ├── mailbox.ts                 # 邮箱消息系统
│   ├── events.ts                  # 团队事件
│   ├── file-guard.ts              # 文件冲突防护
│   ├── teammate-loop.ts           # Teammate 增强 Loop
│   ├── teammate-tools.ts          # Teammate 专用工具
│   └── message-injector.ts        # 消息注入
│
├── tool/team/                     # 新增：Lead 团队工具
│   ├── index.ts
│   ├── register.ts                # 工具注册
│   ├── spawn-teammate-tool.ts
│   ├── message-teammate-tool.ts
│   ├── broadcast-tool.ts
│   ├── assign-task-tool.ts
│   ├── check-status-tool.ts
│   ├── approve-plan-tool.ts
│   ├── shutdown-teammate-tool.ts
│   └── cleanup-team-tool.ts
│
├── cli/ink/components/            # 修改 + 新增
│   ├── TeamHeader.tsx             # 新增
│   ├── TeammateList.tsx           # 新增
│   ├── TeammateCard.tsx           # 新增
│   ├── TaskBoardPanel.tsx         # 新增
│   ├── TaskItem.tsx               # 新增
│   ├── StatusIndicator.tsx        # 修改：团队状态
│   └── SubAgentPanel.tsx          # 复用
│
├── cli/ink/hooks/                 # 新增
│   ├── useTeam.ts                 # 团队状态
│   ├── useTaskBoard.ts            # 任务看板
│   └── useTeammateSelector.ts     # Teammate 切换
│
└── test/team/                     # 新增：测试
    ├── team-manager.test.ts
    ├── task-board.test.ts
    ├── mailbox.test.ts
    ├── file-guard.test.ts
    └── teammate-loop.test.ts
```

---

> 参考来源：[Claude Code Agent Teams 文档](https://code.claude.com/docs/en/agent-teams)
> 内容已根据 NaughtyAgent 架构重新设计，非直接复制。
