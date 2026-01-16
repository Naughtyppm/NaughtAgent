# NaughtAgent 测试教程

> 从零开始测试 CLI 和 VS Code 插件

## 安装

### 全局安装（推荐）

```cmd
cd D:\WorkSpace\AI\NaughtAgent\packages\agent
pnpm build
npm link
```

安装后可以在任意目录使用 `naughtagent` 命令：

```cmd
naughtagent --version
```

输出：
```
    /\_____/\
   /  o   o  \
  ( ==  ^  == )
   )         (
  (           )
 ( (  )   (  ) )
(__(__)___(__)__)

  NaughtAgent v0.1.0
  AI 编程助手 🐱
```

### 更新

修改代码后只需重新构建，全局命令自动更新：

```cmd
cd D:\WorkSpace\AI\NaughtAgent\packages\agent
pnpm build
```

---

## Part 1: CMD 命令行测试

### 1.1 Daemon 管理

#### 启动 Daemon

```cmd
naughtagent daemon start
```

预期输出：
```
  ╭─────────────────────────────────────╮
  │       NaughtAgent Daemon            │
  ├─────────────────────────────────────┤
  │  Status:  Running                   │
  │  PID:     xxxxx                     │
  │  URL:     http://127.0.0.1:31415    │
  ╰─────────────────────────────────────╯
```

#### 查看状态

```cmd
naughtagent daemon status
```

#### 健康检查

```cmd
curl http://localhost:31415/health
```

预期输出：`{"status":"ok","version":"0.1.0"}`

#### 停止 Daemon

```cmd
naughtagent daemon stop
```

---

### 1.2 基础对话

#### 简单问答（自动启动 Daemon）

```cmd
naughtagent "你好，请用一句话介绍你自己"
```

预期：
- 如果 Daemon 未运行，会自动启动
- 显示 AI 回复
- 显示 Token 使用量

#### 独立模式（不使用 Daemon）

```cmd
naughtagent -s "你好"
```

预期：显示 `[standalone]` 标记

---

### 1.3 工具调用测试

#### 读取文件

```cmd
naughtagent "读取 package.json 文件"
```

预期：
1. 弹出确认提示：`⚠️ 需要确认: Execute read`
2. 输入 `y` 确认
3. 显示文件内容

#### 搜索文件

```cmd
naughtagent "查找项目中所有的 .ts 文件"
```

#### 执行命令

```cmd
naughtagent "执行 echo Hello World 命令"
```

预期：弹出确认提示，输入 `y` 后执行

---

### 1.4 权限确认测试

#### 手动确认模式

```cmd
naughtagent "创建一个 hello.txt 文件，内容是 Hello"
```

预期：
1. 弹出确认：`⚠️ 需要确认: Execute write`
2. 输入 `y` 确认执行
3. 输入 `n` 拒绝执行

#### 自动确认模式（-y 参数）

```cmd
naughtagent -y "创建一个 test.txt 文件，内容是 Test"
```

预期：直接执行，不弹出确认

#### 清理测试文件

```cmd
del hello.txt test.txt 2>nul
```

---

### 1.5 会话管理

#### 查看会话列表

```cmd
naughtagent sessions list
```

#### 测试会话持久化

```cmd
:: 第一次对话
naughtagent "记住这个数字：42"

:: 第二次对话（应该记得）
naughtagent "我刚才说的数字是多少？"
```

预期：AI 应该记得 42

#### 删除会话

```cmd
:: 先查看会话 ID
naughtagent sessions list

:: 删除指定会话
naughtagent sessions delete <session-id>
```

---

### 1.6 不同 Agent 类型

#### Build Agent（默认）

```cmd
naughtagent "帮我分析 package.json"
```

#### Plan Agent

```cmd
naughtagent -a plan "帮我规划一个新功能的实现步骤"
```

#### Explore Agent

```cmd
naughtagent -a explore "这个项目的架构是什么样的？"
```

---

## Part 2: VS Code 插件测试

### 2.1 安装插件

#### 方法一：命令行安装

```cmd
cd D:\WorkSpace\AI\NaughtAgent\packages\vscode
code --install-extension naughtagent-0.1.0.vsix
```

#### 方法二：VS Code 手动安装

1. 打开 VS Code
2. 按 `Ctrl+Shift+P` 打开命令面板
3. 输入 `Extensions: Install from VSIX...`
4. 选择 `D:\WorkSpace\AI\NaughtAgent\packages\vscode\naughtagent-0.1.0.vsix`

### 2.2 重启 VS Code

安装后需要重启 VS Code 或重新加载窗口：
- 按 `Ctrl+Shift+P`
- 输入 `Developer: Reload Window`

---

### 2.3 打开聊天面板

#### 方法一：快捷键

按 `Ctrl+Shift+A`

#### 方法二：侧边栏

点击左侧活动栏的 NaughtAgent 图标

#### 方法三：命令面板

1. 按 `Ctrl+Shift+P`
2. 输入 `NaughtAgent: 打开 AI 助手`

---

### 2.4 基础对话测试

1. 在聊天输入框输入：`你好`
2. 按 Enter 发送
3. 观察：
   - 消息是否发送成功
   - 是否有流式输出
   - 是否显示 Token 使用量

---

### 2.5 代码上下文测试

#### 测试选中代码

1. 打开任意代码文件（如 `package.json`）
2. 选中一段代码
3. 按 `Ctrl+Shift+E`
4. 观察聊天面板是否自动包含选中代码

#### 测试右键菜单

1. 选中代码
2. 右键点击
3. 选择 `询问选中代码` / `解释代码` / `修复代码`

---

### 2.6 @file 引用测试

1. 在聊天输入框输入 `@`
2. 观察是否弹出文件补全列表
3. 选择一个文件
4. 输入问题：`解释这个文件的作用`

---

### 2.7 工具调用测试

#### 读取文件

输入：`读取 package.json 文件`

观察：
- 是否显示工具调用状态 `[read]`
- 是否弹出权限确认
- 是否显示执行结果

#### 写入文件

输入：`创建一个 test-vscode.txt 文件`

观察：
- 是否弹出权限确认对话框
- 点击确认后是否创建文件

---

### 2.8 Diff 预览测试

1. 输入：`在 package.json 中添加一个新的 script: "hello": "echo hello"`
2. 观察是否显示 Diff 预览
3. 可以接受或拒绝修改

---

### 2.9 会话共享测试

#### CLI 创建会话

在 CMD 中：
```cmd
cd D:\WorkSpace\AI\NaughtAgent
naughtagent "记住密码是 secret123"
```

#### VS Code 读取会话

在 VS Code 聊天面板中：
```
我刚才在终端说的密码是什么？
```

预期：AI 应该记得 "secret123"

---

### 2.10 状态栏检查

查看 VS Code 底部状态栏：
- 应该显示 NaughtAgent 连接状态
- 点击可以查看 Daemon 状态

---

### 2.11 设置配置

1. 打开 VS Code 设置（`Ctrl+,`）
2. 搜索 `naughtagent`
3. 可配置项：
   - `serverUrl`: Daemon 地址
   - `defaultAgent`: 默认 Agent 类型
   - `autoConfirm.*`: 各种操作的自动确认

---

## 常见问题

### Daemon 无法启动

```cmd
:: 检查端口占用
netstat -ano | findstr 31415

:: 清理 PID 文件
del %USERPROFILE%\.naughtagent\daemon.pid
```

### VS Code 插件不显示

1. 确认插件已安装：`Ctrl+Shift+X` 搜索 "NaughtAgent"
2. 检查 Output 面板的错误日志
3. 尝试重新加载窗口

### API 调用失败

Provider 优先级：`ANTHROPIC_API_KEY` > `OPENAI_API_KEY` > Kiro

```cmd
:: 方法 1: 使用 OpenRouter（推荐，不与 Claude Code 冲突）
set OPENAI_API_KEY=sk-or-v1-xxx

:: 方法 2: 使用 Anthropic API（需要自己的 Key）
set ANTHROPIC_API_KEY=sk-ant-xxx

:: 方法 3: 使用 Kiro（会与 Claude Code 冲突）
dir %USERPROFILE%\.aws\sso\cache\
```

---

## 测试检查清单

### CMD 测试

- [ ] Daemon 启动/停止/状态
- [ ] 健康检查 API
- [ ] 基础对话
- [ ] 独立模式 (-s)
- [ ] 工具调用（read/glob/grep/bash）
- [ ] 权限确认（手动/自动）
- [ ] 会话持久化
- [ ] 不同 Agent 类型

### VS Code 测试

- [ ] 插件安装成功
- [ ] 聊天面板打开
- [ ] 自动连接 Daemon
- [ ] 基础对话
- [ ] 代码上下文
- [ ] @file 引用
- [ ] 工具调用显示
- [ ] 权限确认弹窗
- [ ] Diff 预览
- [ ] 会话共享
- [ ] 状态栏显示
