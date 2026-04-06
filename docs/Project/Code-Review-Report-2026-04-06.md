# 📋 NaughtAgent 代码审查报告

> 生成时间：2026-04-06
> 审查方式：3 专家并行审查（架构师 + 代码审查 + 测试专家）
> 审查范围：`packages/agent/src/`

---

## 执行概览

| 指标 | 值 |
|------|-----|
| 团队规模 | 3 位专家 |
| 成功完成 | 3 ✅ |
| 项目文件数 | 348 |
| 测试文件数 | 129 |
| 综合评分 | **6.8 / 10** |

---

## 各专家评分

| 角色 | 评分 | 核心结论 |
|------|------|----------|
| 🏗️ 架构师 | **7.5/10** | 分层清晰（L0-L5），22 模块无循环依赖；tool↔agent 耦合 + cc-ink 膨胀是主要债务 |
| 🔍 代码审查 | **6.5/10** | Tool.define() 统一注册 + Schema 完整；错误处理不统一 + 重复代码 + safePath 未使用 |
| 🧪 测试专家 | **6.5/10** | 已有测试质量高（property test）；14 个功能型工具零测试 + 3 个模块整体缺失 |

---

## 架构分析

### 目录结构（5 层架构）

| 层级 | 目录 | 职责 | 评价 |
|------|------|------|------|
| L0 基础 | config/, error/, logging/ | 常量、错误类型、日志 | ✅ 干净无依赖 |
| L1 核心 | token/, provider/, session/, permission/, security/ | Tokenizer、LLM 适配、会话、权限 | ✅ 职责清晰 |
| L2 服务 | context/, rules/, mcp/, tool/, skill/, interaction/, ux/ | 上下文、工具、技能、MCP | ⚠️ tool↔agent 耦合 |
| L3 编排 | agent/, subtask/, command/, justfile/ | Agent 主循环、子任务、命令路由 | ⚠️ subtask 文件过多 |
| L4 进程 | daemon/, server/ | 后台进程、HTTP/WS API | ✅ |
| L5 UI | cli/ (含 cc-ink 115 文件) | CLI 界面 | ⚠️ 严重膨胀 |

### 依赖关系

```
cli → agent → tool → config/error/logging (正常)
tool → agent (⚠️ 反向依赖：compact.ts)
agent → tool (正常)
```

---

## 🔴 高优先级问题

### H1: tool↔agent 双向耦合
- **位置**: `tool/compact.ts:11` → `agent/compact`
- **影响**: 工具层(L2)上调代理层(L3)，破坏分层原则
- **建议**: 将 compact 逻辑下沉到 session/ 或 token/ 共享层

### H2: 错误处理三种模式并存
- **现状**:
  - read/edit/grep: `throw new Error()`
  - write/append/memory: `return { output: "Error..." }`（不抛异常）
  - web-fetch: `return { isError: true }`
- **影响**: 调用方无法统一判断成功/失败
- **建议**: 统一为一种模式（推荐 throw + Tool.define 统一捕获）

### H3: safePath() 安全函数未使用
- **位置**: `safe-path.ts` 导出 `safePath()`（带沙箱检查）和 `resolvePath()`（宽松）
- **现状**: 所有工具一律使用 `resolvePath()`
- **影响**: 文件系统访问无沙箱限制
- **建议**: 评估安全需求，决定是否启用沙箱或移除死代码

### H4: 14 个功能型工具零测试
- **缺失**: cron, memory, web-fetch, load-skill, create-skill, emit-event, plan-mode, background-task, notebook-edit, compact, append, file-access-budget, mcp-resource, vscode-reload
- **影响**: 核心用户功能无回归保护
- **建议**: 按使用频率优先补充 memory → cron → web-fetch → load-skill

---

## 🟡 中优先级问题

| # | 问题 | 位置 | 建议 |
|---|------|------|------|
| M1 | cc-ink 115 文件内嵌 src/（占 33%） | `cli/cc-ink/` | 抽为独立 package 或移至 vendor/ |
| M2 | isBinaryFile() 重复实现且逻辑不同 | `read.ts:77` vs `grep.ts:87` | 提取到 shared util |
| M3 | generateDiff() 重复实现 | `write.ts:126` vs `edit.ts:17` | 提取到 ux/diff |
| M4 | memory.ts 同步 I/O | `memory.ts:15` | 改为 async API |
| M5 | config/justfile/server 模块缺测试 | 3 个模块 | 补充核心测试 |
| M6 | memory.ts 错误返回缺 isError | `memory.ts:59-61` | 补充 `isError: true` |

---

## 🟢 低优先级问题

| # | 问题 | 建议 |
|---|------|------|
| L1 | context/ 与 rules/ 职责重叠 | 合并 rules → context/rules |
| L2 | web-fetch 中英文混用 | 统一为英文 |
| L3 | command/ 过度工程（18 文件） | 评估是否简化 |
| L4 | DEFAULT_TIMEOUT 命名遮蔽 | bash.ts 120s vs tool.ts 30s 同名 |
| L5 | write.ts diff 头格式错误 | 使用 hunk 行数而非全文行数 |

---

## 一致性正面评价

- ✅ 全部工具通过 `Tool.define()` 统一注册，自动超时 + 日志 + 参数校验
- ✅ Zod Schema 定义完整，所有参数均有 `.describe()`
- ✅ 命名规范一致：文件 kebab-case、变量 camelCase、导出 PascalCase+Tool
- ✅ 无 TODO/FIXME 遗留
- ✅ `isConcurrencySafe` / `isReadOnly` 标注正确
- ✅ 已有测试质量高，善用 property test 和 Mock

---

## 测试覆盖矩阵

| 模块 | 测试 | 模块 | 测试 |
|------|------|------|------|
| agent/ | ✅ 5 | mcp/ | ✅ 12 |
| cli/ink/ | ✅ 9 | permission/ | ✅ 1 |
| cli/ | ✅ 3 | provider/ | ⚠️ 1 |
| cli/plain-text/ | ❌ 0 | rules/ | ✅ 3 |
| command/ | ✅ 9 | security/ | ✅ 1 |
| config/ | ❌ 0 | server/ | ⚠️ 2 |
| context/ | ✅ 10 | session/ | ✅ 6 |
| daemon/ | ✅ 4 | skill/ | ⚠️ 4 |
| error/ | ✅ 2 | subtask/ | ✅ 17 |
| interaction/ | ✅ 3 | token/ | ✅ 3 |
| justfile/ | ❌ 0 | tool/核心 | ✅ 6 |
| logging/ | ✅ 4 | tool/功能型 | ❌ 0 |

---

## 建议行动路线

| 优先级 | 行动 | 预计工作量 |
|--------|------|-----------|
| P0 | 统一错误处理模式 | 1 天 |
| P0 | 修复 tool↔agent 耦合 | 0.5 天 |
| P1 | 补充功能型工具测试（memory/cron/web-fetch/load-skill） | 2-3 天 |
| P1 | 提取 isBinaryFile + generateDiff 公共函数 | 0.5 天 |
| P2 | cc-ink 独立化 | 1 天 |
| P2 | memory.ts 改 async + 补 isError | 0.5 天 |
| P3 | 补充 config/justfile/server 测试 | 1-2 天 |

> 修复 P0+P1 后预计综合评分可从 **6.8 → 8.0+**