# Phase 2 总结：对话能力

> 完成时间：2026-01-15
> 状态：✅ 完成

## 做了什么

实现了 Agent 的会话系统，包括：

### 1. Message 消息结构

| 组件 | 文件 | 说明 |
|------|------|------|
| MessageRole | `src/session/message.ts` | 消息角色：user / assistant |
| ContentBlock | `src/session/message.ts` | 内容块：text / tool_use / tool_result |
| Message | `src/session/message.ts` | 完整消息结构 |
| 辅助函数 | `src/session/message.ts` | createUserMessage, createToolResult 等 |

### 2. Session 会话定义

| 组件 | 文件 | 说明 |
|------|------|------|
| Session | `src/session/session.ts` | 会话结构：id, status, messages, usage |
| SessionStatus | `src/session/session.ts` | 状态：idle / running / paused / completed / error |
| AgentType | `src/session/session.ts` | Agent 类型：build / plan / explore |
| 辅助函数 | `src/session/session.ts` | createSession, addMessage, updateStatus 等 |

### 3. SessionManager 会话管理器

| 组件 | 文件 | 说明 |
|------|------|------|
| SessionManager | `src/session/manager.ts` | 管理多个会话的创建、获取、删除 |
| sessionManager | `src/session/manager.ts` | 默认单例实例 |

### 4. Storage 持久化存储

| 组件 | 文件 | 说明 |
|------|------|------|
| saveSession | `src/session/storage.ts` | 保存会话到文件 |
| loadSession | `src/session/storage.ts` | 从文件加载会话 |
| listSavedSessions | `src/session/storage.ts` | 列出已保存的会话 |
| appendMessage | `src/session/storage.ts` | 追加消息（增量保存） |

## 能干什么

### Message 消息

```typescript
// 创建用户消息
const userMsg = createUserMessage("帮我写个函数")

// 创建助手消息（含工具调用）
const assistantMsg = createAssistantMessage([
  { type: "text", text: "我来帮你读取文件" },
  { type: "tool_use", id: "call_1", name: "read", input: { filePath: "/src/index.ts" } }
])

// 创建工具结果
const toolResult = createToolResult("call_1", "文件内容...")
```

### Session 会话

```typescript
// 创建会话
const session = createSession({ cwd: "/project", agentType: "build" })

// 添加消息
addMessage(session, "user", [{ type: "text", text: "Hello" }])

// 更新状态
updateStatus(session, "running")

// 更新 Token 统计
updateUsage(session, { inputTokens: 100, outputTokens: 50 })
```

### SessionManager 管理器

```typescript
const manager = new SessionManager()

// 创建会话
const session = manager.create({ cwd: "/project" })

// 获取会话
const s = manager.get(session.id)

// 添加消息
manager.addUserMessage(session.id, "Hello")

// 列出所有会话
const sessions = manager.list()
```

### Storage 持久化

```typescript
// 保存会话
await saveSession(session)

// 加载会话
const loaded = await loadSession(sessionId, baseDir)

// 列出已保存的会话
const ids = await listSavedSessions(baseDir)
```

存储格式：
```
.naught/sessions/
├── {session-id}/
│   ├── session.json    # 会话元数据
│   └── messages.jsonl  # 消息历史（JSONL 格式）
```

## 在 Agent 中的作用

```
┌─────────────────────────────────────────────────────────────┐
│                        Agent Loop                            │
│                                                              │
│   User Input                                                 │
│       ↓                                                      │
│   ┌─────────────────┐                                       │
│   │    Session      │  ← Phase 2: 管理上下文                │
│   │  addUserMessage │                                       │
│   └────────┬────────┘                                       │
│            ↓                                                 │
│   构建消息列表 (messages)                                    │
│            ↓                                                 │
│   ┌─────────────────┐                                       │
│   │    Provider     │  ← Phase 1                            │
│   │  stream/chat    │                                       │
│   └────────┬────────┘                                       │
│            ↓                                                 │
│   ┌─────────────────┐                                       │
│   │    Session      │  ← Phase 2: 保存响应                  │
│   │ addAssistantMsg │                                       │
│   └────────┬────────┘                                       │
│            ↓                                                 │
│   解析 tool_use                                              │
│            ↓                                                 │
│   ┌─────────────────┐                                       │
│   │  Tool System    │  ← Phase 1                            │
│   └────────┬────────┘                                       │
│            ↓                                                 │
│   ┌─────────────────┐                                       │
│   │    Session      │  ← Phase 2: 保存工具结果              │
│   │ addToolResult   │                                       │
│   └────────┬────────┘                                       │
│            ↓                                                 │
│   Continue Loop...                                           │
└─────────────────────────────────────────────────────────────┘
```

**Phase 2 提供了 Agent 的"记忆"能力：**
- 维护对话历史
- 管理消息结构（用户、助手、工具）
- 持久化会话状态

## 当前整体能力

### 能做什么

| 能力 | Phase | 状态 |
|------|-------|------|
| 读写编辑文件 | 1 | ✅ |
| 执行 shell 命令 | 1 | ✅ |
| 搜索代码 | 1 | ✅ |
| 调用 Claude API | 1 | ✅ |
| 创建/管理会话 | 2 | ✅ |
| 管理消息历史 | 2 | ✅ |
| 会话持久化 | 2 | ✅ |
| Token 统计 | 2 | ✅ |

### 不能做什么

| 能力 | 需要 |
|------|------|
| Agent 循环 | Phase 3 - Agent Loop |
| 系统提示构建 | Phase 3 - Agent |
| 多 Agent 支持 | Phase 3 - Agent |
| 用户交互 | Phase 4 - CLI |
| 权限控制 | Phase 4 - Permission |

## 设计决策

### 1. 消息结构对齐 Claude API

```typescript
ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock
```

直接对应 Claude API 的消息格式，减少转换开销。

### 2. JSONL 格式存储消息

- 支持增量追加
- 大文件友好
- 易于调试和查看

### 3. SessionManager 单例模式

提供默认实例 `sessionManager`，简化使用：
```typescript
import { sessionManager } from "./session"
sessionManager.create({ cwd: "/project" })
```

### 4. 状态机设计

```
[idle] <--> [running] --> [completed]
   |           |
   v           v
[paused]   [error]
```

清晰的状态转换，便于 UI 展示和错误处理。

## 下一步

进入 **Phase 3: Agent 能力**，实现 Agent Loop：

1. **Agent 定义** - Agent 配置（prompt、tools、permission）
2. **Agent Loop** - 核心循环：用户输入 → LLM → 工具调用 → 结果 → LLM → ...
3. **系统提示** - 构建发送给 LLM 的 system prompt
4. **多 Agent** - build / plan / explore

完成 Phase 3 后，就可以进入 Phase 4 实现 CLI，让用户实际使用。

## 相关文件

### 规格文件

- `.spec/sdd/interfaces/session.spec.md`

### 实现文件

- `packages/agent/src/session/message.ts`
- `packages/agent/src/session/session.ts`
- `packages/agent/src/session/manager.ts`
- `packages/agent/src/session/storage.ts`
- `packages/agent/src/session/index.ts`
