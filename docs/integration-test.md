# NaughtAgent 集成测试指南

> 测试 Daemon + CLI + VS Code 完整交互流程

## 前置准备

### 1. 构建项目

```bash
cd D:\WorkSpace\AI\NaughtAgent

# 构建 agent 包
cd packages/agent && pnpm build

# 构建 VS Code 插件
cd ../vscode && pnpm build
```

### 2. 确认环境

```bash
# 检查 Node.js 版本 (需要 >= 18)
node --version

# 检查是否有 API Key 或 Kiro Token
# 方式一：设置环境变量
set ANTHROPIC_API_KEY=sk-xxx

# 方式二：使用 Kiro（需要已登录 Kiro IDE）
# Token 位于 ~/.aws/sso/cache/
```

---

## 测试步骤

### Phase 1: Daemon 基础测试

#### 1.1 启动 Daemon

```bash
cd packages/agent

# 启动 daemon
pnpm start daemon start

# 预期输出:
# Daemon started on port 31415
# PID: xxxxx
```

#### 1.2 检查 Daemon 状态

```bash
pnpm start daemon status

# 预期输出:
# Daemon is running
# PID: xxxxx
# Port: 31415
# Uptime: xx seconds
# Sessions: 0
```

#### 1.3 健康检查 API

```bash
curl http://localhost:31415/health

# 预期输出:
# {"status":"ok","version":"0.1.0"}
```

#### 1.4 停止 Daemon

```bash
pnpm start daemon stop

# 预期输出:
# Daemon stopped

# 确认已停止
pnpm start daemon status
# 预期输出:
# Daemon is not running
```

**检查点 ✅**
- [ ] Daemon 能正常启动
- [ ] 状态命令返回正确信息
- [ ] 健康检查 API 可访问
- [ ] Daemon 能正常停止

---

### Phase 2: CLI 连接测试

#### 2.1 自动启动 Daemon

```bash
# 确保 daemon 未运行
pnpm start daemon stop

# 直接运行 CLI（应自动启动 daemon）
pnpm start "你好，请介绍一下你自己"

# 预期行为:
# 1. 自动启动 daemon
# 2. 连接 daemon
# 3. 发送消息并收到流式响应
```

#### 2.2 会话持久化

```bash
# 第一次对话
pnpm start "记住这个数字：42"

# 第二次对话（同一目录，应复用会话）
pnpm start "我刚才说的数字是多少？"

# 预期: AI 应该记得 42
```

#### 2.3 独立模式

```bash
# 使用 --standalone 模式（不使用 daemon）
pnpm start --standalone "快速问一个问题"

# 或简写
pnpm start -s "快速问一个问题"

# 预期: 直接运行，不连接 daemon
```

#### 2.4 工具调用测试

```bash
# 测试文件读取
pnpm start "读取 package.json 文件的内容"

# 测试文件搜索
pnpm start "查找项目中所有的 .ts 文件"

# 测试命令执行（需要确认）
pnpm start "运行 pnpm test 命令"
```

**检查点 ✅**
- [ ] CLI 能自动启动 daemon
- [ ] 流式输出正常显示
- [ ] 会话能跨命令持久化
- [ ] 独立模式正常工作
- [ ] 工具调用正常执行
- [ ] 权限确认弹出正常

---

### Phase 3: 权限确认测试

#### 3.1 写入文件确认

```bash
# 应该弹出确认提示
pnpm start "创建一个名为 test-output.txt 的文件，内容是 Hello World"

# 预期:
# [write] 写入文件: test-output.txt
# 是否允许此操作? (y/n)
```

#### 3.2 执行命令确认

```bash
# 应该弹出确认提示
pnpm start "执行 echo Hello 命令"

# 预期:
# [bash] 执行命令: echo Hello
# 是否允许此操作? (y/n)
```

#### 3.3 自动确认模式

```bash
# 使用 -y 跳过确认
pnpm start -y "创建一个名为 test-auto.txt 的文件"

# 预期: 直接执行，不弹出确认
```

**检查点 ✅**
- [ ] 写入操作弹出确认
- [ ] 命令执行弹出确认
- [ ] 输入 y 后正常执行
- [ ] 输入 n 后拒绝执行
- [ ] -y 参数跳过确认

---

### Phase 4: VS Code 插件测试

#### 4.1 安装插件

```bash
cd packages/vscode

# 打包插件
pnpm package
# 生成 naughtagent-0.1.0.vsix

# 安装插件
code --install-extension naughtagent-0.1.0.vsix
```

#### 4.2 启动测试

1. 打开 VS Code
2. 打开一个项目文件夹
3. 按 `Ctrl+Shift+A` 打开聊天面板

**预期行为:**
- 聊天面板正常显示
- 自动连接 Daemon（状态栏显示连接状态）
- 如果 Daemon 未运行，自动启动

#### 4.3 基础对话测试

1. 在聊天输入框输入: "你好"
2. 按 Enter 发送

**预期行为:**
- 消息发送成功
- 流式显示 AI 响应
- 响应完成后显示 token 使用量

#### 4.4 上下文测试

1. 打开一个代码文件
2. 选中一段代码
3. 按 `Ctrl+Shift+E` 或右键选择 "Ask NaughtAgent"

**预期行为:**
- 聊天面板打开
- 自动包含选中的代码作为上下文

#### 4.5 @file 引用测试

1. 在聊天输入框输入: "@"
2. 应该弹出文件补全列表
3. 选择一个文件
4. 输入问题: "解释这个文件的作用"

**预期行为:**
- 文件补全正常工作
- 文件内容作为上下文发送

#### 4.6 工具调用显示

1. 输入: "读取 package.json 文件"

**预期行为:**
- 显示工具调用状态 [read]
- 显示工具执行结果
- 权限确认弹窗（如果需要）

#### 4.7 Diff 预览测试

1. 输入: "在 package.json 中添加一个新的 script"

**预期行为:**
- 显示 Diff 预览
- 可以接受或拒绝修改

**检查点 ✅**
- [ ] 插件安装成功
- [ ] 聊天面板正常打开
- [ ] 自动连接 Daemon
- [ ] 基础对话正常
- [ ] 选中代码上下文正常
- [ ] @file 引用正常
- [ ] 工具调用显示正常
- [ ] 权限确认弹窗正常
- [ ] Diff 预览正常

---

### Phase 5: 会话共享测试

#### 5.1 CLI 和 VS Code 共享会话

1. 在终端运行:
```bash
pnpm start "记住这个密码：secret123"
```

2. 在 VS Code 聊天面板输入:
```
我刚才在终端说的密码是什么？
```

**预期行为:**
- VS Code 能访问 CLI 创建的会话
- AI 能记得 "secret123"

#### 5.2 多窗口共享

1. 打开两个 VS Code 窗口，都打开同一个项目
2. 在窗口 1 发送消息
3. 在窗口 2 查看是否能看到对话历史

**预期行为:**
- 两个窗口共享同一个会话
- 消息实时同步

**检查点 ✅**
- [ ] CLI 和 VS Code 共享会话
- [ ] 多 VS Code 窗口共享会话
- [ ] 消息历史正确同步

---

### Phase 6: 断线重连测试

#### 6.1 Daemon 重启

1. 在 VS Code 中开始对话
2. 在终端停止 daemon:
```bash
pnpm start daemon stop
```
3. 在 VS Code 中继续发送消息

**预期行为:**
- VS Code 检测到断线
- 自动重新启动 daemon
- 自动重连
- 会话恢复

#### 6.2 网络中断模拟

1. 开始对话
2. 手动 kill daemon 进程
3. 等待几秒
4. 继续发送消息

**预期行为:**
- 显示断线提示
- 自动重连
- 会话不丢失

**检查点 ✅**
- [ ] Daemon 重启后自动重连
- [ ] 会话数据不丢失
- [ ] 断线提示正常显示

---

## 问题排查

### Daemon 无法启动

```bash
# 检查端口占用
netstat -ano | findstr 31415

# 检查 PID 文件
cat ~/.naughtagent/daemon.pid

# 强制清理
rm ~/.naughtagent/daemon.pid
```

### CLI 连接失败

```bash
# 检查 daemon 状态
curl http://localhost:31415/health

# 使用独立模式测试
pnpm start -s "测试"
```

### VS Code 插件不工作

1. 打开 VS Code 开发者工具: `Ctrl+Shift+I`
2. 查看 Console 错误信息
3. 检查 Output 面板的 NaughtAgent 日志

### API Key 问题

```bash
# 检查环境变量
echo %ANTHROPIC_API_KEY%

# 检查 Kiro Token
dir %USERPROFILE%\.aws\sso\cache\
```

---

## 测试结果记录

| 测试项 | 状态 | 备注 |
|--------|------|------|
| Daemon 启动 | ⬜ | |
| Daemon 状态 | ⬜ | |
| Daemon 停止 | ⬜ | |
| CLI 自动启动 | ⬜ | |
| CLI 流式输出 | ⬜ | |
| CLI 会话持久化 | ⬜ | |
| CLI 独立模式 | ⬜ | |
| CLI 工具调用 | ⬜ | |
| CLI 权限确认 | ⬜ | |
| VS Code 安装 | ⬜ | |
| VS Code 连接 | ⬜ | |
| VS Code 对话 | ⬜ | |
| VS Code 上下文 | ⬜ | |
| VS Code @file | ⬜ | |
| VS Code Diff | ⬜ | |
| 会话共享 | ⬜ | |
| 断线重连 | ⬜ | |

---

## 完成标准

- [ ] 所有检查点通过
- [ ] 无严重 bug
- [ ] 用户体验流畅
- [ ] 错误提示清晰
