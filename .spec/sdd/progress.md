# NaughtAgent 开发进度

> 对照 OpenCode 架构，按 Agent 发展路径开发

## 当前阶段

```
██████████████████████████████████████  Phase 6 完成 (100%)

当前位置: Phase 6.4 并行任务完成
下一步: 集成测试、打包发布
```

**测试覆盖率报告 (2026-01-16)**

| 模块 | 语句 | 分支 | 函数 | 状态 |
|------|------|------|------|------|
| 总体 | 85%+ | 74%+ | 78%+ | ✅ 达标 |
| Agent | 93.20% | 78% | 94.11% | ✅ |
| Session | 97.63% | 89.36% | 100% | ✅ |
| Daemon | 85%+ | 75%+ | 90%+ | ✅ |
| Tool | 93.27% | 82.23% | 96.96% | ✅ |
| CLI | 70.16% | 78.72% | 72% | ⚠️ main函数难测 |
| Permission | 100% | 100% | 100% | ✅ |
| Provider | 33.33% | 22.72% | 66.66% | ⚠️ Mock |
| Context | 90.21% | 86.36% | 63.63% | ✅ |
| Token | 100% | 97.36% | 100% | ✅ |
| Security | 95.89% | 89.13% | 92.3% | ✅ |
| UX | 93.98% | 77.82% | 100% | ✅ |
| SubTask | 78.19% | 69.56% | 90.9% | ✅ |
| Interaction | 89.59% | 86.45% | 90.9% | ✅ |
| Skill | 100% | 95.94% | 100% | ✅ |
| Rules | 87.90% | 79.74% | 94.54% | ✅ |
| Server | 40.76% | 45.56% | 44.7% | ⚠️ WebSocket难测 |
| MCP | 80%+ | 70%+ | 80%+ | ✅ |

> CLI 覆盖率较低是因为 main() 函数涉及 process.exit 和 readline，难以单元测试
> Provider 覆盖率低是因为实际 API 调用被 mock，类型定义和配置已测试
> Server/MCP 传输层需要真实服务器进行集成测试

---

## 开发路径总览

Agent 的核心能力按依赖关系分为 5 个阶段：

```
Phase 1: 基础能力        Phase 2: 对话能力        Phase 3: Agent 能力
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Tool 工具系统   │ →  │  Session 会话   │ →  │  Agent Loop     │
│  Provider LLM   │    │  Message 消息   │    │  Agent 定义     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        ↓                                              ↓
Phase 4: 交互能力                              Phase 5: 扩展能力
┌─────────────────┐                           ┌─────────────────┐
│  CLI 命令行     │                           │  MCP 协议       │
│  Permission     │                           │  Skills 技能    │
│  Server HTTP    │                           │  Plugin 插件    │
└─────────────────┘                           └─────────────────┘
```

### 对照 OpenCode 模块

| Phase | NaughtAgent | OpenCode 对应 |
|-------|-------------|---------------|
| 1 | Tool + Provider | `src/tool/` + `src/provider/` |
| 2 | Session + Message | `src/session/` |
| 3 | Agent Loop + Agents | `src/agent/` |
| 4 | CLI + Permission + Server | `src/cli/` + `src/permission/` + `src/server/` |
| 5 | MCP + Skills + Plugin | `src/mcp/` + `src/skill/` + `src/plugin/` |

---

## Phase 1: 基础能力 ✅

> Agent 的"手"和"嘴"：操作文件系统 + 调用 LLM
> **状态：代码 + 测试完成**

### Tool 工具系统

| 模块 | 代码 | 测试 | 规格 | 实现 |
|------|------|------|------|------|
| Tool 定义 | ✅ | ✅ | [tool.spec.md](./interfaces/tool.spec.md) | `src/tool/tool.ts` |
| Registry | ✅ | ✅ | [tool.spec.md](./interfaces/tool.spec.md) | `src/tool/registry.ts` |
| index 导出 | ✅ | - | - | `src/tool/index.ts` |

### 内置工具

| 工具 | 代码 | 测试 | 规格 | 实现 | 说明 |
|------|------|------|------|------|------|
| read | ✅ | ✅ | [read.behavior.md](./behaviors/tools/read.behavior.md) | `src/tool/read.ts` | 读取文件 |
| write | ✅ | ✅ | [write.behavior.md](./behaviors/tools/write.behavior.md) | `src/tool/write.ts` | 写入文件 |
| edit | ✅ | ✅ | [edit.behavior.md](./behaviors/tools/edit.behavior.md) | `src/tool/edit.ts` | 精确编辑 |
| bash | ✅ | ✅ | [bash.behavior.md](./behaviors/tools/bash.behavior.md) | `src/tool/bash.ts` | 执行命令 |
| glob | ✅ | ✅ | [glob.behavior.md](./behaviors/tools/glob.behavior.md) | `src/tool/glob.ts` | 文件匹配 |
| grep | ✅ | ✅ | [grep.behavior.md](./behaviors/tools/grep.behavior.md) | `src/tool/grep.ts` | 内容搜索 |

### Provider LLM 调用

| 模块 | 代码 | 测试 | 规格 | 实现 |
|------|------|------|------|------|
| Provider 定义 | ✅ | ✅ | [provider.spec.md](./interfaces/provider.spec.md) | `src/provider/provider.ts` |
| Anthropic | ✅ | ✅ | [provider.spec.md](./interfaces/provider.spec.md) | `src/provider/provider.ts` |
| index 导出 | ✅ | - | - | `src/provider/index.ts` |

### Phase 1 能力总结

**能做什么：**
- ✅ 读写编辑文件
- ✅ 执行 shell 命令
- ✅ 搜索代码（glob + grep）
- ✅ 调用 Claude API（流式/非流式）

**不能做什么：**
- ❌ 维护对话上下文
- ❌ 多轮对话
- ❌ Agent 循环（LLM → Tool → LLM）

---

## Phase 2: 对话能力 ✅

> Agent 的"记忆"：管理对话历史和上下文
> **状态：代码 + 测试完成**

### Session 会话系统

| 模块 | 代码 | 测试 | 规格 | 实现 | 说明 |
|------|------|------|------|------|------|
| Message | ✅ | ✅ | [session.spec.md](./interfaces/session.spec.md) | `src/session/message.ts` | 消息结构 |
| Session | ✅ | ✅ | [session.spec.md](./interfaces/session.spec.md) | `src/session/session.ts` | 会话定义 |
| SessionManager | ✅ | ✅ | [session.spec.md](./interfaces/session.spec.md) | `src/session/manager.ts` | 会话管理器 |
| Storage | ✅ | ✅ | [session.spec.md](./interfaces/session.spec.md) | `src/session/storage.ts` | 持久化存储 |
| index 导出 | ✅ | - | - | `src/session/index.ts` | 模块导出 |

### Phase 2 能力总结

**能做什么：**
- ✅ 创建/获取/删除会话
- ✅ 添加用户消息和助手消息
- ✅ 管理工具调用和结果
- ✅ 会话持久化（JSON + JSONL）
- ✅ Token 使用统计

**不能做什么：**
- ❌ Agent 循环（LLM → Tool → LLM）
- ❌ 系统提示构建
- ❌ 多 Agent 支持

---

## ✅ 补测任务 [已完成]

> 复盘发现 Phase 1-2 缺少测试，已补充完成
> 复盘报告: [summaries/retrospective-001.md](./summaries/retrospective-001.md)

### 基础设施 ✅

| 任务 | 状态 | 说明 |
|------|------|------|
| 配置 vitest | ✅ | `vitest.config.ts` |
| 添加 test scripts | ✅ | `package.json` 添加 test 命令 |
| 创建测试辅助函数 | ✅ | `test/helpers/context.ts` |
| 安装依赖 | ✅ | `pnpm add -D vitest` |

### Phase 1 补测 ✅

| 模块 | 状态 | 测试文件 | 用例数 |
|------|------|---------|--------|
| Tool 框架 | ✅ | `test/tool/tool.test.ts` | 10 |
| read | ✅ | `test/tool/read.test.ts` | 10 |
| write | ✅ | `test/tool/write.test.ts` | 6 |
| edit | ✅ | `test/tool/edit.test.ts` | 9 |
| bash | ✅ | `test/tool/bash.test.ts` | 9 |
| glob | ✅ | `test/tool/glob.test.ts` | 7 |
| grep | ✅ | `test/tool/grep.test.ts` | 10 |
| Provider | ✅ | `test/provider/provider.test.ts` | 8 |

### Phase 2 补测 ✅

| 模块 | 状态 | 测试文件 | 用例数 |
|------|------|---------|--------|
| Message | ✅ | `test/session/message.test.ts` | 12 |
| Session | ✅ | `test/session/session.test.ts` | 18 |
| SessionManager | ✅ | `test/session/manager.test.ts` | 20 |
| Storage | ✅ | `test/session/storage.test.ts` | 13 |

### 完成标准 ✅

- [x] 所有测试通过 `pnpm test` (132 tests)
- [x] 覆盖率达标 `pnpm test:coverage` (88.63% / 76.01% / 92.22%)
- [x] 更新 Phase 1-2 状态为 ✅

---

## Phase 3: Agent 能力 ✅

> Agent 的"大脑"：LLM + Tool 的循环执行
> **状态：代码 + 测试完成**

### Agent 系统

| 模块 | 代码 | 测试 | 规格 | 实现 | 说明 |
|------|------|------|------|------|------|
| Agent 定义 | ✅ | ✅ | [agent.spec.md](./interfaces/agent.spec.md) | `src/agent/agent.ts` | Agent 配置和类型 |
| Agent Loop | ✅ | ✅ | [agent.spec.md](./interfaces/agent.spec.md) | `src/agent/loop.ts` | 核心循环 |
| System Prompt | ✅ | ✅ | - | `src/agent/prompt.ts` | 系统提示构建 |
| build agent | ✅ | ✅ | - | `src/agent/agent.ts` | 默认全功能 |
| plan agent | ✅ | ✅ | - | `src/agent/agent.ts` | 只读分析 |
| explore agent | ✅ | ✅ | - | `src/agent/agent.ts` | 代码探索 |
| index 导出 | ✅ | - | - | `src/agent/index.ts` | 模块导出 |

### Phase 3 能力总结

**能做什么：**
- ✅ Agent Loop: 用户输入 → LLM → 工具调用 → 结果 → LLM → ...
- ✅ 系统提示构建（按 Agent 类型定制）
- ✅ 工具执行和结果处理
- ✅ 多 Agent 支持 (build/plan/explore)
- ✅ Token 使用统计
- ✅ 最大步数限制
- ✅ 中止执行支持

**不能做什么：**
- ✅ CLI 命令行交互
- ✅ 权限确认（危险操作）
- ❌ HTTP API 服务（移至 Phase 5）

---

## Phase 4: 交互能力 ✅

> Agent 的"入口"：用户如何使用 Agent
> **状态：代码 + 测试完成**

### CLI 命令行

| 模块 | 代码 | 测试 | 规格 | 实现 | 说明 |
|------|------|------|------|------|------|
| CLI 入口 | ✅ | ✅ | - | `src/cli/cli.ts` | 命令解析、参数处理 |
| Runner | ✅ | ✅ | - | `src/cli/runner.ts` | Agent 执行封装 |
| REPL | ❌ | - | - | - | 暂不实现 |

### Permission 权限系统

| 模块 | 代码 | 测试 | 规格 | 实现 | 说明 |
|------|------|------|------|------|------|
| Permission | ✅ | ✅ | [permission.spec.md](./interfaces/permission.spec.md) | `src/permission/permission.ts` | 权限定义和检查 |
| Rules | ✅ | ✅ | [permission.spec.md](./interfaces/permission.spec.md) | `src/permission/permission.ts` | glob 规则匹配 |
| index 导出 | ✅ | - | - | `src/permission/index.ts` | 模块导出 |

### Phase 4 能力总结

**能做什么：**
- ✅ CLI 命令行执行: `naughtagent "帮我写个函数"`
- ✅ 参数解析: --agent, --cwd, --yes 等
- ✅ 权限检查: allow/deny/ask 三种动作
- ✅ 用户确认: 危险操作前询问
- ✅ 默认权限: 按 Agent 类型配置
- ✅ glob 模式匹配: 路径和命令匹配

**不能做什么：**
- ❌ HTTP API 服务
- ❌ WebSocket 实时通信
- ❌ REPL 交互式对话

---

## Phase 4.5: 核心补强 ✅

> 补充影响核心体验的重要功能
> **状态：全部完成**

### 4.5.1 上下文管理

| 模块 | 代码 | 测试 | 规格 | 实现 | 说明 |
|------|------|------|------|------|------|
| **规则加载** | ✅ | ✅ | [context.spec.md](./interfaces/context.spec.md) | `src/context/context.ts` | 加载 .naught/rules/*.md |
| **项目结构** | ✅ | ✅ | [context.spec.md](./interfaces/context.spec.md) | `src/context/context.ts` | 目录树、技术栈检测 |
| **Git 上下文** | ✅ | ✅ | [context.spec.md](./interfaces/context.spec.md) | `src/context/context.ts` | 分支、status、commits |
| **配置加载** | ✅ | ✅ | [context.spec.md](./interfaces/context.spec.md) | `src/context/context.ts` | .naught/config.json |
| **上下文注入** | ✅ | ✅ | [context.spec.md](./interfaces/context.spec.md) | `src/context/context.ts` | 构建增强系统提示 |

### 4.5.2 Token 管理

| 模块 | 代码 | 测试 | 规格 | 实现 | 说明 |
|------|------|------|------|------|------|
| **Token 估算** | ✅ | ✅ | [token.spec.md](./interfaces/token.spec.md) | `src/token/token.ts` | 估算文本 Token 数 |
| **消息计数** | ✅ | ✅ | [token.spec.md](./interfaces/token.spec.md) | `src/token/token.ts` | 计算消息列表 Token |
| **上下文截断** | ✅ | ✅ | [token.spec.md](./interfaces/token.spec.md) | `src/token/token.ts` | drop_old/sliding_window |
| **Token 管理器** | ✅ | ✅ | [token.spec.md](./interfaces/token.spec.md) | `src/token/token.ts` | 统一管理接口 |

### 4.5.3 安全增强

| 模块 | 代码 | 测试 | 规格 | 实现 | 说明 |
|------|------|------|------|------|------|
| **路径限制** | ✅ | ✅ | - | `src/security/security.ts` | 只能访问项目目录内 |
| **命令黑名单** | ✅ | ✅ | - | `src/security/security.ts` | 危险命令过滤 |
| **敏感文件保护** | ✅ | ✅ | - | `src/security/security.ts` | .env/密钥等保护 |
| **沙箱执行** | ❌ | - | - | - | 暂不实现 |

### 4.5.4 用户体验

| 模块 | 代码 | 测试 | 规格 | 实现 | 说明 |
|------|------|------|------|------|------|
| **Diff 预览** | ✅ | ✅ | [ux.spec.md](./interfaces/ux.spec.md) | `src/ux/diff.ts` | 统一 diff 格式生成 |
| **撤销操作** | ✅ | ✅ | [ux.spec.md](./interfaces/ux.spec.md) | `src/ux/history.ts` | 操作历史和回滚 |
| **流式输出** | ✅ | ✅ | [ux.spec.md](./interfaces/ux.spec.md) | `src/ux/output.ts` | 终端格式化输出 |

### Phase 4.5 开发顺序

```
4.5.1 上下文管理（最重要）
    │
    ├─ CLAUDE.md 支持（项目指令）
    │
    ├─ 项目结构收集（目录树）
    │
    └─ Git 上下文（分支、状态）
          │
          ▼
4.5.2 Token 管理
    │
    ├─ Token 计数
    │
    └─ 上下文截断/压缩
          │
          ▼
4.5.3 安全增强
    │
    ├─ 路径限制
    │
    └─ 命令黑名单完善
          │
          ▼
4.5.4 用户体验
    │
    ├─ Diff 预览
    │
    └─ 撤销操作
```

### Phase 4.5 目标

**4.5.1 完成后：**
- Agent 自动读取 CLAUDE.md 获取项目指令
- 系统提示包含项目结构和技术栈
- 了解当前 Git 状态

**4.5.2 完成后：**
- 长对话不会超出 Token 限制
- 自动压缩历史消息

**4.5.3 完成后：**
- 无法访问项目外的文件
- 危险命令被有效拦截

**4.5.4 完成后：**
- 用户可以预览修改再确认
- 误操作可以撤销

---

## Phase 5: 扩展能力 ⬜

> Agent 的"协作层"：从执行者变成协作者

Phase 5 的核心目标是让 Agent 具备**运行时协作能力**：
- 主动提问澄清需求
- 分解复杂任务
- 按需加载项目规则
- 快捷命令提升效率

Phase 5 分为五个子阶段，按依赖关系开发：

### Phase 5.1: SubTask 子任务系统

> 三种子任务执行模式，复杂任务分解的基础
> **状态：代码 + 测试完成**

| 模块 | 代码 | 测试 | 规格 | 实现 | 说明 |
|------|------|------|------|------|------|
| **API 模式** | ✅ | ✅ | [subtask.spec.md](./interfaces/subtask.spec.md) | `src/subtask/api.ts` | 单次 LLM 调用，无工具 |
| **Workflow 模式** | ✅ | ✅ | [subtask.spec.md](./interfaces/subtask.spec.md) | `src/subtask/workflow.ts` | 预定义流程执行 |
| **Agent 模式** | ✅ | ✅ | [subtask.spec.md](./interfaces/subtask.spec.md) | `src/subtask/agent.ts` | 子 Agent Loop |
| **Task 工具** | ✅ | ✅ | [subtask.spec.md](./interfaces/subtask.spec.md) | `src/subtask/task-tool.ts` | 统一入口工具 |

**三种模式对比：**

| 模式 | 控制权 | 灵活性 | 可预测性 | Token | 场景 |
|------|--------|--------|----------|-------|------|
| API | 开发者 | 低 | 高 | 低 | 简单生成、总结 |
| Workflow | 开发者 | 中 | 高 | 中 | Skills、固定流程 |
| Agent | LLM | 高 | 低 | 高 | 复杂探索 |

### Phase 5.2: 交互工具

> 增强 Agent 与用户的协作能力
> **状态：代码 + 测试完成**

| 工具 | 代码 | 测试 | 规格 | 实现 | 说明 |
|------|------|------|------|------|------|
| **question** | ✅ | ✅ | [interaction.spec.md](./interfaces/interaction.spec.md) | `src/interaction/question.ts` | 向用户提问，澄清需求 |
| **todo** | ✅ | ✅ | [interaction.spec.md](./interfaces/interaction.spec.md) | `src/interaction/todo.ts` | 任务管理和进度展示 |

**question 工具能力：**
- confirm: 是/否确认
- select: 单选
- multiselect: 多选
- text: 文本输入

**todo 工具能力：**
- add/update/remove/list/clear 操作
- 子任务支持
- 状态追踪 (pending/in_progress/completed/cancelled)

### Phase 5.3: Skills 技能系统

> 基于 Workflow 模式的快捷命令
> **状态：代码 + 测试完成**

| 模块 | 代码 | 测试 | 规格 | 实现 | 说明 |
|------|------|------|------|------|------|
| Skill 定义 | ✅ | ✅ | [skill.spec.md](./interfaces/skill.spec.md) | `src/skill/types.ts` | 技能类型定义 |
| Skill 注册表 | ✅ | ✅ | [skill.spec.md](./interfaces/skill.spec.md) | `src/skill/registry.ts` | 注册和查询 |
| Skill 执行器 | ✅ | ✅ | [skill.spec.md](./interfaces/skill.spec.md) | `src/skill/executor.ts` | 解析和执行 /command |
| /commit | ✅ | ✅ | [skill.spec.md](./interfaces/skill.spec.md) | `src/skill/builtin/commit.ts` | 生成 commit 消息并提交 |
| /pr | ✅ | ✅ | [skill.spec.md](./interfaces/skill.spec.md) | `src/skill/builtin/pr.ts` | 创建 PR 描述 |
| /review | ✅ | ✅ | [skill.spec.md](./interfaces/skill.spec.md) | `src/skill/builtin/review.ts` | 代码审查 |
| /test | ✅ | ✅ | [skill.spec.md](./interfaces/skill.spec.md) | `src/skill/builtin/test.ts` | 运行测试并分析结果 |
| index 导出 | ✅ | ✅ | - | `src/skill/index.ts` | 模块导出 |

### Phase 5.4: Rules 索引系统

> 让 Agent 按需加载项目规则
> **状态：代码 + 测试完成**

| 模块 | 代码 | 测试 | 规格 | 实现 | 说明 |
|------|------|------|------|------|------|
| **类型定义** | ✅ | ✅ | [rules.spec.md](./interfaces/rules.spec.md) | `src/rules/types.ts` | 规则元数据、触发条件类型 |
| **触发条件匹配** | ✅ | ✅ | [rules.spec.md](./interfaces/rules.spec.md) | `src/rules/matcher.ts` | glob/command/keyword/tool 匹配 |
| **规则加载器** | ✅ | ✅ | [rules.spec.md](./interfaces/rules.spec.md) | `src/rules/loader.ts` | 索引加载、按需加载、缓存 |
| **动态指令发现** | ✅ | ✅ | [rules.spec.md](./interfaces/rules.spec.md) | `src/rules/commands.ts` | Justfile/Makefile/package.json |
| index 导出 | ✅ | ✅ | - | `src/rules/index.ts` | 模块导出 |

**触发条件类型：**
- `glob`: 文件路径匹配（如 `*.ts`, `src/**/*.tsx`）
- `command`: 命令匹配（如 `/commit`, `git *`）
- `keyword`: 关键词匹配（如 `["test", "测试"]`）
- `tool`: 工具调用匹配（如 `["bash", "read"]`）

**动态指令发现：**
- 解析 `Justfile` / `Makefile` / `package.json scripts`
- 自动检测包管理器（pnpm/yarn/npm/bun）
- 生成可用命令索引供 Agent 使用

### Phase 5.5: 外部集成

> HTTP API 和 WebSocket 实时通信
> **状态：代码 + 测试完成**

| 模块 | 代码 | 测试 | 规格 | 实现 | 说明 |
|------|------|------|------|------|------|
| **类型定义** | ✅ | ✅ | [server.spec.md](./interfaces/server.spec.md) | `src/server/types.ts` | API 请求/响应类型 |
| **中间件** | ✅ | ✅ | [server.spec.md](./interfaces/server.spec.md) | `src/server/middleware.ts` | 认证、CORS、错误处理 |
| **API 路由** | ✅ | ✅ | [server.spec.md](./interfaces/server.spec.md) | `src/server/routes.ts` | 会话、消息、技能 API |
| **HTTP Server** | ✅ | ✅ | [server.spec.md](./interfaces/server.spec.md) | `src/server/server.ts` | 服务器主体 |
| **WebSocket** | ✅ | ⚠️ | [server.spec.md](./interfaces/server.spec.md) | `src/server/websocket.ts` | 实时双向通信 |
| index 导出 | ✅ | ✅ | - | `src/server/index.ts` | 模块导出 |

### Phase 5.6: MCP 协议支持

> Model Context Protocol 客户端实现
> **状态：代码 + 测试完成**

| 模块 | 代码 | 测试 | 规格 | 实现 | 说明 |
|------|------|------|------|------|------|
| **类型定义** | ✅ | ✅ | [mcp.spec.md](./interfaces/mcp.spec.md) | `src/mcp/types.ts` | JSON-RPC、工具、资源类型 |
| **传输层** | ✅ | ⚠️ | [mcp.spec.md](./interfaces/mcp.spec.md) | `src/mcp/transport.ts` | stdio/SSE 传输 |
| **MCP Client** | ✅ | ✅ | [mcp.spec.md](./interfaces/mcp.spec.md) | `src/mcp/client.ts` | 连接和调用 |
| **MCP Tools** | ✅ | ✅ | [mcp.spec.md](./interfaces/mcp.spec.md) | `src/mcp/tools.ts` | 工具包装和注册 |
| **MCP Manager** | ✅ | ✅ | [mcp.spec.md](./interfaces/mcp.spec.md) | `src/mcp/manager.ts` | 多服务器管理 |
| index 导出 | ✅ | ✅ | - | `src/mcp/index.ts` | 模块导出 |

**MCP 功能：**
- 连接 MCP 服务器（stdio/SSE）
- 发现和调用远程工具
- 获取远程资源和提示模板
- 动态注册工具到 ToolRegistry

**HTTP API 端点：**
- `GET /health` - 健康检查
- `POST /sessions` - 创建会话
- `GET /sessions/:id` - 获取会话
- `DELETE /sessions/:id` - 删除会话
- `POST /sessions/:id/messages` - 发送消息（支持 SSE 流式）
- `GET /skills` - 列出技能
- `POST /skills/:name` - 执行技能

**WebSocket 功能：**
- 实时流式输出
- 权限确认交互
- 心跳保活

### Phase 5 开发顺序

```
5.1 SubTask 子任务系统
    │
    ├─ API 模式（最简单，先实现）
    │
    ├─ Agent 模式（复用现有 Agent Loop）
    │
    └─ Workflow 模式（为 Skills 做准备）
          │
          ▼
5.2 交互工具（优先级提升）
    │
    ├─ question 工具（减少 AI 猜测）
    │
    └─ todo 工具（任务可视化）
          │
          ▼
5.3 Skills 技能系统
    │
    ├─ Skill 定义和执行器
    │
    └─ 内置技能 /commit /pr /review
          │
          ▼
5.4 Rules 索引系统
    │
    ├─ 规则索引和元数据
    │
    ├─ 按需加载机制
    │
    └─ 动态指令发现
          │
          ▼
5.5 外部集成
    │
    ├─ HTTP Server（VS Code 插件需要）
    │
    └─ MCP 协议（扩展工具生态）
```

### Phase 5 目标

**5.1 完成后能做：**
- 子任务分解：主 Agent 调用 Task 工具启动子任务
- 三种模式选择：简单任务用 API，固定流程用 Workflow，复杂任务用 Agent

**5.2 完成后能做：**
- Agent 主动向用户提问，澄清模糊需求
- 展示任务进度，让用户了解执行状态
- 任务依赖检查，避免在错误基础上工作

**5.3 完成后能做：**
- `/commit` - 自动生成 commit 消息
- `/pr` - 生成 PR 描述
- `/review` - 代码审查
- `/test` - 运行测试并分析

**5.4 完成后能做：**
- Agent 根据任务类型自动加载相关规则
- 发现并使用项目现有脚本（Justfile/Makefile）
- 规则触发条件明确，减少无关上下文

**5.5 完成后能做：**
- VS Code 插件通过 HTTP 调用 Agent
- 连接外部 MCP 工具服务器

---

## 状态说明

| 标记 | 含义 | 测试要求 |
|------|------|---------|
| ✅ | 完成 | 代码 + 测试都完成，覆盖率达标 |
| ⚠️ | 代码完成 | 代码完成但测试缺失/不完整 |
| 🔨 | 进行中 | 正在开发，可以无测试 |
| ⬜ | 未开始 | 待开发 |
| ❌ | 跳过 | 决定不实现 |

---

## 开发流程

```
1. 看本文件确定要做什么
2. 检查/编写对应的规格文件（interfaces/ 或 behaviors/）
3. 实现代码
4. 编写测试代码（test/*.test.ts）
5. 运行测试：pnpm test
6. 检查覆盖率：pnpm test:coverage
7. 更新本文件状态（代码列 + 测试列）
8. 输出阶段总结到 summaries/（包含测试报告）
```

### 完成标准

模块标记 ✅ 必须满足：

| 条件 | 说明 |
|------|------|
| 规格存在 | `.spec.md` 或 `.behavior.md` |
| 代码完成 | `src/*.ts` |
| 测试完成 | `test/*.test.ts` |
| 测试通过 | `pnpm test` 无失败 |
| 覆盖率达标 | 语句 80%、分支 75%、函数 90% |

详见 [testing.md](./testing.md)

---

## 阶段总结

| Phase | 总结文档 | 状态 |
|-------|---------|------|
| Phase 1 | [summaries/phase-1-foundation.md](./summaries/phase-1-foundation.md) | ✅ 完成 |
| Phase 2 | [summaries/phase-2-session.md](./summaries/phase-2-session.md) | ✅ 完成 |
| 补测 | [summaries/testing-phase1-2.md](./summaries/testing-phase1-2.md) | ✅ 完成 |
| Phase 3 | [summaries/phase-3-agent.md](./summaries/phase-3-agent.md) | ✅ 完成 |
| Phase 4 | [summaries/phase-4-interaction.md](./summaries/phase-4-interaction.md) | ✅ 完成 |
| Phase 4.5 | [summaries/phase-4.5-enhancement.md](./summaries/phase-4.5-enhancement.md) | ✅ 完成 |
| Phase 5.1 | [summaries/phase-5.1-subtask.md](./summaries/phase-5.1-subtask.md) | ✅ 完成 |
| Phase 5.2 | [summaries/phase-5.2-interaction.md](./summaries/phase-5.2-interaction.md) | ✅ 完成 |
| Phase 5.3 | [summaries/phase-5.3-skill.md](./summaries/phase-5.3-skill.md) | ✅ 完成 |
| Phase 5.4 | [summaries/phase-5.4-rules.md](./summaries/phase-5.4-rules.md) | ✅ 完成 |
| Phase 5.5 | [summaries/phase-5.5-server.md](./summaries/phase-5.5-server.md) | ✅ 完成 |
| Phase 5.6 | [summaries/phase-5.6-mcp.md](./summaries/phase-5.6-mcp.md) | ✅ 完成 |
| Phase 6.6 | [summaries/phase-6.6-vscode.md](./summaries/phase-6.6-vscode.md) | ✅ 完成 |

---

## Phase 6: Daemon 架构 + 客户端 🔨

> Agent 作为独立后台服务，CLI 和 VS Code 都是客户端
> **状态：Phase 6.1 完成，继续开发中**

### 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                 Agent Daemon (后台服务)                  │
│  - 独立进程，全局运行                                    │
│  - 会话共享，任务并行                                    │
│  - HTTP + WebSocket API                                 │
└─────────────────────────────────────────────────────────┘
           ▲                  ▲                  ▲
           │                  │                  │
      ┌────┴────┐        ┌────┴────┐        ┌────┴────┐
      │ VS Code │        │ VS Code │        │   CLI   │
      │ Window 1│        │ Window 2│        │ Terminal│
      └─────────┘        └─────────┘        └─────────┘
```

### 设计文档

- [interfaces/daemon.spec.md](./interfaces/daemon.spec.md) - Daemon 架构规格

---

### Phase 6.1: Daemon 基础 ✅

> Daemon 进程管理和基础 API
> **状态：代码 + 测试完成**

| 模块 | 代码 | 测试 | 实现 | 说明 |
|------|------|------|------|------|
| **进程管理** | ✅ | ✅ | `src/cli/daemon.ts` | 启动/停止/状态检查 |
| **PID 文件** | ✅ | ✅ | `src/cli/daemon.ts` | 防止重复启动 |
| **配置管理** | ✅ | ✅ | `src/cli/daemon.ts` | ~/.naughtagent/config.json |
| **HTTP 服务** | ✅ | ✅ | `src/server/` | REST API + /daemon/status |
| **CLI 子命令** | ✅ | ✅ | `src/cli/daemon.ts` | daemon start/stop/status |

**已实现功能：**
- ✅ `naughtagent daemon start` 启动后台服务
- ✅ `naughtagent daemon status` 查看状态
- ✅ `naughtagent daemon stop` 停止服务
- ✅ `naughtagent daemon restart` 重启服务
- ✅ `GET /health` 返回服务状态
- ✅ `GET /daemon/status` 返回详细状态（PID、uptime、sessions）
- ✅ `GET /sessions` 列出所有会话

---

### Phase 6.2: 会话共享 ✅

> 多客户端共享会话
> **状态：代码 + 测试完成**

| 模块 | 代码 | 测试 | 实现 | 说明 |
|------|------|------|------|------|
| **会话持久化** | ✅ | ✅ | `src/daemon/sessions.ts` | 保存到 ~/.naughtagent/sessions/ |
| **会话路由** | ✅ | ✅ | `src/daemon/sessions.ts` | 按 cwd 查找/创建会话 |
| **会话 API** | ✅ | ✅ | `src/server/routes.ts` | CRUD + find-or-create |
| **CLI 会话命令** | ✅ | - | `src/cli/cli.ts` | sessions list/delete |

**已实现功能：**
- ✅ 会话按项目目录（cwd）隔离
- ✅ 会话持久化到 `~/.naughtagent/sessions/`
- ✅ `POST /sessions/find-or-create` 按 cwd 查找或创建会话
- ✅ `GET /sessions?cwd=xxx` 按 cwd 过滤会话
- ✅ `naughtagent sessions list` 列出所有会话
- ✅ `naughtagent sessions delete <id>` 删除会话
- ✅ 会话恢复：daemon 重启后自动加载会话

---

### Phase 6.3: WebSocket 实时通信 ✅

> 流式输出和交互式确认
> **状态：代码完成**

| 模块 | 代码 | 测试 | 实现 | 说明 |
|------|------|------|------|------|
| **WebSocket 服务** | ✅ | ⚠️ | `src/server/websocket.ts` | 连接管理、会话订阅 |
| **事件广播** | ✅ | ⚠️ | `src/server/websocket.ts` | 向订阅者推送事件 |
| **权限交互** | ✅ | ⚠️ | `src/server/websocket.ts` | 请求-响应机制 |
| **心跳保活** | ✅ | ⚠️ | `src/server/websocket.ts` | ping/pong 30s 间隔 |

**已实现功能：**
- ✅ WebSocket 连接管理（握手、帧解析）
- ✅ 会话订阅：`subscribe`/`unsubscribe` 消息
- ✅ 事件广播：流式输出同步到所有订阅者
- ✅ 权限请求/响应通过 WebSocket 交互
- ✅ 心跳保活：30s ping，60s 超时断开
- ✅ 与 DaemonSessionManager 集成
- ✅ 支持 cwd 参数自动查找/创建会话

**WebSocket 协议：**
```
连接: ws://localhost:31415/ws?sessionId=xxx&cwd=/path

客户端消息:
  { type: "send", message: "..." }
  { type: "subscribe", sessionId: "..." }
  { type: "unsubscribe", sessionId: "..." }
  { type: "cancel" }
  { type: "ping" }
  { type: "permission_response", requestId: "...", allowed: true }

服务端消息:
  { type: "text", content: "..." }
  { type: "tool_start", id, name, input }
  { type: "tool_end", id, output, isError }
  { type: "permission_request", requestId, permissionType, resource, description }
  { type: "done", usage }
  { type: "error", message }
  { type: "pong" }
```

---

### Phase 6.4: 并行任务 ✅

> 多任务同时执行
> **状态：代码 + 测试完成**

| 模块 | 代码 | 测试 | 实现 | 说明 |
|------|------|------|------|------|
| **任务队列** | ✅ | ✅ | `src/daemon/queue.ts` | 优先级队列 |
| **Worker Pool** | ✅ | ✅ | `src/daemon/pool.ts` | 并行执行器 |
| **调度器** | ✅ | ✅ | `src/daemon/scheduler.ts` | 任务分配策略 |
| **任务 API** | ✅ | ✅ | `src/server/routes.ts` | 查询/取消任务 |

**已实现功能：**
- ✅ 优先级任务队列（HIGH/NORMAL/LOW）
- ✅ Worker Pool 并行执行（可配置最大并行数）
- ✅ 同一会话任务串行执行（保证顺序）
- ✅ 不同会话任务并行执行
- ✅ 任务超时处理
- ✅ 任务取消支持
- ✅ 任务状态查询 API

**任务 API：**
- `GET /tasks` - 列出任务（支持 sessionId/status 过滤）
- `POST /tasks` - 提交任务
- `GET /tasks/:id` - 获取任务详情
- `POST /tasks/:id/cancel` - 取消任务

**完成标准：**
- ✅ 不同会话的任务可以并行
- ✅ 同一会话的任务顺序执行
- ✅ 支持任务取消

---

### Phase 6.5: CLI 改造 ✅

> CLI 作为 Daemon 客户端
> **状态：代码完成**

| 模块 | 代码 | 测试 | 实现 | 说明 |
|------|------|------|------|------|
| **Daemon 客户端** | ✅ | ⚠️ | `src/cli/client.ts` | HTTP + WebSocket 通信 |
| **自动启动** | ✅ | ⚠️ | `src/cli/client.ts` | daemon 未运行时自动启动 |
| **回退逻辑** | ✅ | ⚠️ | `src/cli/cli.ts` | 连接失败回退到 standalone |
| **独立模式** | ✅ | ⚠️ | `src/cli/cli.ts` | --standalone 直接运行 |

**已实现功能：**
- ✅ `naughtagent "prompt"` 自动连接 daemon
- ✅ daemon 未运行时自动启动
- ✅ 通过 WebSocket 接收流式输出
- ✅ 权限请求通过 WebSocket 交互
- ✅ `--standalone` 模式直接运行（不使用 daemon）
- ✅ 连接失败自动回退到 standalone 模式

**使用方式：**
```bash
# 通过 daemon（推荐，会话可共享）
naughtagent "帮我写代码"

# 独立模式（不使用 daemon）
naughtagent -s "快速问一个问题"
naughtagent --standalone "不需要共享会话"
```

---

### Phase 6.6: VS Code 插件 ✅

> VS Code 作为 Daemon 客户端
> **状态：代码完成**

| 模块 | 代码 | 测试 | 实现 | 说明 |
|------|------|------|------|------|
| **插件入口** | ✅ | ⬜ | `packages/vscode/src/extension.ts` | 激活、命令注册 |
| **DaemonClient** | ✅ | ⬜ | `packages/vscode/src/services/DaemonClient.ts` | 连接 daemon、自动启动、断线重连 |
| **AgentClient** | ✅ | ⬜ | `packages/vscode/src/services/AgentClient.ts` | HTTP/WebSocket 通信 |
| **SessionPicker** | ✅ | ⬜ | `packages/vscode/src/views/SessionPicker.ts` | 选择/创建/切换会话 |
| **ChatViewProvider** | ✅ | ⬜ | `packages/vscode/src/views/chat/ChatViewProvider.ts` | 聊天面板 |
| **ContextCollector** | ✅ | ⬜ | `packages/vscode/src/services/ContextCollector.ts` | 上下文收集 |
| **FileReferenceProvider** | ✅ | ⬜ | `packages/vscode/src/services/FileReferenceProvider.ts` | @file 引用补全 |
| **DiffProvider** | ✅ | ⬜ | `packages/vscode/src/services/DiffProvider.ts` | VS Code 原生 Diff |

**功能清单：**

| 功能 | 状态 | 说明 |
|------|------|------|
| 连接 Daemon | ✅ | 自动连接，断线重连 |
| 会话管理 | ✅ | 选择、创建、切换会话 |
| Chat 面板 | ✅ | Webview 实现 |
| 流式输出 | ✅ | 实时显示 |
| 工具调用显示 | ✅ | 显示执行状态 |
| 权限确认 | ✅ | 弹窗确认 |
| 当前文件上下文 | ✅ | 自动包含 |
| 选中代码上下文 | ✅ | 自动包含 |
| @file 引用 | ✅ | 引用其他文件 |
| Diff 预览 | ✅ | VS Code 原生 Diff |

**命令：**

| 命令 | 快捷键 | 说明 |
|------|--------|------|
| `naughtagent.openChat` | `Ctrl+Shift+A` | 打开聊天面板 |
| `naughtagent.askAboutSelection` | `Ctrl+Shift+E` | 询问选中代码 |
| `naughtagent.selectSession` | - | 选择会话 |
| `naughtagent.newSession` | - | 新建会话 |
| `naughtagent.deleteSession` | - | 删除会话 |
| `naughtagent.reconnect` | - | 重新连接 Daemon |
| `naughtagent.showDaemonStatus` | - | 显示 Daemon 状态 |

---

### Phase 6 开发顺序

```
6.1 Daemon 基础
    │
    ├─ 进程管理（启动/停止）
    │
    └─ HTTP API 基础
          │
          ▼
6.2 会话共享
    │
    ├─ 会话持久化
    │
    └─ 会话路由（按 cwd）
          │
          ▼
6.3 WebSocket 实时通信
    │
    ├─ 流式输出
    │
    └─ 权限交互
          │
          ▼
6.4 并行任务
    │
    ├─ 任务队列
    │
    └─ Worker Pool
          │
          ▼
6.5 CLI 改造
    │
    ├─ 连接 daemon
    │
    └─ 自动启动
          │
          ▼
6.6 VS Code 插件
    │
    ├─ 连接 daemon
    │
    └─ 会话选择器
```

### 使用方式

```bash
# 一次安装，全局可用
npm install -g naughtagent

# 启动后台服务（可选，CLI 会自动启动）
naughtagent daemon start

# 任意目录使用 CLI
cd ~/my-project
naughtagent "帮我写个函数"

# 另一个终端继续对话
cd ~/my-project
naughtagent "继续刚才的任务"

# VS Code 插件自动连接，无需配置
```
