# Phase 4 总结：交互能力

> 完成时间：2026-01-15

## 做了什么

### 1. CLI 命令行入口

实现了完整的命令行工具，用户可以直接在终端使用 Agent：

```bash
# 基本用法
naughtagent "帮我创建一个 hello.ts 文件"

# 指定 Agent 类型
naughtagent --agent plan "分析这个项目的架构"

# 自动确认所有操作
naughtagent -y "运行测试"

# 指定工作目录
naughtagent --cwd /path/to/project "查找所有 TODO"
```

**实现文件：**
- `src/cli/cli.ts` - CLI 入口，参数解析，输出格式化
- `src/cli/runner.ts` - Agent 执行封装，权限集成

### 2. Permission 权限系统

实现了完整的权限控制系统，保护用户免受危险操作：

```typescript
// 权限类型
type PermissionType = "read" | "write" | "edit" | "bash" | "glob" | "grep"

// 权限动作
type PermissionAction = "allow" | "deny" | "ask"

// 权限规则示例
{
  type: "bash",
  action: "deny",
  pattern: "rm -rf *"  // 危险命令直接拒绝
}
```

**实现文件：**
- `src/permission/permission.ts` - 权限定义、检查、执行

### 3. Runner 执行器

封装了 Agent Loop，添加权限检查和用户确认：

```typescript
const runner = createRunner({
  apiKey: 'your-api-key',
  agentType: 'build',
  onConfirm: async (request) => {
    // 用户确认逻辑
    return await askUser(request.description)
  }
})

await runner.run("帮我写个函数", {
  onText: (content) => console.log(content),
  onToolStart: (id, name, input) => console.log(`执行 ${name}...`),
  onDone: (usage) => console.log(`Token: ${usage.inputTokens}`)
})
```

## 能干什么

### CLI 命令行

| 功能 | 说明 |
|------|------|
| 参数解析 | --agent, --cwd, --yes, --help, --version |
| Agent 选择 | build（默认）、plan、explore |
| 自动确认 | -y 跳过所有确认 |
| 输出格式化 | 工具调用、结果、Token 统计 |

### Permission 权限

| 功能 | 说明 |
|------|------|
| 三种动作 | allow（允许）、deny（拒绝）、ask（询问） |
| glob 匹配 | 支持 `**/*.ts`、`**/secret*` 等模式 |
| 默认权限 | 按 Agent 类型预设（build/plan/explore） |
| 用户确认 | ask 动作时调用回调询问用户 |

### 默认权限配置

**build Agent（全功能）：**
- 读取：默认允许，敏感文件（.env, secret）需确认
- 写入/编辑：需确认
- 命令：危险命令（rm -rf, sudo）拒绝，其他需确认
- 搜索：允许

**plan Agent（只读）：**
- 读取/搜索：允许
- 写入/编辑/命令：拒绝

**explore Agent（探索）：**
- 读取/搜索：允许
- 其他：拒绝

## 在 Agent 中的作用

```
用户输入
    │
    ▼
┌─────────────────────────────────────────────┐
│                   CLI                        │
│  - 解析参数                                   │
│  - 创建 Runner                               │
│  - 格式化输出                                 │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│                 Runner                       │
│  - 注册工具                                   │
│  - 创建 Provider                             │
│  - 管理会话                                   │
│  - 处理事件                                   │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│              Permission                      │
│  - 检查权限                                   │
│  - 匹配规则                                   │
│  - 用户确认                                   │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│              Agent Loop                      │
│  - LLM 调用                                   │
│  - 工具执行                                   │
│  - 结果处理                                   │
└─────────────────────────────────────────────┘
```

**CLI** 是用户与 Agent 交互的入口，负责：
1. 接收用户输入（命令行参数）
2. 配置 Agent（类型、工作目录、权限）
3. 展示执行过程（工具调用、结果、统计）

**Permission** 是安全守门员，负责：
1. 在工具执行前检查权限
2. 根据规则决定 allow/deny/ask
3. 需要时询问用户确认

**Runner** 是执行协调者，负责：
1. 组装所有组件（Provider、Session、Tools）
2. 运行 Agent Loop
3. 处理事件并分发给 CLI 展示

## 当前整体能力

### 能做什么

| 能力 | 说明 |
|------|------|
| ✅ 命令行使用 | `naughtagent "你的问题"` |
| ✅ 多 Agent 支持 | build、plan、explore |
| ✅ 文件操作 | 读、写、编辑、搜索 |
| ✅ 命令执行 | bash 命令 |
| ✅ 权限控制 | 危险操作需确认 |
| ✅ 会话管理 | 多轮对话、持久化 |
| ✅ Token 统计 | 输入/输出 token 计数 |

### 不能做什么

| 能力 | 说明 |
|------|------|
| ❌ HTTP API | 无法供其他程序调用 |
| ❌ WebSocket | 无实时通信 |
| ❌ MCP 协议 | 无法连接外部工具 |
| ❌ Skills 技能 | 无 /commit、/pr 等快捷命令 |
| ❌ 子 Agent | 无法分解复杂任务 |

## 测试覆盖

| 模块 | 测试文件 | 用例数 | 覆盖率 |
|------|---------|--------|--------|
| CLI | `test/cli/cli.test.ts` | 25 | 47.82% (main难测) |
| Runner | `test/cli/runner.test.ts` | 30 | 98.18% |
| Permission | `test/permission/permission.test.ts` | 16 | 100% |

**总计：71 个测试用例**

## 下一步建议

### Phase 5: 扩展能力

按优先级排序：

1. **HTTP Server** - 供 VS Code 插件调用
   - Hono 框架
   - REST API
   - WebSocket 实时通信

2. **MCP 协议** - 连接外部工具
   - MCP Client
   - 动态加载工具

3. **Skills 技能** - 快捷命令
   - /commit - 生成提交
   - /pr - 创建 PR
   - 自定义技能

4. **交互工具** - 增强能力
   - task - 子 Agent
   - question - 向用户提问
   - todo - 任务管理

## 文件清单

```
packages/agent/src/
├── cli/
│   ├── cli.ts          # CLI 入口
│   ├── runner.ts       # Agent 执行器
│   └── index.ts        # 模块导出
└── permission/
    ├── permission.ts   # 权限系统
    └── index.ts        # 模块导出

packages/agent/test/
├── cli/
│   ├── cli.test.ts     # CLI 测试
│   └── runner.test.ts  # Runner 测试
└── permission/
    └── permission.test.ts  # 权限测试
```
