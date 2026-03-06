# 项目结构

```
naughtyagent/
├── packages/
│   ├── agent/              # 核心 Agent 服务
│   │   ├── src/
│   │   │   ├── agent/      # Agent 定义、循环、提示词
│   │   │   ├── cli/        # CLI 接口、REPL、daemon 客户端
│   │   │   ├── context/    # 上下文管理
│   │   │   ├── daemon/     # 后台服务（池、队列、调度器）
│   │   │   ├── interaction/# 用户交互（问题、回调）
│   │   │   ├── mcp/        # Model Context Protocol 客户端
│   │   │   ├── permission/ # 权限系统
│   │   │   ├── provider/   # LLM 提供者（Anthropic、OpenAI、Kiro）
│   │   │   ├── rules/      # 规则加载与匹配
│   │   │   ├── security/   # 安全检查
│   │   │   ├── server/     # HTTP/WebSocket 服务器
│   │   │   ├── session/    # 会话管理、存储
│   │   │   ├── skill/      # 技能系统（内置技能）
│   │   │   ├── subtask/    # 子任务执行、工作流
│   │   │   ├── token/      # Token 计数
│   │   │   ├── tool/       # 工具（read、write、edit、bash、glob、grep）
│   │   │   └── ux/         # 输出格式化、diff 展示
│   │   └── test/           # 测试目录，镜像 src/ 结构
│   │
│   └── vscode/             # VS Code 扩展
│       └── src/
│           ├── commands/   # VS Code 命令
│           ├── services/   # 扩展服务
│           └── views/      # Webview 提供者
│
├── .kiro/
│   ├── specs/              # 功能规格文档
│   └── steering/           # AI 引导规则
```

## 模块约定

- 每个模块有 `index.ts` 桶导出
- 类型定义在模块内的 `types.ts` 中
- 测试在 `test/` 目录，镜像 `src/` 结构

## 关键文件

- `packages/agent/src/agent/agent.ts` - Agent 定义和类型
- `packages/agent/src/tool/tool.ts` - 工具系统核心（namespace 模式）
- `packages/agent/src/provider/types.ts` - LLM 提供者接口
- `packages/agent/src/session/session.ts` - 会话类型和管理

## 代码模式

### 工具定义
工具使用 `Tool.define()` 模式配合 Zod schema：
```typescript
export const myTool = Tool.define({
  id: "my-tool",
  description: "给 LLM 看的工具描述",
  parameters: z.object({ ... }),
  execute: async (params, ctx) => { ... }
})
```

### Provider 接口
LLM 提供者实现 `LLMProvider` 接口，包含 `stream()` 和 `chat()` 方法。

### Agent 事件
Agent 发出类型化事件：`text`、`tool_start`、`tool_end`、`error`、`done`。
