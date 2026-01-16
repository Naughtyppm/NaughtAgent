# 并行任务系统规格

> Phase 6.4: 多任务同时执行

## 1. 概述

### 1.1 目标

让 Daemon 支持多个任务同时执行，提升效率：
- 不同会话的任务可以并行
- 同一会话的任务顺序执行（保证上下文一致性）
- 支持任务优先级和取消

### 1.2 场景

```
用户 A (VS Code)                用户 B (CLI)
    │                              │
    ▼                              ▼
┌─────────────────────────────────────────────┐
│              Task Queue                      │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐           │
│  │ T1  │ │ T2  │ │ T3  │ │ T4  │           │
│  │sess1│ │sess2│ │sess1│ │sess3│           │
│  └─────┘ └─────┘ └─────┘ └─────┘           │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│              Worker Pool (3 workers)         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Worker1 │ │ Worker2 │ │ Worker3 │       │
│  │  T1     │ │  T2     │ │  T4     │       │
│  │ (sess1) │ │ (sess2) │ │ (sess3) │       │
│  └─────────┘ └─────────┘ └─────────┘       │
│                                             │
│  T3 等待 T1 完成（同一会话）                  │
└─────────────────────────────────────────────┘
```

## 2. 类型定义

### 2.1 任务

```typescript
/**
 * 任务状态
 */
type TaskStatus =
  | "queued"      // 排队中
  | "running"     // 执行中
  | "completed"   // 已完成
  | "failed"      // 失败
  | "cancelled"   // 已取消

/**
 * 任务优先级
 */
type TaskPriority =
  | "high"        // 高优先级（用户交互）
  | "normal"      // 普通（默认）
  | "low"         // 低优先级（后台任务）

/**
 * 任务类型
 */
type TaskType =
  | "message"     // 用户消息
  | "skill"       // 技能执行
  | "background"  // 后台任务

/**
 * 任务定义
 */
interface Task {
  /** 任务 ID */
  id: string

  /** 关联的会话 ID */
  sessionId: string

  /** 任务类型 */
  type: TaskType

  /** 优先级 */
  priority: TaskPriority

  /** 状态 */
  status: TaskStatus

  /** 创建时间 */
  createdAt: number

  /** 开始执行时间 */
  startedAt?: number

  /** 完成时间 */
  completedAt?: number

  /** 任务输入 */
  input: {
    message?: string
    skill?: string
    args?: Record<string, unknown>
  }

  /** 执行结果 */
  result?: {
    success: boolean
    output?: string
    error?: string
    usage?: {
      inputTokens: number
      outputTokens: number
    }
  }

  /** 中止控制器 */
  abortController?: AbortController

  /** 进度回调 */
  onProgress?: (event: TaskProgressEvent) => void
}

/**
 * 任务进度事件
 */
type TaskProgressEvent =
  | { type: "started" }
  | { type: "text"; content: string }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | { type: "tool_end"; id: string; output: string; isError?: boolean }
  | { type: "completed"; result: Task["result"] }
  | { type: "failed"; error: string }
  | { type: "cancelled" }
```

### 2.2 任务队列

```typescript
/**
 * 任务队列配置
 */
interface TaskQueueConfig {
  /** 最大队列长度 */
  maxQueueSize: number  // 默认 100

  /** 任务超时时间（毫秒） */
  taskTimeout: number   // 默认 300000 (5分钟)
}

/**
 * 任务队列接口
 */
interface TaskQueue {
  /** 添加任务 */
  enqueue(task: Task): boolean

  /** 获取下一个可执行的任务 */
  dequeue(): Task | null

  /** 获取任务 */
  getTask(taskId: string): Task | null

  /** 取消任务 */
  cancel(taskId: string): boolean

  /** 获取队列状态 */
  getStats(): {
    queued: number
    running: number
    completed: number
    failed: number
    cancelled: number
  }

  /** 获取会话的任务列表 */
  getSessionTasks(sessionId: string): Task[]

  /** 清理已完成的任务 */
  cleanup(maxAge: number): number
}
```

### 2.3 Worker Pool

```typescript
/**
 * Worker Pool 配置
 */
interface WorkerPoolConfig {
  /** 最大并行数 */
  maxWorkers: number  // 默认 3

  /** 每个会话最大并行数 */
  maxWorkersPerSession: number  // 默认 1
}

/**
 * Worker 状态
 */
interface WorkerStatus {
  id: string
  busy: boolean
  currentTask?: string
  sessionId?: string
  startedAt?: number
}

/**
 * Worker Pool 接口
 */
interface WorkerPool {
  /** 启动 */
  start(): void

  /** 停止 */
  stop(): Promise<void>

  /** 获取活跃 worker 数 */
  getActiveCount(): number

  /** 获取所有 worker 状态 */
  getWorkerStatus(): WorkerStatus[]

  /** 检查会话是否有运行中的任务 */
  isSessionBusy(sessionId: string): boolean
}
```

## 3. 调度策略

### 3.1 优先级规则

```
1. 高优先级任务优先执行
2. 同优先级按创建时间排序（FIFO）
3. 同一会话的任务必须顺序执行
```

### 3.2 会话锁

```typescript
/**
 * 会话锁管理
 *
 * 确保同一会话的任务顺序执行
 */
interface SessionLock {
  /** 尝试获取锁 */
  tryAcquire(sessionId: string, taskId: string): boolean

  /** 释放锁 */
  release(sessionId: string, taskId: string): void

  /** 检查会话是否被锁定 */
  isLocked(sessionId: string): boolean

  /** 获取锁定该会话的任务 ID */
  getLockedBy(sessionId: string): string | null
}
```

### 3.3 调度流程

```
1. 任务入队
   │
   ▼
2. 检查队列是否已满
   │
   ├─ 满 → 拒绝任务
   │
   └─ 未满 → 加入队列
         │
         ▼
3. 调度器检查空闲 worker
   │
   ├─ 无空闲 → 等待
   │
   └─ 有空闲 → 选择任务
         │
         ▼
4. 选择任务（按优先级）
   │
   ├─ 检查会话锁
   │   │
   │   ├─ 已锁定 → 跳过，选下一个
   │   │
   │   └─ 未锁定 → 获取锁，执行
   │
   ▼
5. Worker 执行任务
   │
   ├─ 成功 → 释放锁，标记完成
   │
   ├─ 失败 → 释放锁，标记失败
   │
   └─ 取消 → 释放锁，标记取消
```

## 4. API 设计

### 4.1 HTTP API

```typescript
// 创建任务
POST /tasks
Body: {
  sessionId: string
  type: TaskType
  priority?: TaskPriority
  input: {
    message?: string
    skill?: string
    args?: Record<string, unknown>
  }
}
Response: {
  id: string
  status: TaskStatus
  position: number  // 队列位置
}

// 获取任务
GET /tasks/:id
Response: Task

// 取消任务
POST /tasks/:id/cancel
Response: { success: boolean }

// 列出任务
GET /tasks
Query: {
  sessionId?: string
  status?: TaskStatus
  limit?: number
}
Response: { tasks: Task[] }

// 获取队列状态
GET /tasks/stats
Response: {
  queued: number
  running: number
  completed: number
  workers: WorkerStatus[]
}
```

### 4.2 WebSocket 事件

```typescript
// 任务状态变更
{
  type: "task_status",
  taskId: string,
  status: TaskStatus,
  position?: number  // 队列位置（仅 queued 状态）
}

// 任务进度
{
  type: "task_progress",
  taskId: string,
  event: TaskProgressEvent
}
```

## 5. 实现模块

### 5.1 文件结构

```
src/daemon/
├── task/
│   ├── types.ts        # 类型定义
│   ├── queue.ts        # 任务队列
│   ├── pool.ts         # Worker Pool
│   ├── scheduler.ts    # 调度器
│   ├── lock.ts         # 会话锁
│   └── index.ts        # 导出
```

### 5.2 模块职责

| 模块 | 职责 |
|------|------|
| `types.ts` | 任务、队列、Worker 类型定义 |
| `queue.ts` | 优先级队列实现，任务存储 |
| `pool.ts` | Worker 管理，任务执行 |
| `scheduler.ts` | 调度逻辑，任务分配 |
| `lock.ts` | 会话锁，保证顺序执行 |

## 6. 配置

```typescript
interface TaskSystemConfig {
  /** 队列配置 */
  queue: {
    maxSize: number           // 默认 100
    taskTimeout: number       // 默认 300000 (5分钟)
    cleanupInterval: number   // 默认 60000 (1分钟)
    maxTaskAge: number        // 默认 3600000 (1小时)
  }

  /** Worker Pool 配置 */
  pool: {
    maxWorkers: number              // 默认 3
    maxWorkersPerSession: number    // 默认 1
  }
}
```

## 7. 错误处理

### 7.1 错误类型

```typescript
type TaskError =
  | { code: "QUEUE_FULL"; message: string }
  | { code: "TASK_NOT_FOUND"; message: string }
  | { code: "TASK_ALREADY_RUNNING"; message: string }
  | { code: "TASK_TIMEOUT"; message: string }
  | { code: "TASK_CANCELLED"; message: string }
  | { code: "SESSION_NOT_FOUND"; message: string }
```

### 7.2 超时处理

```
任务执行超过 taskTimeout:
1. 发送中止信号
2. 等待 5 秒优雅关闭
3. 强制终止
4. 标记为失败
5. 释放会话锁
```

## 8. 监控指标

```typescript
interface TaskMetrics {
  /** 队列长度 */
  queueLength: number

  /** 活跃 worker 数 */
  activeWorkers: number

  /** 平均等待时间（毫秒） */
  avgWaitTime: number

  /** 平均执行时间（毫秒） */
  avgExecutionTime: number

  /** 任务成功率 */
  successRate: number

  /** 每分钟任务数 */
  tasksPerMinute: number
}
```

## 9. 使用示例

### 9.1 创建任务

```typescript
const taskManager = createTaskManager(config)

// 创建消息任务
const task = await taskManager.createTask({
  sessionId: "sess-123",
  type: "message",
  priority: "normal",
  input: {
    message: "帮我写一个函数"
  },
  onProgress: (event) => {
    if (event.type === "text") {
      console.log(event.content)
    }
  }
})

console.log(`任务已创建: ${task.id}, 队列位置: ${task.position}`)
```

### 9.2 取消任务

```typescript
const cancelled = await taskManager.cancelTask("task-456")
if (cancelled) {
  console.log("任务已取消")
}
```

### 9.3 查询状态

```typescript
const stats = taskManager.getStats()
console.log(`队列: ${stats.queued}, 运行中: ${stats.running}`)
```

## 10. 开发计划

| 步骤 | 内容 | 依赖 |
|------|------|------|
| 1 | 类型定义 | - |
| 2 | 会话锁 | 1 |
| 3 | 任务队列 | 1, 2 |
| 4 | Worker Pool | 1 |
| 5 | 调度器 | 2, 3, 4 |
| 6 | HTTP API | 5 |
| 7 | WebSocket 集成 | 5, 6 |
| 8 | 测试 | 1-7 |

## 11. 注意事项

1. **内存管理**：定期清理已完成的任务，避免内存泄漏
2. **优雅关闭**：daemon 停止时等待运行中的任务完成
3. **错误隔离**：单个任务失败不影响其他任务
4. **资源限制**：限制队列大小和并行数，防止资源耗尽
