# NaughtAgent 开发进度（2026-04-03）

## 当前版本：v0.9.7

## 已完成

### v0.9.7 — 模型识别修复 + 日志优化
- 系统提示词注入当前模型名：`prompt.ts` 增加 `model` 到 `SystemPromptContext`，`loop.ts:102` 传递 `definition.model?.model`
- Session started 日志从 info 降为 debug：`runner.ts:224` `log.info` → `log.debug`（已改代码，与 v0.9.7 同版本未单独 bump）

### v0.9.6 — CC Ink 迁移 Phase 1
- CC 自定义 Ink fork 搬入 `src/cli/cc-ink/`
  - `ink/` — 111 文件（tsconfig excluded，不做 strict typecheck）
  - `yoga-layout/` — 纯 TS yoga 布局引擎（2 文件）
  - `compiler-runtime.ts` — React Compiler `_c()` shim
  - 11 个 stub：utils/(debug, log, envUtils, intl, earlyInput, fullscreen, semver, execFileNoThrow, env, sliceAnsi) + bootstrap/state.ts
- 8 个绝对路径 import 修正（`src/xxx` → `../xxx`）
- 12 个 `react/compiler-runtime` import 重写为本地 shim
- 19 个 npm 依赖已安装（react-reconciler@0.29 配 React 18）
- tsconfig.json exclude 加了 `src/cli/cc-ink/ink/**`
- **cc-ink 尚未接入 CLI，仅搬入代码**

### v0.9.5 — Kiro 清理 + 模型切换修复
- 删除 kiro.ts（944行）+ 8 文件 Kiro 引用清理
- `/model` 切换后 renderer header 显示正确模型名
- thinking/header 顺序修复（buffered empty text delta）

### v0.9.4 — Thinking 400 错误修复 + UI 美化
- 多轮对话 API 400 错误修复：assistant 消息保留 thinking 块和 signature（`loop.ts`）
- thinking 竖线 `│` 流式输出断裂修复：竖线前缀只在行首输出
- 欢迎界面猫咪 ASCII art + 版本 + 模型高亮
- AI 回复前显示 `═══ claude-sonnet ═══` 身份标识
- 思考用洋红边框 `╭─💭 thinking─╮`
- `/thinking on|off` 和 `/cost` 命令
- 默认启用 thinking（对齐 CC）

### v0.9.3 — CLI Plain-Text 模式
- `cli/plain-text/` 新建 8 模块（types/constants/formatter/renderer/fold-manager/scroll-buffer/interaction/permission-dialog/index）
- `StreamRenderer` 流式渲染器——O(1) 直写 stdout，无累积无重绘
- `FoldManager` 折叠管理——工具输出 >5 行自动折叠，`#N` 命令展开
- `ScrollBuffer` 虚拟滚动——大输出分页（50 行/页）
- `PlainTextInput` 交互层——/help /clear /folds /model /agent /exit 命令
- 权限对话框 Box 绘制，y/a/n 快捷键
- `--ui=plain-text|ink` 参数，默认 plain-text

### v0.9.2 — 项目目录结构统一
- `.naught/` → `.naughty/` 命名统一（10 个源文件修复）
- `.tasks/` → `.naughty/tasks/`、`.team/` → `.naughty/teams/`、`.worktrees/` → `.naughty/worktrees/`
- `config/constants.ts` 新增 `NAUGHTY_PROJECT_DIR = ".naughty"` 统一常量
- 模块级 `process.cwd()` 改为函数延迟求值（修复 Daemon 模式路径错误）

### v0.9.1 — 审计修复批次（P0/P1/P2 共 10 项）
- 熔断器重置死循环修复、read cache 分段读取 bug、grep 重复检测绕过堵漏
- DEFAULT_MAX_STEPS 20000→200、全局 Map 跨 session 泄漏清理
- file-access-budget 路径归一化、compact transcript 写入路径修复
- ToolRegistryCompat 全局实例消灭、memory dedup 误判修复
- 系统提示词"文件读取纪律"新增

### v0.9.0 — 反无限读取三管齐下
- 全局文件访问预算（`file-access-budget.ts`）：同一文件超 5 次返回 stub
- POST_COMPACT 文件恢复注入：compact 后注入最近 5 文件内容
- 循环检测持续化：每 20 步可再触发
- compact 后重置 read cache 和文件访问预算

### v0.8.x（2026-04-01~02）
- v0.8.8: grep catch-all 检测
- v0.8.7: bash 分号复合命令拦截、read cache 全局化、microCompact 保留量 3→10、文件日志系统
- v0.8.6: compact 后 assistant prefill 400 错误修复、compact 保留文件量对齐 CC
- v0.8.5: 无限读取循环四层防护（read cache / hardblock / 循环检测 / 全局熔断）
- v0.8.0: Prompt Cache、Cron 定时任务、MCP 资源工具、子代理精简 7→3（-1337行）、47 工具

### v0.6.0 — 追平 CC 工具集
- 6 新工具 + bash 后台执行 + PlanMode 权限拦截 + 独立 memoryExtractor
- 子代理精简删除 4 模式（-1281行），保留 ask_llm/run_agent/fork_agent

### v0.5.0 — CC 源码改进 Phase D
- 系统提示词/工具并行/Reactive Compact/StreamingToolExecutor

### v0.3.0~v0.1.0（2026-03-30~31）
- Phase A 核心引擎重建：Loop 782→220 行，Runner 535→300 行，7 bug 修复
- 子代理工具传递修复、read 缓存、bash 拦截、常量统一化
- text 输出链路改造、daemon 权限弹窗、dispatch 超时、tool_result 400 修复

## ⚠️ 当前待做任务（新会话必读）

> **以下任务尚未完成，不要跳过！**
> 项目结构清理和 CLI plain-text 重写（v0.9.2~v0.9.3）已完成，不要再做。
> 当前工作重心是 **CC Ink 迁移** 和 **CLI 功能增强**。

### 立即要做（优先级最高）

1. **`/model` 命令增强**
   - 无参数时显示所有可用模型列表（从 `MODEL_REGISTRY` 动态读取，显示 shortName + displayName）
   - 支持 `/model claude-opus-4.6` 等带版本号格式
   - 文件：`packages/agent/src/cli/plain-text/index.ts:110-121`
   - 参考：`src/config/models.ts` 的 `getAvailableModels()` 和 `MODEL_REGISTRY`

2. **Session started 日志已降为 debug（代码已改，需 build）**
   - `runner.ts:224`: `log.info` → `log.debug` 已改
   - 需要 `npx tsup` 重新 build + 版本 bump

### CC Ink 迁移 Phase 2（适配层）

3. **创建 cc-ink 导出接口**
   - 创建 `src/cli/cc-ink/index.ts`，导出 render, Box, Text 等核心组件
   - 让 NA 现有 `cli/ink/` 组件（`AIMessage.tsx`、`StatusIndicator.tsx` 等）从 cc-ink 导入而非 npm ink@5
   - Phase 1 已完成（96 文件搬入 + 11 stub + 19 npm 依赖），但 cc-ink 尚未接入 CLI

### CC Ink 迁移 Phase 3（替换引擎）

4. **替换 CLI 引擎**
   - 用 cc-ink 的 render/root 替代当前 plain-text CLI
   - 引用计数 raw mode 管理（CC 的 `App.tsx` 中的方案）→ 解决键盘输入乱字符问题

5. **工具/子Agent 执行细节面板**
   - 默认折叠，Tab/快捷键展开详情
   - 需要 cc-ink 组件能力（CC 的 ToolPanel 组件）

### 收尾

6. **版本同步 + 提交**
   - root package.json（0.9.1）与 agent package.json（0.9.7）版本号不同步
   - 大量改动待 git commit

## 关键文件速查

| 文件 | 用途 |
|------|------|
| `src/cli/plain-text/index.ts` | CLI 入口，/model 命令在这 |
| `src/cli/plain-text/renderer.ts` | 流式渲染器 |
| `src/cli/runner.ts` | Runner 创建、setModel |
| `src/agent/prompt.ts` | 系统提示词构建 |
| `src/agent/loop.ts` | Agent 循环（max_tokens 恢复、循环熔断） |
| `src/agent/compact.ts` | 上下文压缩（POST_COMPACT 文件恢复） |
| `src/config/models.ts` | 模型注册表 MODEL_REGISTRY |
| `src/config/constants.ts` | 统一常量（NAUGHTY_PROJECT_DIR 等） |
| `src/tool/file-access-budget.ts` | 全局文件访问预算 |
| `src/cli/cc-ink/ink/` | CC Ink 源码（111文件，excluded） |
| `src/cli/cc-ink/utils/` | CC Ink stub 文件 |
| `src/cli/cc-ink/compiler-runtime.ts` | React Compiler shim |
| `src/cli/ink/components/AIMessage.tsx` | Thinking 内联展示（CC 风格） |
| `src/cli/ink/components/StatusIndicator.tsx` | 状态栏（含 Cache 信息） |
| `Docs/Project/Design-CC-Ink-Migration.md` | Phase 1 迁移设计文档 |

## 项目统计

| 指标 | 数值 |
|------|------|
| Agent 版本 | v0.9.7 |
| Root 版本 | v0.9.1（需同步） |
| 注册工具数 | 47 |
| 子代理原语 | 3（ask_llm / run_agent / fork_agent） |
| Loop 行数 | ~220（Phase A 从 782 压缩） |
| Runner 行数 | ~300（Phase A 从 535 压缩） |
| cc-ink 文件数 | 111 |
| 累计修复 bug | 30+（含 7 致命级） |
