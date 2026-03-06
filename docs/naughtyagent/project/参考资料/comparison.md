# 业界 Agent 横向对比

## 总览对比表

| 维度 | NaughtyAgent | Claude Code | Kiro | Cursor |
|------|-------------|-------------|------|--------|
| 架构 | Chat Participant | 单体+扩展 | IDE fork | IDE fork |
| 语言 | TypeScript | TS/Rust | TypeScript | TS/Rust |
| LLM | 多模型 | Claude 专属 | 多模型 | 多模型 |
| CLI | ✅ Ink TUI | ✅ 原生 | ❌ | ❌ |
| IDE | ✅ VS Code Chat | ✅ 完整 | ✅ 完整 | ✅ 完整 |
| MCP | ✅ 完整 | ✅ 完整 | ✅ 完整 | ✅ 完整 |
| 子代理 | ✅ 6 种 | ✅ 基础 | ✅ 基础 | ❌ |
| 沙箱 | ❌ | ✅ Docker | ✅ macOS | ✅ |
| 开源 | ✅ | ❌ | ❌ | ❌ |

## 核心能力对比

### Agent Loop

| 能力 | NaughtyAgent | Claude Code | Kiro |
|------|-------------|-------------|------|
| 流式输出 | ✅ | ✅ | ✅ |
| 错误恢复 | ✅ | ✅ | ✅ |
| Extended Thinking | ❌ | ✅ | ✅ |
| 自动压缩 | ⚠️ 基础 | ✅ 智能 | ✅ 智能 |

### 工具系统

| 能力 | NaughtyAgent | Claude Code | Kiro |
|------|-------------|-------------|------|
| 文件读写 | ✅ | ✅ | ✅ |
| AST 编辑 | ❌ | ⚠️ | ✅ editCode |
| 语义重命名 | ❌ | ❌ | ✅ |
| 诊断检查 | ❌ | ❌ | ✅ |
| Web 搜索 | ❌ | ❌ | ✅ |

### 子代理系统

| 能力 | NaughtyAgent | Claude Code | Kiro |
|------|-------------|-------------|------|
| 子任务委派 | ✅ | ✅ | ✅ |
| 并行执行 | ✅ | ❌ | ❌ |
| 工作流编排 | ✅ | ❌ | ❌ |
| Agent 分叉 | ✅ | ❌ | ❌ |

> **NaughtyAgent 子代理系统是最大亮点**

## NaughtyAgent 优势

1. **子代理系统最丰富**
   - 6 种模式：ask_llm / run_agent / fork_agent / parallel_agents / multi_agent / run_workflow
   - 支持并行执行和工作流编排
   - 业界领先

2. **双界面架构**
   - CLI TUI + VS Code 扩展
   - 通过 Daemon 统一后端
   - 灵活部署

3. **完全自主可控**
   - 开源自有代码
   - 不依赖闭源 IDE
   - 可深度定制

4. **MCP 完整实现**
   - 连接池、重试
   - 工具/资源/提示三大能力

## NaughtyAgent 差距

1. **无 AST 级代码编辑**
   - 只有搜索替换
   - 缺少 editCode / semanticRename

2. **无沙箱隔离**
   - 安全层较薄
   - 缺少 Docker/macOS Sandbox

3. **Token 计数不精确**
   - 字符估算而非 tiktoken
   - 影响上下文管理

4. **VS Code 扩展较基础**
   - 缺少内联补全
   - 缺少 Code Actions
   - 缺少诊断集成

5. **无 Extended Thinking**
   - 未利用 Claude 扩展思考

## 业界 Agent 速查

| Agent | 特点 | 开源 |
|-------|------|------|
| Claude Code | Claude 专属，Extended Thinking，Docker 沙箱 | ❌ |
| Kiro | VS Code fork，Spec 驱动，Hooks 系统 | ❌ |
| Cursor | VS Code fork，Tab 补全，多模型 | ❌ |
| Aider | Python，Git 深度集成，repo map | ✅ |
| Cline | VS Code 扩展，浏览器自动化 | ✅ |
