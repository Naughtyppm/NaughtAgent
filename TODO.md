# NaughtAgent 待办事项

> 更新时间: 2026-01-16

## 当前进度

```
Phase 6 全部完成 ✅

已实现:
- Phase 1-4.5: Agent 核心功能
- Phase 5: 扩展能力 (SubTask/Skills/Rules/Server/MCP)
- Phase 6.1-6.3: Daemon 基础、会话共享、WebSocket
- Phase 6.4: 并行任务 ✅ (刚完成)
- Phase 6.5: CLI 改造
- Phase 6.6: VS Code 插件

测试: 812 个测试全部通过
```

## 待办事项

### 1. 集成测试（进行中）

测试 CLI 和 VS Code 与 Daemon 的完整交互流程：

- [ ] 启动 Daemon (`naughtagent daemon start`)
- [ ] CLI 连接测试 (`naughtagent "测试消息"`)
- [ ] VS Code 插件连接测试
- [ ] 会话共享测试（CLI 和 VS Code 使用同一会话）
- [ ] 断线重连测试
- [ ] 权限确认流程测试

> 详细测试步骤见 `docs/integration-test.md`

### 2. 构建和打包

- [x] 构建 agent 包 (`cd packages/agent && pnpm build`)
- [x] 构建 VS Code 插件 (`cd packages/vscode && pnpm build`)
- [ ] 测试插件安装 (`code --install-extension naughtagent-0.1.0.vsix`)

### 3. 修复集成测试发现的问题

- [ ] 根据集成测试结果修复 bug

---

## 快速命令

```bash
# 进入项目
cd D:\WorkSpace\AI\NaughtAgent

# 构建 agent
cd packages/agent && pnpm build

# 构建 VS Code 插件
cd packages/vscode && pnpm build

# 启动 Daemon
pnpm --filter @naughtagent/agent start daemon start

# 运行测试
pnpm --filter @naughtagent/agent test

# 查看 Daemon 状态
pnpm --filter @naughtagent/agent start daemon status
```

## 新增的任务 API

```bash
# 列出任务
curl http://localhost:31415/tasks -H "Authorization: Bearer <key>"

# 提交任务
curl -X POST http://localhost:31415/tasks \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "xxx", "message": "Hello"}'

# 取消任务
curl -X POST http://localhost:31415/tasks/<id>/cancel \
  -H "Authorization: Bearer <key>"
```
