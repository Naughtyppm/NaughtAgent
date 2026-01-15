# Interface Spec: Context 上下文系统

> 项目规则、上下文收集、配置管理

## 概述

上下文系统负责：
1. 加载项目规则（宪法）
2. 收集项目上下文（结构、Git 状态）
3. 管理 Agent 配置

## 目录结构

```
.naught/
├── rules/                    # 规则目录（宪法）
│   ├── project.md            # 项目概述、技术栈
│   ├── code-style.md         # 代码风格规范
│   ├── architecture.md       # 架构约束
│   └── *.md                  # 其他自定义规则
│
├── context/                  # 上下文配置
│   ├── include.txt           # 始终包含的文件 glob
│   └── exclude.txt           # 排除的文件 glob
│
└── config.json               # Agent 配置
```

## Types

```typescript
/**
 * 规则文件
 */
interface RuleFile {
  /** 文件名（不含扩展名） */
  name: string
  /** 文件路径 */
  path: string
  /** 内容 */
  content: string
}

/**
 * 规则集合
 */
interface RuleSet {
  /** 项目级规则 */
  project: RuleFile[]
  /** 用户全局规则 */
  user: RuleFile[]
}

/**
 * 上下文配置
 */
interface ContextConfig {
  /** 始终包含的文件 glob 模式 */
  include: string[]
  /** 排除的文件 glob 模式 */
  exclude: string[]
}

/**
 * Agent 配置
 */
interface AgentConfig {
  /** 默认模型 */
  model?: string
  /** 自动确认的权限类型 */
  autoConfirm?: PermissionType[]
  /** 最大执行步数 */
  maxSteps?: number
  /** 自定义权限规则 */
  permissions?: PermissionRule[]
  /** 环境变量 */
  env?: Record<string, string>
}

/**
 * 项目结构
 */
interface ProjectStructure {
  /** 根目录 */
  root: string
  /** 目录树（字符串格式） */
  tree: string
  /** 关键文件列表 */
  keyFiles: string[]
  /** 检测到的技术栈 */
  techStack: TechStack
}

/**
 * 技术栈信息
 */
interface TechStack {
  /** 语言 */
  languages: string[]
  /** 框架 */
  frameworks: string[]
  /** 包管理器 */
  packageManager?: "npm" | "yarn" | "pnpm" | "bun"
  /** 测试框架 */
  testFramework?: string
  /** 构建工具 */
  buildTool?: string
}

/**
 * Git 上下文
 */
interface GitContext {
  /** 是否是 Git 仓库 */
  isRepo: boolean
  /** 当前分支 */
  branch?: string
  /** 是否有未提交更改 */
  isDirty?: boolean
  /** 暂存文件数 */
  stagedCount?: number
  /** 未暂存文件数 */
  unstagedCount?: number
  /** 最近提交 */
  recentCommits?: GitCommit[]
}

/**
 * Git 提交信息
 */
interface GitCommit {
  hash: string
  message: string
  author: string
  date: string
}

/**
 * 完整上下文
 */
interface Context {
  /** 规则集合 */
  rules: RuleSet
  /** 项目结构 */
  structure: ProjectStructure
  /** Git 上下文 */
  git: GitContext
  /** Agent 配置 */
  config: AgentConfig
}

/**
 * 上下文加载器
 */
interface ContextLoader {
  /** 加载完整上下文 */
  load(cwd: string): Promise<Context>
  /** 只加载规则 */
  loadRules(cwd: string): Promise<RuleSet>
  /** 只加载项目结构 */
  loadStructure(cwd: string): Promise<ProjectStructure>
  /** 只加载 Git 上下文 */
  loadGit(cwd: string): Promise<GitContext>
  /** 只加载配置 */
  loadConfig(cwd: string): Promise<AgentConfig>
}
```

## 规则加载

### 加载顺序

```
1. 内置默认规则（兜底）
2. 用户全局规则 ~/.naught/rules/*.md
3. 项目级规则 .naught/rules/*.md（优先级最高）
```

### 合并策略

- 规则内容按顺序拼接
- 同名规则，项目级覆盖用户级
- 配置项深度合并，项目级优先

### 接口

```typescript
/**
 * 加载规则
 */
async function loadRules(cwd: string): Promise<RuleSet>

/**
 * 合并规则为系统提示
 */
function mergeRulesToPrompt(rules: RuleSet): string
```

### 示例

```typescript
const rules = await loadRules("/path/to/project")
// rules.project = [{ name: "project", content: "..." }, ...]
// rules.user = [{ name: "global-style", content: "..." }, ...]

const systemPrompt = mergeRulesToPrompt(rules)
// 拼接所有规则内容，注入系统提示
```

## 项目结构收集

### 目录树生成

```typescript
/**
 * 生成目录树
 */
async function generateTree(
  cwd: string,
  options?: {
    maxDepth?: number      // 最大深度，默认 3
    maxFiles?: number      // 最大文件数，默认 100
    exclude?: string[]     // 排除模式
  }
): Promise<string>
```

### 默认排除

```
node_modules/
.git/
dist/
build/
coverage/
*.log
.DS_Store
```

### 技术栈检测

```typescript
/**
 * 检测技术栈
 */
async function detectTechStack(cwd: string): Promise<TechStack>
```

检测逻辑：

| 文件 | 推断 |
|------|------|
| `package.json` | Node.js 项目 |
| `tsconfig.json` | TypeScript |
| `Cargo.toml` | Rust |
| `go.mod` | Go |
| `pyproject.toml` / `requirements.txt` | Python |
| `pnpm-lock.yaml` | pnpm |
| `yarn.lock` | yarn |
| `bun.lockb` | bun |
| `vitest.config.*` | Vitest |
| `jest.config.*` | Jest |

### 关键文件识别

自动识别并包含：

```
README.md
package.json
tsconfig.json
.naught/rules/*.md
```

## Git 上下文

### 接口

```typescript
/**
 * 获取 Git 上下文
 */
async function loadGitContext(cwd: string): Promise<GitContext>
```

### 实现

```typescript
// 检查是否 Git 仓库
git rev-parse --git-dir

// 获取当前分支
git branch --show-current

// 获取状态
git status --porcelain

// 获取最近提交
git log --oneline -n 5
```

## 配置文件

### `.naught/config.json`

```json
{
  "model": "claude-sonnet-4-20250514",
  "autoConfirm": ["read", "glob", "grep"],
  "maxSteps": 50,
  "permissions": [
    { "type": "bash", "action": "deny", "pattern": "rm -rf *" }
  ],
  "env": {
    "NODE_ENV": "development"
  }
}
```

### 配置合并

```typescript
/**
 * 加载并合并配置
 */
async function loadConfig(cwd: string): Promise<AgentConfig>

// 合并顺序：
// 1. 内置默认配置
// 2. 用户全局配置 ~/.naught/config.json
// 3. 项目配置 .naught/config.json
```

## 上下文注入

### 系统提示构建

```typescript
/**
 * 构建包含上下文的系统提示
 */
function buildSystemPrompt(context: Context): string
```

### 模板

```markdown
# System

You are an AI coding assistant.

## Project Rules

{rules.project 内容}

## Project Structure

{structure.tree}

Tech Stack: {structure.techStack}

## Git Status

Branch: {git.branch}
Status: {git.isDirty ? "有未提交更改" : "干净"}

## Instructions

{内置指令}
```

## 上下文配置文件

### `.naught/context/include.txt`

```
# 始终包含的文件
src/**/*.ts
README.md
package.json
```

### `.naught/context/exclude.txt`

```
# 排除的文件
**/*.test.ts
**/__mocks__/**
node_modules/**
```

## 规则文件示例

### `.naught/rules/project.md`

```markdown
# 项目规则

## 概述

这是 NaughtAgent 项目，一个 AI 编程助手。

## 技术栈

- TypeScript + Bun
- Vitest 测试框架
- pnpm 包管理

## 架构

- `packages/agent/` - Agent 核心服务
- `packages/vscode/` - VS Code 插件

## 约束

- 所有公开函数必须有 JSDoc 注释
- 测试覆盖率必须 > 80%
- 禁止使用 `any` 类型
```

### `.naught/rules/code-style.md`

```markdown
# 代码风格

## 格式

- 2 空格缩进
- 字符串使用双引号
- 文件名使用 kebab-case
- 变量名使用 camelCase

## 命名

- 接口名以 I 开头：`IUserService`
- 类型名使用 PascalCase：`UserConfig`
- 常量使用 UPPER_SNAKE_CASE：`MAX_RETRY_COUNT`

## 注释

- 复杂逻辑必须有注释
- TODO 格式：`// TODO(author): description`
```

## 错误处理

| 场景 | 处理 |
|------|------|
| `.naught/` 不存在 | 使用默认配置 |
| 规则文件读取失败 | 跳过该文件，记录警告 |
| config.json 格式错误 | 使用默认配置，记录警告 |
| Git 命令失败 | `isRepo: false` |

## 与现有系统集成

```
CLI / Runner
    │
    ▼
ContextLoader.load(cwd)
    │
    ├── loadRules()      → RuleSet
    ├── loadStructure()  → ProjectStructure
    ├── loadGit()        → GitContext
    └── loadConfig()     → AgentConfig
    │
    ▼
buildSystemPrompt(context)
    │
    ▼
Agent Loop（使用增强的系统提示）
```
