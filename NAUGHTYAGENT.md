# NaughtyAgent 使用指南

NaughtyAgent (淘气助手) 是一个智能编程助手，类似于 Claude Code，但具有更灵活的模式和本地化特性。

## 🎯 核心能力

### 三种工作模式

**🔨 Build 模式** - 全功能编程助手
- ✅ 读取和分析代码
- ✅ 编写和修改文件  
- ✅ 执行命令和脚本
- ✅ 搜索文件和内容
- 💡 适合：日常开发、bug修复、功能实现

**📋 Plan 模式** - 架构师和规划师
- ✅ 分析代码结构和架构
- ✅ 制定详细的执行计划
- ✅ 生成 plan.md 文档
- ❌ 不执行实际修改
- 💡 适合：项目规划、架构设计、代码审查

**🔍 Explore 模式** - 代码侦探
- ✅ 快速搜索和定位代码
- ✅ 分析项目结构
- ✅ 回答代码相关问题
- ❌ 只读，不修改任何文件
- 💡 适合：代码学习、快速查找、理解项目

## 🚀 快速开始

### 安装和启动

```bash
# 克隆项目
git clone <repository-url>
cd NaughtAgent

# 安装依赖
pnpm install

# 构建项目
just build

# 启动不同模式
just agent-build    # Build 模式
just agent-plan     # Plan 模式  
just agent-explore  # Explore 模式

# 或者直接使用 CLI
node dist/cli/cli.js --agent build "帮我创建一个新功能"
node dist/cli/cli.js --agent plan "分析这个项目的架构"
node dist/cli/cli.js --agent explore "找到所有的配置文件"
```

### VS Code 扩展

```bash
# 安装 VS Code 扩展
cd packages/vscode
pnpm install
pnpm build

# 在 VS Code 中加载扩展
# 1. 打开 VS Code
# 2. 按 F5 启动扩展开发模式
# 3. 在新窗口中使用 NaughtyAgent
```

## 💬 使用方式

### 命令行交互

```bash
# 交互式模式
just repl

# 单次对话
just start "帮我重构这个函数"

# 指定工作目录
node dist/cli/cli.js --cwd /path/to/project --agent build "分析项目结构"
```

### 常用对话示例

**代码分析**
```
"分析这个项目的架构"
"找到所有的 TypeScript 配置文件"
"这个函数是做什么的？"
```

**代码修改**
```
"帮我重构这个组件，使其更易维护"
"添加错误处理到这个 API 调用"
"优化这个查询的性能"
```

**项目管理**
```
"创建一个新的功能模块"
"更新项目的依赖"
"生成项目文档"
```

## 🛠️ 高级功能

### 工具系统

NaughtyAgent 内置了丰富的工具：

- **read**: 读取文件内容
- **write**: 创建或覆写文件
- **edit**: 精确编辑文件的特定部分
- **bash**: 执行 shell 命令
- **glob**: 使用模式匹配查找文件
- **grep**: 在文件中搜索内容

### MCP 协议支持

支持 Model Context Protocol，可以集成外部工具和服务：

```bash
# 启动 MCP 服务器
cd packages/iterative-probe-mcp
npm start

# NaughtyAgent 会自动发现并连接 MCP 服务
```

### 会话管理

```bash
# 查看所有会话
just sessions list

# 删除特定会话
just sessions delete <session-id>

# 会话会自动保存，支持多轮对话
```

## ⚙️ 配置

### 环境变量

创建 `.env` 文件或在 `~/.naughtyagent/.env` 中配置：

```bash
# Anthropic API (推荐)
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
ANTHROPIC_BASE_URL=https://api.anthropic.com  # 可选

# OpenAI 兼容 API (备用)
OPENAI_API_KEY=sk-your-openai-key
OPENAI_BASE_URL=https://api.openai.com/v1

# Kiro 代理 (如果使用)
ANTHROPIC_API_KEY=kiro-proxy
ANTHROPIC_BASE_URL=http://127.0.0.1:8080
```

### 模型选择

```bash
# 使用不同模型
node dist/cli/cli.js --model claude-sonnet-4-20250514 "你的问题"
node dist/cli/cli.js --model claude-opus-4-20250514 "复杂任务"
node dist/cli/cli.js --model claude-haiku-4-20250514 "简单查询"

# 也可以使用简写（会自动映射）
node dist/cli/cli.js --model sonnet "你的问题"
node dist/cli/cli.js --model opus "复杂任务"
node dist/cli/cli.js --model haiku "简单查询"
```

## 🎨 个性特点

### 自然对话风格
- 🗣️ 自然对话，不机械化
- 🎭 有个性，可以幽默风趣
- 🌍 自动匹配用户语言
- 💡 理解意图，不只是执行命令

### 智能工作方式
- 📖 修改前先阅读理解代码
- 🎯 做最小化、聚焦的修改
- 🔍 跨平台兼容性处理
- ⚡ 优先使用内置工具而非 shell 命令

### 安全特性
- 🛡️ 危险操作前会提醒
- 🔒 支持权限确认机制
- 📝 详细的操作日志
- 🔄 优先可逆操作

## 🆚 与其他工具对比

| 特性 | NaughtyAgent | Claude Code | Cursor | GitHub Copilot |
|------|-------------|-------------|---------|----------------|
| 本地部署 | ✅ | ❌ | ❌ | ❌ |
| 多模式 | ✅ (3种) | ❌ | ❌ | ❌ |
| CLI 支持 | ✅ | ❌ | ❌ | ❌ |
| MCP 协议 | ✅ | ❌ | ❌ | ❌ |
| 开源 | ✅ | ❌ | ❌ | ❌ |
| 自定义 | ✅ | ❌ | 部分 | ❌ |

## 🔧 开发和扩展

### 添加新工具

```typescript
// 在 src/tool/ 目录下创建新工具
export const myTool: ToolDefinition = {
  name: "my_tool",
  description: "我的自定义工具",
  parameters: z.object({
    input: z.string().describe("输入参数")
  }),
  execute: async (params) => {
    // 工具逻辑
    return "执行结果"
  }
}
```

### 自定义 Agent 模式

```typescript
// 在 src/agent/prompt.ts 中添加新模式
const CUSTOM_PROMPT = `${BASE_PROMPT}
## Your Role (Custom Mode)
你的自定义角色描述...
`
```

## 📚 更多资源

- **项目文档**: [docs/](docs/)
- **API 参考**: [docs/api/](docs/api/)
- **架构设计**: [docs/architecture/](docs/architecture/)
- **开发指南**: [CLAUDE.md](CLAUDE.md)
- **问题反馈**: [GitHub Issues](https://github.com/your-repo/issues)

## 🤝 社区

- 💬 讨论: [GitHub Discussions](https://github.com/your-repo/discussions)
- 🐛 Bug 报告: [GitHub Issues](https://github.com/your-repo/issues)
- 📧 联系: your-email@example.com

---

**开始使用 NaughtyAgent，让编程变得更有趣！** 🎉