# 成熟 Agent 技术栈全景

一个生产级 AI 编程 Agent 需要覆盖以下五层架构。

## 1. 核心引擎层

```
Agent Loop（核心循环）
├── 消息处理：用户输入 → LLM → 工具调用 → 响应
├── 流式输出：SSE / WebSocket 实时推送
├── 错误恢复：自动重试、降级、错误分类
├── 中断控制：AbortController、优雅取消
└── 循环终止：最大轮次、Token 预算、用户中断

LLM Provider（模型提供者）
├── Anthropic Claude（主力）
├── OpenAI GPT-4o / o1
├── Google Gemini
├── 本地模型（Ollama / vLLM）
├── 路由策略：按任务类型选模型
└── 降级策略：主模型失败自动切换

Tool System（工具系统）
├── 文件操作：read / write / edit / append
├── 搜索：glob（文件名）/ grep（内容）
├── 命令执行：bash / shell
├── 代码分析：AST 解析、符号搜索
├── Web 工具：fetch / search
├── 子代理工具：fork / parallel / workflow
└── MCP 工具：动态加载外部工具
```

## 2. 上下文管理层

```
Token 管理
├── 精确计数（tiktoken / 模型原生 tokenizer）
├── 上下文窗口监控（已用 / 剩余 / 预留）
├── 自动压缩（摘要旧消息、保留关键信息）
└── 工具输出截断（大文件智能截取）

项目上下文
├── 项目结构树（自动生成、缓存）
├── 技术栈检测（package.json / Cargo.toml 等）
├── Git 上下文（分支、最近提交、diff）
├── 规则系统（.rules / CLAUDE.md / steering）
└── 文件引用（#file 语法、@mention）

会话管理
├── 多会话并行
├── 会话持久化（JSON / SQLite）
├── 会话分支（fork from checkpoint）
├── 消息历史（完整 + 压缩两份）
└── 会话恢复（断线重连、崩溃恢复）
```

## 3. 安全与权限层

```
权限模式
├── Ask 模式：每次操作询问用户
├── Auto 模式：自动执行，仅危险操作询问
├── Sandbox 模式：沙箱内自由，越界询问
└── 细粒度控制：按工具类型 × 文件路径 glob 匹配

安全检查
├── 路径遍历防护（../、符号链接）
├── 危险命令拦截（rm -rf /、sudo）
├── 敏感文件保护（.env、credentials）
├── 网络请求白名单
└── 代码注入检测

沙箱执行
├── Docker 容器隔离（Claude Code 方案）
├── macOS Sandbox（Kiro 方案）
├── 文件系统虚拟化
└── 网络隔离
```

## 4. 用户界面层

```
CLI 终端界面
├── REPL 交互（readline / Ink TUI）
├── Markdown 渲染（代码高亮、表格）
├── 流式输出（逐字显示）
├── 进度指示（spinner、进度条）
├── Diff 预览（unified diff、side-by-side）
└── 权限确认对话框

IDE 集成
├── VS Code Extension（Webview Chat）
├── JetBrains Plugin
├── 内联代码建议（Inline Completion）
├── 代码操作（Code Actions）
├── 诊断集成（Problems Panel）
├── 终端集成（Terminal API）
├── Diff Editor 集成
└── 文件装饰器（修改标记）
```

## 5. 扩展与生态层

```
MCP（Model Context Protocol）
├── MCP 客户端：连接外部工具服务器
├── MCP 服务端：暴露自身能力给其他 Agent
├── 工具发现：自动加载 MCP 服务器提供的工具
├── 资源访问：读取 MCP 资源
└── 提示模板：使用 MCP 提示

子代理系统
├── 任务委派：主 Agent 分配子任务
├── 并行执行：多个子 Agent 同时工作
├── 上下文隔离：子 Agent 独立上下文窗口
├── 工作流编排：多步骤流程自动化
└── 自定义 Agent：用户定义专用 Agent

技能/命令系统
├── 内置命令：/help /mode /config /init
├── 自定义技能：用户定义快捷工作流
├── 别名系统：命令别名
└── 规则系统：条件触发的上下文注入

Hooks 生命周期
├── preToolUse / postToolUse
├── fileEdited / fileCreated / fileDeleted
├── promptSubmit / agentStop
└── preTaskExecution / postTaskExecution
```
