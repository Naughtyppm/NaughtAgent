# Phase 5.2 阶段总结：交互工具

> 完成时间：2026-01-15

## 做了什么

实现了两个交互工具，增强 Agent 与用户的协作能力：

### Question 工具

让 Agent 能够向用户提问，支持四种问题类型：

| 类型 | 说明 | 返回值 |
|------|------|--------|
| confirm | 是/否确认 | boolean |
| select | 单选 | string |
| multiselect | 多选 | string[] |
| text | 文本输入 | string |

```typescript
// 确认
await QuestionTool.execute({
  type: "confirm",
  message: "是否继续执行？",
  default: true
}, ctx)
// 返回: { value: true }

// 单选
await QuestionTool.execute({
  type: "select",
  message: "选择框架：",
  options: [
    { value: "react", label: "React", description: "流行的 UI 库" },
    { value: "vue", label: "Vue" },
  ]
}, ctx)
// 返回: { value: "react" }

// 多选
await QuestionTool.execute({
  type: "multiselect",
  message: "选择要安装的工具：",
  options: [
    { value: "eslint", label: "ESLint" },
    { value: "prettier", label: "Prettier" },
  ]
}, ctx)
// 返回: { value: ["eslint", "prettier"] }

// 文本输入
await QuestionTool.execute({
  type: "text",
  message: "请输入项目名称：",
  default: "my-project"
}, ctx)
// 返回: { value: "awesome-project" }
```

### Todo 工具

让 Agent 能够管理任务列表，展示进度：

| 操作 | 说明 | 参数 |
|------|------|------|
| add | 添加任务 | content, parentId? |
| update | 更新状态 | id, status |
| remove | 删除任务 | id |
| list | 列出任务 | - |
| clear | 清空任务 | - |

```typescript
// 添加任务
await TodoTool.execute({
  action: "add",
  content: "实现用户认证功能"
}, ctx)

// 添加子任务
await TodoTool.execute({
  action: "add",
  content: "设计数据库 schema",
  parentId: "1"
}, ctx)

// 更新状态
await TodoTool.execute({
  action: "update",
  id: "1",
  status: "in_progress"
}, ctx)

// 列出任务
await TodoTool.execute({ action: "list" }, ctx)
// 输出:
// Tasks: 2 total
//   0 completed, 1 in progress, 1 pending
//
// ◐ [1] 实现用户认证功能
//   □ [2] 设计数据库 schema
```

### 回调系统

交互工具通过回调与 UI 层通信：

```typescript
import { setInteractionCallbacks } from "@naughtagent/agent"

setInteractionCallbacks({
  // 问题回调 - CLI/UI 实现用户交互
  onQuestion: async (question) => {
    // 使用 readline 或 inquirer 实现
    const answer = await promptUser(question)
    return { answered: true, value: answer }
  },

  // 任务更新回调 - 实时显示任务状态
  onTodoUpdate: (list) => {
    renderTaskList(list.items)
  }
})
```

## 能干什么

### Question 工具能力

- ✅ 四种问题类型（confirm/select/multiselect/text）
- ✅ 默认值支持
- ✅ 选项描述
- ✅ 取消处理
- ✅ 参数验证

### Todo 工具能力

- ✅ 任务 CRUD 操作
- ✅ 子任务支持
- ✅ 状态追踪（pending/in_progress/completed/cancelled）
- ✅ 按会话隔离
- ✅ 状态图标显示

## 在 Agent 中的作用

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent Loop                              │
│                                                              │
│  用户: "帮我重构这个模块"                                     │
│      │                                                       │
│      ▼                                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ LLM: "我需要先确认几个问题"                          │    │
│  │                                                      │    │
│  │ 调用 question:                                       │    │
│  │ { type: "confirm", message: "保留现有 API 吗？" }    │    │
│  └─────────────────────────────────────────────────────┘    │
│      │                                                       │
│      ▼  用户回答: "是"                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ LLM: "好的，我来分解任务"                            │    │
│  │                                                      │    │
│  │ 调用 todo:                                           │    │
│  │ { action: "add", content: "分析现有代码" }           │    │
│  │ { action: "add", content: "设计新结构" }             │    │
│  │ { action: "add", content: "逐步迁移" }               │    │
│  └─────────────────────────────────────────────────────┘    │
│      │                                                       │
│      ▼  执行任务...                                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 调用 todo:                                           │    │
│  │ { action: "update", id: "1", status: "completed" }   │    │
│  │                                                      │    │
│  │ 遇到问题，调用 question:                             │    │
│  │ { type: "select", message: "发现两种方案，选哪个？"  │    │
│  │   options: [...] }                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 当前整体能力

### 能做什么

1. **完整的 Agent 循环** - 用户输入 → LLM → 工具 → 结果
2. **子任务分解** - Task 工具启动子任务
3. **用户交互** - Question 工具澄清需求
4. **进度展示** - Todo 工具追踪任务状态
5. **权限控制** - 危险操作需确认
6. **上下文感知** - 自动读取项目规则

### 不能做什么

1. **Skills 命令** - 需要 Phase 5.3 实现 /commit 等
2. **Rules 索引** - 需要 Phase 5.4 实现按需加载
3. **HTTP API** - 需要 Phase 5.5 实现

## 测试覆盖率

| 模块 | 语句 | 分支 | 函数 | 测试数 |
|------|------|------|------|--------|
| callbacks.ts | 63.63% | 57.89% | 80% | 12 |
| question.ts | 92.10% | 92.10% | 100% | 18 |
| todo.ts | 97.05% | 94.87% | 94.73% | 24 |

**总计：54 个测试，89.59% 覆盖率**

## 文件清单

```
packages/agent/src/interaction/
├── types.ts        # 类型定义
├── callbacks.ts    # 回调管理
├── question.ts     # Question 工具
├── todo.ts         # Todo 工具
└── index.ts        # 导出

packages/agent/test/interaction/
├── callbacks.test.ts
├── question.test.ts
└── todo.test.ts

.spec/sdd/interfaces/
└── interaction.spec.md  # 规格文档
```

## 下一步

Phase 5.3 Skills 技能系统：
- Skill 定义和执行器
- /commit - 生成 commit 消息
- /pr - 生成 PR 描述
- /review - 代码审查
