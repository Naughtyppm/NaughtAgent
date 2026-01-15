# Interface Spec: Interactive Tools

> Phase 5.2 交互工具 - question 和 todo

## 概述

交互工具让 Agent 能够与用户进行更丰富的交互：

| 工具 | 用途 | 场景 |
|------|------|------|
| **question** | 向用户提问 | 澄清需求、确认选项、获取输入 |
| **todo** | 任务管理 | 展示进度、分解任务、追踪状态 |

---

## 1. Question 工具

### 1.1 Types

```typescript
/**
 * 问题类型
 */
type QuestionType = "confirm" | "select" | "multiselect" | "text"

/**
 * 选项定义
 */
interface QuestionOption {
  /** 选项值 */
  value: string
  /** 显示标签 */
  label: string
  /** 描述（可选） */
  description?: string
  /** 是否默认选中 */
  default?: boolean
}

/**
 * 问题定义
 */
interface Question {
  /** 问题类型 */
  type: QuestionType
  /** 问题文本 */
  message: string
  /** 选项（select/multiselect 时必需） */
  options?: QuestionOption[]
  /** 默认值 */
  default?: string | boolean | string[]
  /** 是否必填 */
  required?: boolean
  /** 验证函数 */
  validate?: (value: unknown) => boolean | string
}

/**
 * 问题结果
 */
interface QuestionResult {
  /** 是否已回答 */
  answered: boolean
  /** 回答值 */
  value: string | boolean | string[] | null
  /** 是否取消 */
  cancelled?: boolean
}

/**
 * Question 工具参数
 */
interface QuestionParams {
  /** 问题类型 */
  type: QuestionType
  /** 问题文本 */
  message: string
  /** 选项（select/multiselect） */
  options?: Array<{ value: string; label: string; description?: string }>
  /** 默认值 */
  default?: string | boolean | string[]
}
```

### 1.2 问题类型

#### confirm - 是/否确认

```typescript
// Agent 调用
{
  type: "confirm",
  message: "是否继续执行？",
  default: true
}

// 用户看到
是否继续执行？ [Y/n]

// 返回
{ answered: true, value: true }
```

#### select - 单选

```typescript
// Agent 调用
{
  type: "select",
  message: "选择一个选项：",
  options: [
    { value: "a", label: "选项 A", description: "这是选项 A" },
    { value: "b", label: "选项 B" },
    { value: "c", label: "选项 C" }
  ],
  default: "a"
}

// 用户看到
选择一个选项：
  ● 选项 A - 这是选项 A
  ○ 选项 B
  ○ 选项 C

// 返回
{ answered: true, value: "a" }
```

#### multiselect - 多选

```typescript
// Agent 调用
{
  type: "multiselect",
  message: "选择要安装的依赖：",
  options: [
    { value: "typescript", label: "TypeScript" },
    { value: "eslint", label: "ESLint" },
    { value: "prettier", label: "Prettier" }
  ],
  default: ["typescript"]
}

// 用户看到
选择要安装的依赖：
  ☑ TypeScript
  ☐ ESLint
  ☐ Prettier

// 返回
{ answered: true, value: ["typescript", "eslint"] }
```

#### text - 文本输入

```typescript
// Agent 调用
{
  type: "text",
  message: "请输入项目名称：",
  default: "my-project"
}

// 用户看到
请输入项目名称： [my-project]

// 返回
{ answered: true, value: "awesome-project" }
```

### 1.3 Contracts

#### 前置条件

1. `type` 必须是有效的 QuestionType
2. `message` 必须非空
3. `select`/`multiselect` 类型必须提供 `options`
4. `options` 至少有一个选项

#### 后置条件

1. 返回 `QuestionResult`
2. 用户取消时 `cancelled: true`
3. 超时时 `answered: false`

### 1.4 回调机制

Question 工具需要与 UI 层交互，通过回调实现：

```typescript
/**
 * 问题回调
 */
type QuestionCallback = (question: Question) => Promise<QuestionResult>

/**
 * 设置问题回调
 */
function setQuestionCallback(callback: QuestionCallback): void
```

---

## 2. Todo 工具

### 2.1 Types

```typescript
/**
 * 任务状态
 */
type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled"

/**
 * 任务项
 */
interface TodoItem {
  /** 任务 ID */
  id: string
  /** 任务内容 */
  content: string
  /** 状态 */
  status: TodoStatus
  /** 父任务 ID（子任务时） */
  parentId?: string
  /** 创建时间 */
  createdAt: number
  /** 更新时间 */
  updatedAt: number
}

/**
 * 任务列表
 */
interface TodoList {
  /** 会话 ID */
  sessionId: string
  /** 任务列表 */
  items: TodoItem[]
}

/**
 * Todo 工具参数
 */
interface TodoParams {
  /** 操作类型 */
  action: "add" | "update" | "remove" | "list" | "clear"
  /** 任务内容（add 时） */
  content?: string
  /** 任务 ID（update/remove 时） */
  id?: string
  /** 新状态（update 时） */
  status?: TodoStatus
  /** 父任务 ID（add 子任务时） */
  parentId?: string
}

/**
 * Todo 工具结果
 */
interface TodoResult {
  /** 是否成功 */
  success: boolean
  /** 操作的任务 */
  item?: TodoItem
  /** 任务列表（list 时） */
  items?: TodoItem[]
  /** 消息 */
  message: string
}
```

### 2.2 操作类型

#### add - 添加任务

```typescript
// Agent 调用
{
  action: "add",
  content: "实现用户认证功能"
}

// 返回
{
  success: true,
  item: { id: "1", content: "实现用户认证功能", status: "pending", ... },
  message: "Added task: 实现用户认证功能"
}
```

#### update - 更新状态

```typescript
// Agent 调用
{
  action: "update",
  id: "1",
  status: "completed"
}

// 返回
{
  success: true,
  item: { id: "1", content: "实现用户认证功能", status: "completed", ... },
  message: "Updated task 1: completed"
}
```

#### remove - 删除任务

```typescript
// Agent 调用
{
  action: "remove",
  id: "1"
}

// 返回
{
  success: true,
  message: "Removed task 1"
}
```

#### list - 列出任务

```typescript
// Agent 调用
{
  action: "list"
}

// 返回
{
  success: true,
  items: [...],
  message: "3 tasks (1 completed, 2 pending)"
}
```

#### clear - 清空任务

```typescript
// Agent 调用
{
  action: "clear"
}

// 返回
{
  success: true,
  message: "Cleared all tasks"
}
```

### 2.3 子任务支持

```typescript
// 添加子任务
{
  action: "add",
  content: "设计数据库 schema",
  parentId: "1"  // 父任务 ID
}

// 任务树展示
□ 实现用户认证功能
  ✓ 设计数据库 schema
  □ 实现注册接口
  □ 实现登录接口
```

### 2.4 Contracts

#### 前置条件

1. `action` 必须是有效的操作类型
2. `add` 操作必须提供 `content`
3. `update`/`remove` 操作必须提供 `id`
4. `update` 操作必须提供 `status`

#### 后置条件

1. 返回 `TodoResult`
2. 任务 ID 自动生成
3. 时间戳自动设置

### 2.5 存储

Todo 列表按会话存储，会话结束后可选持久化：

```typescript
/**
 * Todo 存储接口
 */
interface TodoStorage {
  /** 获取任务列表 */
  get(sessionId: string): TodoList | undefined
  /** 保存任务列表 */
  save(list: TodoList): void
  /** 删除任务列表 */
  delete(sessionId: string): void
}
```

---

## 3. 回调系统

交互工具需要与 UI 层通信，通过回调系统实现：

```typescript
/**
 * 交互回调
 */
interface InteractionCallbacks {
  /** 问题回调 */
  onQuestion?: (question: Question) => Promise<QuestionResult>
  /** 任务更新回调 */
  onTodoUpdate?: (list: TodoList) => void
}

/**
 * 设置交互回调
 */
function setInteractionCallbacks(callbacks: InteractionCallbacks): void
```

### CLI 实现示例

```typescript
setInteractionCallbacks({
  onQuestion: async (question) => {
    // 使用 readline 或 inquirer 实现
    if (question.type === "confirm") {
      const answer = await readline.question(`${question.message} [Y/n] `)
      return { answered: true, value: answer !== "n" }
    }
    // ...
  },
  onTodoUpdate: (list) => {
    // 打印任务列表
    console.log("\n📋 Tasks:")
    for (const item of list.items) {
      const icon = item.status === "completed" ? "✓" : "□"
      console.log(`  ${icon} ${item.content}`)
    }
  }
})
```

---

## 4. 文件结构

```
src/
├── interaction/
│   ├── index.ts        # 导出
│   ├── question.ts     # Question 工具
│   ├── todo.ts         # Todo 工具
│   ├── callbacks.ts    # 回调管理
│   └── storage.ts      # Todo 存储
```

---

## 5. 与 Agent 集成

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent Loop                              │
│                                                              │
│  用户输入: "帮我重构这个模块"                                  │
│      │                                                       │
│      ▼                                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ LLM: "我需要先确认几个问题"                          │    │
│  │                                                      │    │
│  │ 调用 question 工具:                                  │    │
│  │ { type: "confirm", message: "保留现有 API 吗？" }    │    │
│  └─────────────────────────────────────────────────────┘    │
│      │                                                       │
│      ▼                                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 用户回答: "是"                                       │    │
│  └─────────────────────────────────────────────────────┘    │
│      │                                                       │
│      ▼                                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ LLM: "好的，我来分解任务"                            │    │
│  │                                                      │    │
│  │ 调用 todo 工具:                                      │    │
│  │ { action: "add", content: "分析现有代码" }           │    │
│  │ { action: "add", content: "设计新结构" }             │    │
│  │ { action: "add", content: "逐步迁移" }               │    │
│  └─────────────────────────────────────────────────────┘    │
│      │                                                       │
│      ▼                                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 执行任务，更新状态...                                │    │
│  │                                                      │    │
│  │ 调用 todo 工具:                                      │    │
│  │ { action: "update", id: "1", status: "completed" }   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```
