# CLI 使用手册

> NaughtyAgent 命令行界面完整指南

---

## 启动选项

### 基本启动

```bash
# Ink TUI 模式（推荐）
naughtyagent --ui ink
na --ui ink

# 纯文本 REPL 模式
na
```

### 命令行参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--ui` | `-u` | 界面模式（ink/text） | text |
| `--agent` | `-a` | Agent 类型（build/plan/explore） | build |
| `--cwd` | `-c` | 工作目录 | 当前目录 |
| `--model` | `-m` | 模型名称 | 环境变量 MODEL |
| `--verbose` | `-v` | 详细输出 | false |
| `--help` | `-h` | 显示帮助 | - |
| `--version` | | 显示版本 | - |

### 示例

```bash
# 在指定目录以规划模式启动
na --ui ink --agent plan --cwd ~/projects/myapp

# 使用特定模型
na --model claude-sonnet-4-20250514
```

---

## Agent 类型

| 类型 | 用途 | 可用工具 |
|------|------|---------|
| `build` | 编码、修改文件 | 全部工具（read/write/edit/bash 等） |
| `plan` | 规划、分析 | 只读工具（read/glob/grep） |
| `explore` | 探索、理解代码 | 只读工具（read/glob/grep） |

---

## 内置命令

### 帮助命令

```
/help              # 显示所有命令
/help <command>    # 显示特定命令帮助
```

### 模式切换

```
/mode              # 显示当前模式
/mode ask          # 切换到询问模式
/mode allow        # 切换到自动模式
/mode sandbox      # 切换到沙箱模式
```

### 配置管理

```
/config            # 显示当前配置
/config set <key> <value>  # 设置配置项
```

### 历史记录

```
/history           # 显示对话历史
/history clear     # 清空历史
```

### 别名管理

```
/alias             # 显示所有别名
/alias add <name> <command>  # 添加别名
/alias remove <name>         # 删除别名
```

### 项目初始化

```
/init              # 初始化项目（生成 justfile + NAUGHTY.md）
```

---

## Daemon 模式

### 启动 Daemon

```bash
na daemon start    # 启动后台服务
na daemon status   # 查看状态
na daemon stop     # 停止服务
na daemon restart  # 重启服务
```

### Daemon 配置

默认端口：`31415`

可通过环境变量配置：
```bash
NAUGHTY_PORT=31415
NAUGHTY_HOST=127.0.0.1
```

---

## Ink TUI 界面

### 界面布局

```
┌─────────────────────────────────────────┐
│  NaughtyAgent v1.0.0  │ build │ ask     │  ← 状态栏
├─────────────────────────────────────────┤
│                                         │
│  User: 帮我看看这个项目                   │  ← 消息区
│                                         │
│  Assistant: 好的，我来分析项目结构...      │
│  [Tool: glob] 搜索文件...                │
│  [Tool: read] 读取 package.json...       │
│                                         │
├─────────────────────────────────────────┤
│  > 输入消息...                           │  ← 输入区
└─────────────────────────────────────────┘
```

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 发送消息 |
| `Ctrl+C` | 中断当前操作 |
| `Ctrl+D` | 退出程序 |
| `↑/↓` | 浏览历史消息 |
| `Tab` | 命令补全 |

### 权限对话框

当需要确认权限时，会弹出对话框：

```
┌─────────────────────────────────────────┐
│  权限确认                                │
│                                         │
│  Agent 想要写入文件:                      │
│  src/hello.ts                           │
│                                         │
│  [y] 允许  [n] 拒绝  [a] 允许所有         │
└─────────────────────────────────────────┘
```

---

## 工具使用

Agent 会自动选择合适的工具，常见工具：

| 工具 | 功能 | 示例场景 |
|------|------|---------|
| `read` | 读取文件 | "看看 package.json" |
| `write` | 写入文件 | "创建一个新文件" |
| `edit` | 编辑文件 | "把函数名改成 xxx" |
| `glob` | 搜索文件名 | "找所有 .ts 文件" |
| `grep` | 搜索内容 | "找包含 TODO 的文件" |
| `bash` | 执行命令 | "运行测试" |

---

## 子代理

Agent 可以启动子代理处理复杂任务：

| 子代理 | 功能 |
|--------|------|
| `run_agent` | 启动独立子 Agent |
| `fork_agent` | 分叉当前 Agent |
| `parallel_agents` | 并行多个 Agent |
| `multi_agent` | 多 Agent 协作 |
| `run_workflow` | 执行工作流 |

---

## 常见问题

### Q: 如何中断正在执行的操作？
A: 按 `Ctrl+C` 可以中断当前操作。

### Q: 如何清空对话历史？
A: 使用 `/history clear` 命令。

### Q: 如何切换到自动确认模式？
A: 使用 `/mode allow` 命令。

### Q: Daemon 启动失败怎么办？
A: 检查端口是否被占用，或使用 `na daemon status` 查看状态。

---

> 文档生成日期：2026-02-27
