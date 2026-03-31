# TASK-006: v0.3.0 手动验证 — 子代理工具注册

## 前提

- copilot-api 运行中（localhost:4141）
- 已执行 `npx tsup` 构建（已完成）

## 启动 Na

### PowerShell
```powershell
cd D:\AISpace\Apps\NaughtAgent\packages\agent
$env:ANTHROPIC_BASE_URL="http://localhost:4141"
$env:ANTHROPIC_API_KEY="dummy"
na
```

### CMD
```cmd
cd D:\AISpace\Apps\NaughtAgent\packages\agent
set ANTHROPIC_BASE_URL=http://localhost:4141
set ANTHROPIC_API_KEY=dummy
na
```

## 测试 1：子代理读文件（最简单）

```
用 run_agent 子代理读取 package.json，告诉我 name 和 version 字段。
```

**预期**：子代理返回 `@naughtyagent/agent` 和 `0.3.0`

## 测试 2：子代理写文件

```
用 run_agent 子代理在当前目录创建一个文件 test-v030.txt，内容写 "NaughtAgent v0.3.0 子代理写文件测试成功"，然后读回来确认内容正确。
```

**预期**：
- 子代理使用 write 工具创建 test-v030.txt
- 子代理使用 read 工具读回验证
- 文件 `packages/agent/test-v030.txt` 存在且内容正确

## 测试 3：dispatch_agent（高级，可选）

```
用 dispatch_agent 调度两个专家：reader 负责读取 src/agent/loop.ts 的前 20 行，analyzer 负责分析代码结构。任务：分析 loop.ts 的架构设计。
```

**预期**：Dispatcher 调度专家，专家能使用 read 工具

## 验证清单

- [ ] 子代理能使用 read 工具
- [ ] 子代理能使用 write 工具
- [ ] dispatch_agent 专家能使用工具
- [ ] cwd 正确（文件写到 packages/agent/ 目录下）

## 自动测试结果（E2E 脚本，已通过）

- 18/18 单元测试通过
- E2E: run_agent 子代理成功读取 package.json 返回 v0.3.0 ✅
