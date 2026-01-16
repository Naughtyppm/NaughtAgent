# Daemon 架构设计规格

> Agent 作为独立后台服务运行，CLI 和 VS Code 都是客户端

## 1. 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                     Agent Daemon (后台服务)                      │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Session Pool│  │ Task Queue  │  │ Worker Pool             │  │
│  │ 会话管理    │  │ 任务队列    │  │ 并行执行                │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    API Layer                             │    │
│  │  HTTP REST + WebSocket + Unix Socket (可选)              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
           ▲                  ▲                  ▲
           │ WebSocket        │ HTTP             │ WebSocket
           │                  │                  │
      ┌────┴────┐        ┌────┴────┐        ┌────┴────┐
      │ VS Code │        │   CLI   │        │ VS Code │
      │ Window 1│        │ Terminal│        │ Window 2│
      └─────────┘        └─────────┘        └─────────┘
```

## 2. 核心设计原则

### 2.1 单一服务实例
- 全局只有一个 Daemon 进程
- 所有客户端共享同一个服务
- 通过 PID 文件防止重复启动

### 2.2 会话共享
- CLI 创建的会话，VS Code 可以继续
- 会话按项目目录（cwd）隔离
- 支持会话列表查询和切换

### 2.3 并行任务
- 多个任务可以同时执行
- 每个任务独立的 Agent Loop
- 资源限制防止过载

### 2.4 优雅降级
- Daemon 未启动时，CLI 自动启动
- Daemon 崩溃时，客户端自动重连
- 支持热重启不丢失会话

---

## 3. Daemon 生命周期

### 3.1 启动方式

```bash
# 方式 1: 显式启动
naughtagent daemon start

# 方式 2: 按需启动（CLI 自动触发）
naughtagent "帮我写个函数"  # 如果 daemon 未运行，自动启动

# 方式 3: 开机自启（可选）
# 通过系统服务管理器配置
```

### 3.2 状态管理

```
~/.naughtagent/
├── daemon.pid          # PID 文件
├── daemon.sock         # Unix Socket (可选，Linux/Mac)
├── daemon.log          # 日志文件
├── config.json         # 全局配置
└── sessions/           # 会话持久化
    ├── session-xxx.json
    └── session-yyy.json
```

### 3.3 生命周期状态

```typescript
type DaemonState =
  | 'starting'    // 启动中
  | 'running'     // 运行中
  | 'stopping'    // 停止中
  | 'stopped';    // 已停止

interface DaemonStatus {
  state: DaemonState;
  pid: number;
  uptime: number;           // 运行时长（秒）
  version: string;
  sessions: number;         // 活跃会话数
  tasks: number;            // 运行中任务数
  memory: number;           // 内存使用（MB）
}
```

---

## 4. 类型定义

### 4.1 Daemon 配置

```typescript
interface DaemonConfig {
  // 网络配置
  host: string;             // 默认 '127.0.0.1'
  port: number;             // 默认 31337

  // 并行配置
  maxSessions: number;      // 最大会话数，默认 10
  maxConcurrentTasks: number; // 最大并行任务数，默认 3

  // 资源限制
  taskTimeout: number;      // 任务超时（ms），默认 300000 (5分钟)
  idleTimeout: number;      // 空闲超时（ms），默认 3600000 (1小时)

  // 日志配置
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logFile: string;          // 日志文件路径

  // 安全配置
  allowedOrigins: string[]; // CORS 允许的来源
  authToken?: string;       // 可选的认证 token
}
```

### 4.2 客户端连接

```typescript
interface ClientConnection {
  id: string;               // 连接 ID
  type: 'cli' | 'vscode' | 'http';
  connectedAt: number;      // 连接时间戳
  sessionId?: string;       // 关联的会话
  metadata: {
    name?: string;          // 客户端名称
    version?: string;       // 客户端版本
    cwd?: string;           // 工作目录
  };
}
```

### 4.3 任务定义

```typescript
interface Task {
  id: string;
  sessionId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: number;         // 优先级，数字越小越优先
  createdAt: number;
  startedAt?: number;
  completedAt?: number;

  // 任务内容
  type: 'message' | 'skill' | 'subtask';
  input: {
    message?: string;
    skill?: string;
    args?: Record<string, unknown>;
  };

  // 执行结果
  result?: {
    success: boolean;
    output?: string;
    error?: string;
    usage?: TokenUsage;
  };
}
```

---

## 5. API 设计

### 5.1 Daemon 管理 API

```typescript
// CLI 命令映射到 API

// 启动 daemon（CLI 本地执行，不是 HTTP）
naughtagent daemon start [--port 31337] [--foreground]

// 停止 daemon
DELETE /daemon
// 或 CLI: naughtagent daemon stop

// 获取状态
GET /daemon/status
Response: DaemonStatus

// 重启
POST /daemon/restart

// 健康检查
GET /health
Response: { status: 'ok', version: string }
```

### 5.2 会话 API

```typescript
// 创建会话
POST /sessions
Body: {
  cwd: string;              // 工作目录
  agentType?: string;       // 默认 'build'
  name?: string;            // 会话名称
}
Response: {
  id: string;
  cwd: string;
  agentType: string;
  createdAt: number;
}

// 列出会话
GET /sessions
Query: { cwd?: string }     // 可选按目录过滤
Response: Session[]

// 获取会话
GET /sessions/:id
Response: Session

// 删除会话
DELETE /sessions/:id

// 获取会话历史
GET /sessions/:id/messages
Response: Message[]
```

### 5.3 消息 API

```typescript
// 发送消息（支持 SSE 流式）
POST /sessions/:id/messages
Body: {
  content: string;
  context?: {               // 可选上下文
    files?: string[];
    selection?: string;
  };
}
Headers: {
  Accept: 'text/event-stream' | 'application/json'
}

// SSE 事件流
event: text
data: {"content": "..."}

event: tool_start
data: {"name": "read", "input": {...}}

event: tool_end
data: {"name": "read", "output": "..."}

event: permission_request
data: {"id": "xxx", "tool": "bash", "input": {...}}

event: done
data: {"usage": {...}}

event: error
data: {"message": "..."}
```

### 5.4 任务 API

```typescript
// 列出任务
GET /tasks
Query: {
  sessionId?: string;
  status?: TaskStatus;
}
Response: Task[]

// 获取任务
GET /tasks/:id
Response: Task

// 取消任务
POST /tasks/:id/cancel
```

### 5.5 WebSocket API

```typescript
// 连接
ws://localhost:31337/ws

// 认证（连接后第一条消息）
→ { type: 'auth', token?: string, clientInfo: ClientConnection['metadata'] }
← { type: 'auth_ok', connectionId: string }

// 订阅会话
→ { type: 'subscribe', sessionId: string }
← { type: 'subscribed', sessionId: string }

// 发送消息
→ { type: 'message', sessionId: string, content: string, context?: {...} }

// 接收事件（同 SSE）
← { type: 'text', content: string }
← { type: 'tool_start', name: string, input: {...} }
← { type: 'tool_end', name: string, output: string }
← { type: 'permission_request', id: string, tool: string, input: {...} }
← { type: 'done', usage: {...} }
← { type: 'error', message: string }

// 响应权限请求
→ { type: 'permission_response', requestId: string, allowed: boolean }

// 心跳
→ { type: 'ping' }
← { type: 'pong' }
```

---

## 6. CLI 改造

### 6.1 命令结构

```bash
naughtagent [options] [prompt]

# 全局选项
--daemon, -d          # 强制使用 daemon 模式（默认）
--standalone, -s      # 独立模式，不使用 daemon
--port <port>         # daemon 端口

# Daemon 管理
naughtagent daemon start [--port] [--foreground]
naughtagent daemon stop
naughtagent daemon status
naughtagent daemon restart

# 会话管理
naughtagent sessions list [--cwd]
naughtagent sessions switch <id>
naughtagent sessions delete <id>

# 正常使用
naughtagent "帮我写个函数"           # 使用当前目录的会话
naughtagent --new "开始新任务"       # 强制新会话
naughtagent --session <id> "继续"    # 指定会话
```

### 6.2 CLI 启动流程

```
用户执行: naughtagent "帮我写个函数"
    │
    ▼
检查 daemon 是否运行
    │
    ├─ 未运行 → 自动启动 daemon（后台）
    │           等待 daemon 就绪
    │
    └─ 已运行 → 继续
    │
    ▼
连接 daemon WebSocket
    │
    ▼
查找当前目录的会话
    │
    ├─ 存在 → 使用现有会话
    │
    └─ 不存在 → 创建新会话
    │
    ▼
发送消息，流式显示响应
    │
    ▼
任务完成，保持连接等待下一条输入
（或 --once 模式直接退出）
```

---

## 7. 并行任务调度

### 7.1 任务队列

```typescript
interface TaskQueue {
  // 添加任务
  enqueue(task: Task): void;

  // 获取下一个任务
  dequeue(): Task | null;

  // 取消任务
  cancel(taskId: string): boolean;

  // 获取队列状态
  getStatus(): {
    queued: number;
    running: number;
    completed: number;
  };
}
```

### 7.2 Worker Pool

```typescript
interface WorkerPool {
  // 配置
  maxWorkers: number;       // 最大并行数

  // 执行任务
  execute(task: Task): Promise<TaskResult>;

  // 获取状态
  getActiveWorkers(): number;

  // 优雅关闭
  shutdown(): Promise<void>;
}
```

### 7.3 调度策略

```
任务优先级:
1. 用户交互任务（最高）- 用户正在等待响应
2. 技能任务（中）- /commit, /review 等
3. 后台任务（低）- 自动分析、索引等

并行限制:
- 同一会话最多 1 个任务运行（保证顺序）
- 不同会话可以并行
- 总并行数不超过 maxConcurrentTasks
```

---

## 8. 错误处理

### 8.1 Daemon 崩溃恢复

```typescript
// 客户端重连逻辑
class DaemonClient {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // 初始延迟 1s

  async connect(): Promise<void> {
    try {
      await this.doConnect();
      this.reconnectAttempts = 0;
    } catch (error) {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        await sleep(delay);
        return this.connect();
      }
      throw new Error('无法连接到 daemon，请检查服务状态');
    }
  }
}
```

### 8.2 会话恢复

```typescript
// Daemon 重启后恢复会话
class SessionRecovery {
  // 从磁盘加载会话
  async loadSessions(): Promise<Session[]>;

  // 恢复运行中的任务（标记为失败或重试）
  async recoverTasks(): Promise<void>;
}
```

### 8.3 错误类型

```typescript
type DaemonError =
  | { code: 'DAEMON_NOT_RUNNING'; message: string }
  | { code: 'CONNECTION_FAILED'; message: string }
  | { code: 'SESSION_NOT_FOUND'; message: string }
  | { code: 'TASK_TIMEOUT'; message: string }
  | { code: 'QUEUE_FULL'; message: string }
  | { code: 'AUTH_FAILED'; message: string };
```

---

## 9. 安全考虑

### 9.1 本地访问限制
- 默认只监听 127.0.0.1
- 可选 Unix Socket（更安全）
- 不暴露到公网

### 9.2 认证（可选）
- 简单 token 认证
- 用于多用户环境

### 9.3 权限隔离
- 每个会话有独立的 cwd
- 工具执行受 cwd 限制
- 敏感操作需要确认

---

## 10. 实现计划

### Phase 6.1: Daemon 基础
- [ ] Daemon 进程管理（启动/停止/状态）
- [ ] PID 文件和锁
- [ ] 基础 HTTP API
- [ ] CLI daemon 子命令

### Phase 6.2: 会话共享
- [ ] 会话持久化
- [ ] 会话列表和切换
- [ ] CLI 会话管理命令

### Phase 6.3: WebSocket 实时通信
- [ ] WebSocket 服务
- [ ] 客户端订阅机制
- [ ] 权限请求交互

### Phase 6.4: 并行任务
- [ ] 任务队列
- [ ] Worker Pool
- [ ] 调度策略

### Phase 6.5: CLI 改造
- [ ] 自动启动 daemon
- [ ] 连接和重连逻辑
- [ ] 交互式模式

### Phase 6.6: VS Code 客户端
- [ ] 连接 daemon
- [ ] 会话选择
- [ ] 实时事件处理

---

## 11. 使用示例

### 11.1 首次使用

```bash
# 安装
npm install -g naughtagent

# 直接使用（自动启动 daemon）
naughtagent "帮我写一个 hello world"

# 查看 daemon 状态
naughtagent daemon status
# 输出:
# Daemon running (PID: 12345)
# Uptime: 5m 30s
# Sessions: 1
# Tasks: 0 running, 0 queued
```

### 11.2 多窗口使用

```bash
# 终端 1
cd ~/project-a
naughtagent "分析这个项目"
# 创建会话 session-001

# 终端 2
cd ~/project-a
naughtagent "继续刚才的分析"
# 自动使用 session-001

# 终端 3
cd ~/project-b
naughtagent "这是另一个项目"
# 创建新会话 session-002
```

### 11.3 VS Code 使用

```
1. 打开 VS Code
2. 插件自动连接 daemon
3. 打开 Chat 面板
4. 选择或创建会话
5. 开始对话
```

---

## 12. 与现有代码的关系

### 需要新增
- `src/daemon/` - Daemon 核心逻辑
  - `daemon.ts` - 进程管理
  - `server.ts` - HTTP + WebSocket 服务
  - `queue.ts` - 任务队列
  - `pool.ts` - Worker Pool

### 需要改造
- `src/cli/cli.ts` - 添加 daemon 子命令
- `src/cli/runner.ts` - 改为连接 daemon
- `src/server/` - 合并到 daemon

### 可复用
- `src/agent/` - Agent Loop 逻辑
- `src/session/` - 会话管理
- `src/tool/` - 工具系统
- `src/provider/` - LLM 调用
