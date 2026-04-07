# NaughtAgent 代码审查报告

> 日期：2026-04-07 | 版本：v0.10.0 | 审查范围：全项目

---

## 📊 项目概览

| 维度 | 数据 |
|------|------|
| 架构 | Monorepo（agent + vscode + iterative-probe-mcp） |
| Agent 代码量 | ~65,000 行 / 317 个 TypeScript 文件 |
| VSCode 扩展代码量 | ~3,400 行 |
| TypeScript 编译 | ✅ agent 通过 / ❌ vscode 有 10 个类型错误 |
| 测试文件 | 133 个（vitest） |
| Lint/Prettier | ❌ 未配置 |
| TODO/FIXME | 0（代码干净） |
| 文档 | ✅ 完善（架构设计 + 使用指南 + 开发阶段） |
| 生产依赖 | 35 个 |

### 源码目录分布（packages/agent/src）

| 目录 | 文件数 | 职责 |
|------|--------|------|
| cli | 124 | CLI 界面（含 Ink 自定义实现） |
| tool | 39 | 工具系统 |
| subtask | 27 | 子任务/子代理 |
| command | 24 | 命令处理 |
| skill | 11 | 技能系统 |
| mcp | 10 | MCP 协议 |
| token | 10 | Token 管理 |
| agent | 7 | Agent 核心 |
| context | 7 | 上下文管理 |
| justfile | 6 | Justfile 集成 |
| server | 6 | Daemon 服务器 |
| session | 6 | 会话管理 |
| interaction | 5 | 交互系统 |
| provider | 5 | LLM Provider |
| rules | 5 | 规则引擎 |
| config | 4 | 配置 |
| logging | 4 | 日志 |
| ux | 4 | UX 工具 |
| error | 3 | 错误处理 |
| permission | 2 | 权限控制 |
| security | 2 | 安全 |
| planning | 0 | ⚠️ 空目录 |

---

## 🔴 高优先级问题

### P1. VSCode 扩展类型错误（10 个）

**严重性**：编译失败，阻止发布

```
src/services/AgentClient.ts(146,22): error TS18046: 'data' is of type 'unknown'.
src/services/AgentClient.ts(148,5):  error TS2322: Type 'unknown' is not assignable to type 'SessionInfo'.
src/services/AgentClient.ts(167,22): error TS18046: 'data' is of type 'unknown'.
src/services/AgentClient.ts(169,5):  error TS2322: Type 'unknown' is not assignable to type 'SessionInfo'.
src/services/AgentClient.ts(187,12): error TS18046: 'data' is of type 'unknown'.
src/services/DaemonClient.ts(124,16): error TS18046: 'data' is of type 'unknown'.
src/services/DaemonClient.ts(125,19): error TS18046: 'data' is of type 'unknown'.
src/services/DaemonClient.ts(126,21): error TS18046: 'data' is of type 'unknown'.
src/views/SessionPicker.ts(172,11): error TS2322: Type 'unknown' → '{ sessions: ... }'.
src/views/SessionPicker.ts(174,39): error TS2341: 'sessionId' is private.
```

**修复方向**：
- `AgentClient.ts` / `DaemonClient.ts`：为 API 响应添加类型断言或泛型
- `SessionPicker.ts`：修复类型不匹配，改用公开 getter 访问 sessionId

**预估工时**：30 分钟

---

### P2. 零代码质量工具配置

**严重性**：65,000+ 行代码无自动化质量保证

**现状**：
- ❌ 无 ESLint 配置
- ❌ 无 Prettier 配置
- ❌ 无 pre-commit hooks（husky/lint-staged）
- ❌ 无 CI/CD 管道

**建议方案**：
1. 添加 `eslint.config.js`（flat config）+ `@typescript-eslint`
2. 添加 `.prettierrc`（统一格式化）
3. 添加 `lint-staged` + `husky`（pre-commit 检查）
4. 在 `package.json` 中添加 `lint` / `format` scripts

**预估工时**：1-2 小时

---

### P3. 大文件需要拆分

**严重性**：维护困难，容易出现合并冲突

| 文件路径 | 行数 | 问题 |
|----------|------|------|
| `cli/cc-ink/yoga-layout/index.ts` | 2,427 | 可能是 vendor 代码，考虑外置 |
| `cli/cc-ink/ink/render-node-to-output.ts` | 1,381 | Ink 底层渲染自定义 |
| `server/routes.ts` | 980 | 路由过于集中，应按功能拆分 |
| `server/websocket.ts` | 913 | WebSocket 处理混杂 |
| `subtask/error-handler.ts` | 651 | 错误处理逻辑过于膨胀 |
| `tool/tool.ts` | 637 | 工具定义集中 |

**建议方案**：
- `routes.ts` → 按功能拆分为 `routes/session.ts`、`routes/agent.ts` 等
- `websocket.ts` → 拆分消息处理为独立 handler
- `error-handler.ts` → 按错误类型拆分
- vendor 代码（yoga-layout、ink fork）评估是否可用上游包替代

**预估工时**：半天

---

## 🟡 中优先级问题

### P4. cli 目录过大（124 文件）

`cli/cc-ink/` 包含大量 Ink 框架的 fork/自定义实现代码。

**风险**：
- 上游 Ink 5 更新时同步困难
- 维护成本高，需要了解 Ink 内部实现

**建议**：
- 评估每个 Ink 定制的必要性
- 尝试通过 Ink 5 官方 API + 自定义组件替代 fork
- 无法替代的部分抽为独立的 `@naughtyagent/ink-extended` 包

---

### P5. 依赖重复/冗余

**同时使用两套 Anthropic SDK**：
- `@ai-sdk/anthropic` ^3.0.13（Vercel AI SDK 封装）
- `@anthropic-ai/sdk` ^0.78.0（Anthropic 官方 SDK）

**同时使用两个 Tokenizer**：
- `@anthropic-ai/tokenizer` ^0.0.4
- `tiktoken` ^1.0.22

**建议**：统一为一套 SDK + 一个 tokenizer

---

### P6. `planning` 空目录

目录存在但无任何文件。

**建议**：如果已废弃 → 删除；如果计划中 → 添加 README 说明

---

### P7. 测试覆盖率不明

有 133 个测试文件和 vitest 配置，但缺少覆盖率报告。

**建议**：添加 `vitest --coverage` 配置，设定覆盖率基线（建议 60%+）

---

## 🟢 低优先级/长期建议

### P8. 工具/子任务模块复杂度

`tool/`（39 文件）和 `subtask/`（27 文件）是最大功能模块，需注意分层。

### P9. 文档同步

架构文档需确认与 v0.10.0 代码是否同步。

### P10. 缺少 CHANGELOG

建议添加 CHANGELOG.md 或使用 conventional commits 自动生成。

---

## ⚡ 执行优先级

| 优先级 | 任务 | 预估工时 | 阻塞发布 |
|--------|------|----------|----------|
| P1 | 修复 VSCode 类型错误 | 30 分钟 | ✅ |
| P2 | 添加 ESLint + Prettier | 1-2 小时 | ❌ |
| P3 | 拆分大文件 | 半天 | ❌ |
| P4 | 评估 Ink fork 必要性 | 2 小时分析 | ❌ |
| P5 | 依赖去重 | 1-2 小时 | ❌ |
| P6 | 清理空目录 | 5 分钟 | ❌ |
| P7 | 配置测试覆盖率 | 30 分钟 | ❌ |
| P8-P10 | 持续改进 | 持续 | ❌ |

---

## ✅ 项目亮点

1. **TypeScript 类型安全**：agent 包编译零错误（65K 行代码）
2. **代码整洁**：0 个 TODO/FIXME/HACK 标记
3. **文档完善**：架构设计、使用指南、开发阶段均有文档
4. **模块化清晰**：22 个功能目录，职责分明
5. **测试意识**：133 个测试文件 + vitest 配置