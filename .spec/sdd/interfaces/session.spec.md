# Interface Spec: Session System

> 会话管理的接口规格

## Types

```typescript
/**
 * 会话 ID
 */
type SessionID = string

/**
 * 消息角色
 */
type MessageRole = "user" | "assistant" | "system"

/**
 * 消息内容块
 */
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string }

/**
 * 消息
 */
interface Message {
  id: string
  role: MessageRole
  content: ContentBlock[]
  timestamp: number
}

/**
 * 会话状态
 */
type SessionStatus = "idle" | "running" | "paused" | "completed" | "error"

/**
 * 会话
 */
interface Session {
  /** 会话 ID */
  id: SessionID
  /** 当前状态 */
  status: SessionStatus
  /** 工作目录 */
  cwd: string
  /** 消息历史 */
  messages: Message[]
  /** 当前 Agent 类型 */
  agentType: AgentType
  /** 创建时间 */
  createdAt: number
  /** 最后活动时间 */
  updatedAt: number
  /** Token 使用统计 */
  usage: TokenUsage
}

/**
 * 会话管理器
 */
interface SessionManager {
  /** 创建新会话 */
  create(options: CreateSessionOptions): Session
  /** 获取会话 */
  get(id: SessionID): Session | undefined
  /** 列出所有会话 */
  list(): Session[]
  /** 删除会话 */
  delete(id: SessionID): boolean
  /** 添加消息 */
  addMessage(id: SessionID, message: Omit<Message, "id" | "timestamp">): Message
  /** 更新状态 */
  updateStatus(id: SessionID, status: SessionStatus): void
  /** 持久化会话 */
  save(id: SessionID): Promise<void>
  /** 加载会话 */
  load(id: SessionID): Promise<Session>
}

/**
 * 创建会话选项
 */
interface CreateSessionOptions {
  cwd?: string
  agentType?: AgentType
}
```

## Contracts

### Session

#### 前置条件

1. `id` 必须是有效的 UUID 或自定义格式
2. `cwd` 必须是有效的目录路径

#### 后置条件

1. 新创建的 Session 状态必须是 `idle`
2. `messages` 初始为空数组

#### 不变量

1. `messages` 按时间顺序排列
2. `updatedAt >= createdAt`
3. `usage` 累计不减少

### SessionManager

#### 前置条件

1. `get`: id 格式有效
2. `addMessage`: Session 必须存在
3. `save`: Session 必须存在

#### 后置条件

1. `create` 返回的 Session 已加入管理
2. `delete` 后 `get` 返回 undefined
3. `load` 后 Session 可通过 `get` 获取

#### 不变量

1. 同一 id 不能创建两次
2. 已删除的 Session 不可恢复（除非重新 load）

## State Machine

```
[idle] <--> [running] --> [completed]
   |           |
   v           v
[paused]   [error]
```

- **idle**: 等待用户输入
- **running**: Agent 正在执行
- **paused**: 等待用户确认（权限）
- **completed**: 会话结束
- **error**: 发生错误

## Message Flow

```
User Input
    |
    v
[user message] --> Agent --> [assistant message]
                     |
                     v
              [tool_use block]
                     |
                     v
              Tool Execution
                     |
                     v
              [tool_result block]
                     |
                     v
              Agent continues...
```

## Persistence

### 存储格式

```
.naught/sessions/
├── {session-id}/
│   ├── session.json    # 会话元数据
│   └── messages.jsonl  # 消息历史（JSONL 格式）
```

### session.json

```json
{
  "id": "session-id",
  "status": "idle",
  "cwd": "/path/to/project",
  "agentType": "build",
  "createdAt": 1234567890,
  "updatedAt": 1234567890,
  "usage": {
    "inputTokens": 1000,
    "outputTokens": 500
  }
}
```

## Error Handling

| 错误场景 | 处理方式 |
|---------|---------|
| Session 不存在 | 抛出 Error |
| 持久化失败 | 抛出 Error，状态回滚 |
| 加载失败 | 抛出 Error |
| 状态转换非法 | 抛出 Error |
