# NaughtyAgent 快速开始

> 5 分钟上手 NaughtyAgent

---

## 安装

### 1. 克隆项目

```bash
git clone <repo-url> naughtyagent
cd naughtyagent
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 构建

```bash
pnpm build
# 或使用 justfile
just build
```

### 4. 全局链接

```bash
cd packages/agent
npm link
```

这会将 `naughtyagent` 和 `na` 命令链接到全局。

---

## 环境配置

创建 `.env` 文件或设置环境变量：

```bash
# Anthropic（主力，必需）
ANTHROPIC_API_KEY=sk-ant-xxx

# OpenAI（可选）
OPENAI_API_KEY=sk-xxx

# 模型配置（可选）
MODEL=claude-sonnet-4-20250514
MAX_TOKENS=8192
```

---

## 启动

### Ink TUI 模式（推荐）

```bash
naughtyagent --ui ink
# 或简写
na --ui ink
```

### 纯文本 REPL 模式

```bash
na
```

### 指定 Agent 类型

```bash
na --agent build    # 编码模式（默认）- 可读写文件
na --agent plan     # 规划模式 - 只读
na --agent explore  # 探索模式 - 只读
```

### 指定工作目录

```bash
na --cwd /path/to/project
```

---

## 基本使用

### 对话

直接输入问题或指令：

```
> 帮我看看这个项目的结构

> 读取 package.json 文件

> 创建一个 hello.ts 文件，内容是打印 Hello World
```

### 内置命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/mode` | 切换权限模式 |
| `/config` | 查看当前配置 |
| `/history` | 查看对话历史 |
| `/init` | 初始化项目 |

### 权限确认

当 Agent 需要写入文件或执行命令时，会询问确认：

```
Agent 想要写入文件: src/hello.ts
[y] 允许  [n] 拒绝  [a] 允许所有
```

---

## 权限模式

| 模式 | 读文件 | 写文件 | 执行命令 |
|------|--------|--------|---------|
| ask（默认） | ✅ 自动 | ⚠️ 询问 | ⚠️ 询问 |
| allow | ✅ 自动 | ✅ 自动 | ✅ 自动 |
| sandbox | ✅ 自动 | ✅ 沙箱内 | ✅ 沙箱内 |

切换模式：
```
/mode allow
/mode ask
```

---

## 下一步

- [CLI 使用手册](cli-usage.md) - 详细的 CLI 功能说明
- [VS Code 扩展](vscode-extension.md) - IDE 集成使用
- [HTTP API 参考](api-reference.md) - 编程接口

---

> 文档生成日期：2026-02-27
