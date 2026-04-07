# 项目目录结构清理设计文档

> 日期：2026-04-03
> 状态：已批准

## 问题

NaughtAgent 当前有 5 个散落的运行时隐藏目录：`.naughty/`、`.naught/`、`.tasks/`、`.team/`、`.worktrees/`。
且 `.naughty/` 与 `.naught/` 命名不一致（笔误），路径全部硬编码在各自源文件中。

## 目标

借鉴 CC 将所有内容存储在 `.claude/` 的做法，将所有项目级运行时数据统一到 `.naughty/` 下。

## 统一后的 `.naughty/` 结构

```
{cwd}/.naughty/
├── memory.md              # 持久记忆（不动）
├── logs/                  # 日志（不动）
├── transcripts/           # 对话存档（不动）
├── skills/                # 项目级 Skills（不动）
├── agents/                # 自定义 Agent 定义（不动）
├── sessions/              # 会话数据（从 .naught/ 迁入）
├── mcp.json               # MCP 配置（从 .naught/mcp.json 迁入）
├── config.json            # 优化配置（从 .naught/config.json 迁入）
├── cache/                 # 项目缓存（从 .naught/cache/ 迁入）
├── rules/                 # 项目规则（从 .naught/rules/ 迁入）
├── tasks/                 # Todo 任务数据（从 .tasks/ 迁入）
├── teams/                 # 全局任务板+inbox（从 .team/ 迁入）
│   ├── tasks/
│   ├── inbox/
│   └── worktrees/         # worktree 元数据
└── worktrees/             # Git worktree 实际目录（从 .worktrees/ 迁入）
```

## 代码改动清单

### 1. `config/constants.ts` — 新增路径常量

```typescript
export const NAUGHTY_PROJECT_DIR = ".naughty"
```

### 2. 需要将 `.naught` → `.naughty` 的文件

| 文件 | 旧路径 | 新路径 |
|------|-------|-------|
| `cli/runner.ts` | `.naught/mcp.json` | `.naughty/mcp.json` |
| `context/optimization-config.ts` | `.naught/config.json` | `.naughty/config.json` |
| `context/index-cache.ts` | `.naught/cache/` | `.naughty/cache/` |
| `context/context.ts` | `.naught/rules/` | `.naughty/rules/` |
| `rules/loader.ts` | `.naught` | `.naughty` |
| `mcp/config.ts` | `.naught/mcp.json` | `.naughty/mcp.json` |
| `mcp/manager.ts` | `.naught/mcp.json` | `.naughty/mcp.json` |
| `session/storage.ts` | `.naught` | `.naughty` |
| `session/migrate.ts` | `.naught/sessions/` | `.naughty/sessions/` |
| `tool/mcp-resource.ts` | `.naught/mcp.json`（提示文本） | `.naughty/mcp.json` |

### 3. 需要迁入 `.naughty/` 的目录

| 文件 | 旧路径 | 新路径 |
|------|-------|-------|
| `interaction/todo.ts` | `{cwd}/.tasks/` | `{cwd}/.naughty/tasks/` |
| `subtask/autonomous.ts` | `{cwd}/.team/` | `{cwd}/.naughty/teams/` |
| `subtask/worktree.ts` | `.team/worktrees/` | `.naughty/teams/worktrees/` |
| `subtask/worktree.ts` | `.worktrees/` | `.naughty/worktrees/` |

### 4. `autonomous.ts` 和 `worktree.ts` — 修复 `process.cwd()` 问题

将模块级 `process.cwd()` 改为函数参数 `cwd`，由调用方传入。

### 5. `.gitignore` — 添加运行时目录忽略

```
# NaughtAgent 运行时数据
.naughty/
```

### 6. 清理旧目录

删除项目根目录下的 `.tasks/`、`.team/` 目录（运行时测试数据）。

## 不变的部分

- `~/.naughtyagent/`（全局用户级目录）不变
- `.naughty/` 下已有的 memory.md、logs/、transcripts/、skills/、agents/ 路径不变
