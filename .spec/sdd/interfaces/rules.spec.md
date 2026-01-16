# Interface Spec: Rules 索引系统

> Phase 5.4 Rules - 按需加载项目规则

## 概述

Rules 索引系统让 Agent 能够**按需加载**项目规则，而不是一次性加载所有规则到系统提示中。

**核心问题：**
- 项目可能有很多规则文件（代码风格、架构约束、Git 规范等）
- 全部加载会浪费 Token，且可能超出上下文限制
- Agent 应该根据当前任务只加载相关规则

**解决方案：**
- 规则索引：为每个规则文件添加元数据（触发条件、描述）
- 按需加载：根据任务类型、文件路径、命令等匹配相关规则
- 动态指令发现：读取项目中的 Justfile/Makefile/package.json scripts

---

## 1. Types

```typescript
/**
 * 规则元数据
 */
interface RuleMeta {
  /** 规则 ID（唯一标识） */
  id: string
  /** 规则文件路径（相对于 .naught/rules/） */
  file: string
  /** 描述 */
  description: string
  /** 触发条件 */
  triggers: RuleTrigger[]
  /** 优先级（数字越大越优先） */
  priority?: number
  /** 是否始终加载 */
  alwaysLoad?: boolean
}

/**
 * 触发条件
 */
type RuleTrigger =
  | { type: "glob"; pattern: string }      // 文件路径匹配
  | { type: "command"; pattern: string }   // 命令匹配（如 /commit, git *）
  | { type: "keyword"; words: string[] }   // 关键词匹配
  | { type: "tool"; names: string[] }      // 工具调用匹配

/**
 * 规则索引
 */
interface RulesIndex {
  /** 版本 */
  version: number
  /** 规则列表 */
  rules: RuleMeta[]
}

/**
 * 加载的规则
 */
interface LoadedRule {
  /** 规则元数据 */
  meta: RuleMeta
  /** 规则内容 */
  content: string
}

/**
 * 匹配上下文
 */
interface MatchContext {
  /** 当前处理的文件路径 */
  files?: string[]
  /** 用户输入 */
  input?: string
  /** 正在执行的命令/技能 */
  command?: string
  /** 正在调用的工具 */
  tools?: string[]
}

/**
 * 项目指令
 */
interface ProjectCommand {
  /** 指令名称 */
  name: string
  /** 描述 */
  description?: string
  /** 实际命令 */
  command: string
  /** 来源 */
  source: "justfile" | "makefile" | "package.json" | "scripts"
}

/**
 * 项目指令索引
 */
interface CommandsIndex {
  /** 指令列表 */
  commands: ProjectCommand[]
  /** 发现时间 */
  discoveredAt: string
}
```

---

## 2. 规则索引文件

### 2.1 索引文件格式

`.naught/rules/index.yaml`:

```yaml
version: 1
rules:
  - id: typescript-style
    file: typescript.md
    description: TypeScript 代码风格规范
    triggers:
      - type: glob
        pattern: "*.ts"
      - type: glob
        pattern: "*.tsx"

  - id: git-workflow
    file: git.md
    description: Git 工作流规范
    triggers:
      - type: command
        pattern: "/commit"
      - type: command
        pattern: "/pr"
      - type: command
        pattern: "git *"

  - id: testing
    file: testing.md
    description: 测试规范
    triggers:
      - type: glob
        pattern: "*.test.ts"
      - type: tool
        names: ["bash"]
      - type: keyword
        words: ["test", "测试", "vitest", "jest"]

  - id: security
    file: security.md
    description: 安全规范
    priority: 100
    alwaysLoad: true

  - id: architecture
    file: architecture.md
    description: 架构约束
    triggers:
      - type: keyword
        words: ["架构", "设计", "重构", "新功能"]
```

### 2.2 自动生成索引

如果没有 `index.yaml`，系统会自动扫描 `.naught/rules/*.md` 并生成默认索引：

```typescript
async function generateDefaultIndex(rulesDir: string): Promise<RulesIndex> {
  const files = await fs.readdir(rulesDir)
  const rules: RuleMeta[] = []

  for (const file of files) {
    if (!file.endsWith(".md")) continue

    const id = file.replace(/\.md$/, "")
    rules.push({
      id,
      file,
      description: `Rules from ${file}`,
      triggers: [], // 无触发条件，需要显式加载
    })
  }

  return { version: 1, rules }
}
```

---

## 3. 规则加载器

### 3.1 接口

```typescript
interface RulesLoader {
  /** 加载规则索引 */
  loadIndex(cwd: string): Promise<RulesIndex>

  /** 根据上下文匹配规则 */
  matchRules(index: RulesIndex, context: MatchContext): RuleMeta[]

  /** 加载规则内容 */
  loadRule(cwd: string, meta: RuleMeta): Promise<LoadedRule>

  /** 加载匹配的规则 */
  loadMatchedRules(cwd: string, context: MatchContext): Promise<LoadedRule[]>

  /** 加载始终加载的规则 */
  loadAlwaysRules(cwd: string): Promise<LoadedRule[]>
}
```

### 3.2 匹配逻辑

```typescript
function matchRules(index: RulesIndex, context: MatchContext): RuleMeta[] {
  const matched: RuleMeta[] = []

  for (const rule of index.rules) {
    // 始终加载的规则
    if (rule.alwaysLoad) {
      matched.push(rule)
      continue
    }

    // 检查触发条件
    for (const trigger of rule.triggers) {
      if (matchTrigger(trigger, context)) {
        matched.push(rule)
        break
      }
    }
  }

  // 按优先级排序
  return matched.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
}

function matchTrigger(trigger: RuleTrigger, context: MatchContext): boolean {
  switch (trigger.type) {
    case "glob":
      return context.files?.some(f => minimatch(f, trigger.pattern)) ?? false

    case "command":
      if (!context.command) return false
      if (trigger.pattern.endsWith("*")) {
        return context.command.startsWith(trigger.pattern.slice(0, -1))
      }
      return context.command === trigger.pattern

    case "keyword":
      if (!context.input) return false
      const lower = context.input.toLowerCase()
      return trigger.words.some(w => lower.includes(w.toLowerCase()))

    case "tool":
      return context.tools?.some(t => trigger.names.includes(t)) ?? false
  }
}
```

---

## 4. 动态指令发现

### 4.1 支持的来源

| 来源 | 文件 | 格式 |
|------|------|------|
| Justfile | `Justfile`, `justfile` | just 格式 |
| Makefile | `Makefile`, `makefile` | make 格式 |
| package.json | `package.json` | scripts 字段 |
| 自定义脚本 | `scripts/`, `bin/` | 可执行文件 |

### 4.2 接口

```typescript
interface CommandsDiscovery {
  /** 发现项目指令 */
  discover(cwd: string): Promise<CommandsIndex>

  /** 解析 Justfile */
  parseJustfile(content: string): ProjectCommand[]

  /** 解析 Makefile */
  parseMakefile(content: string): ProjectCommand[]

  /** 解析 package.json scripts */
  parsePackageScripts(pkg: object): ProjectCommand[]

  /** 扫描脚本目录 */
  scanScriptsDir(dir: string): Promise<ProjectCommand[]>
}
```

### 4.3 解析示例

**Justfile:**
```just
# Build the project
build:
    cargo build --release

# Run tests
test *args:
    cargo test {{args}}

# Deploy to production
deploy: build
    ./scripts/deploy.sh
```

解析结果：
```typescript
[
  { name: "build", description: "Build the project", command: "just build", source: "justfile" },
  { name: "test", description: "Run tests", command: "just test", source: "justfile" },
  { name: "deploy", description: "Deploy to production", command: "just deploy", source: "justfile" },
]
```

**package.json:**
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest",
    "lint": "eslint src/"
  }
}
```

解析结果：
```typescript
[
  { name: "dev", command: "pnpm dev", source: "package.json" },
  { name: "build", command: "pnpm build", source: "package.json" },
  { name: "test", command: "pnpm test", source: "package.json" },
  { name: "lint", command: "pnpm lint", source: "package.json" },
]
```

---

## 5. 与 Agent 集成

### 5.1 系统提示注入

```typescript
async function buildEnhancedPrompt(
  cwd: string,
  context: MatchContext
): Promise<string> {
  const parts: string[] = []

  // 1. 加载始终加载的规则
  const alwaysRules = await rulesLoader.loadAlwaysRules(cwd)
  if (alwaysRules.length > 0) {
    parts.push("# Project Rules (Always)\n")
    for (const rule of alwaysRules) {
      parts.push(`## ${rule.meta.id}\n${rule.content}\n`)
    }
  }

  // 2. 加载匹配的规则
  const matchedRules = await rulesLoader.loadMatchedRules(cwd, context)
  if (matchedRules.length > 0) {
    parts.push("# Project Rules (Context)\n")
    for (const rule of matchedRules) {
      parts.push(`## ${rule.meta.id}\n${rule.content}\n`)
    }
  }

  // 3. 加载项目指令
  const commands = await commandsDiscovery.discover(cwd)
  if (commands.commands.length > 0) {
    parts.push("# Available Commands\n")
    parts.push("The project has the following commands available:\n")
    for (const cmd of commands.commands) {
      parts.push(`- \`${cmd.command}\`${cmd.description ? `: ${cmd.description}` : ""}`)
    }
    parts.push("\nPrefer using these existing commands over writing new scripts.\n")
  }

  return parts.join("\n")
}
```

### 5.2 动态加载时机

```
用户输入
    │
    ▼
解析输入，提取上下文
    │
    ├─ 文件路径（如果提到文件）
    ├─ 命令（如果是 /command）
    └─ 关键词
    │
    ▼
匹配规则
    │
    ▼
加载匹配的规则内容
    │
    ▼
注入系统提示
    │
    ▼
调用 LLM
```

### 5.3 工具调用时加载

当 Agent 调用工具时，可以动态加载相关规则：

```typescript
// 在 Agent Loop 中
async function onToolCall(toolName: string, params: object) {
  // 提取文件路径
  const files = extractFilePaths(params)

  // 匹配规则
  const context: MatchContext = {
    tools: [toolName],
    files,
  }

  const rules = await rulesLoader.loadMatchedRules(cwd, context)

  // 如果有新规则，添加到上下文
  if (rules.length > 0) {
    // 注入到下一轮对话
  }
}
```

---

## 6. 文件结构

```
src/
├── rules/
│   ├── index.ts        # 导出
│   ├── types.ts        # 类型定义
│   ├── loader.ts       # 规则加载器
│   ├── matcher.ts      # 触发条件匹配
│   └── commands.ts     # 动态指令发现
```

---

## 7. 配置

### 7.1 .naught/config.json

```json
{
  "rules": {
    "autoDiscover": true,
    "maxRulesPerRequest": 5,
    "cacheTimeout": 300000
  },
  "commands": {
    "discover": true,
    "sources": ["justfile", "makefile", "package.json"]
  }
}
```

### 7.2 默认配置

```typescript
const DEFAULT_RULES_CONFIG = {
  autoDiscover: true,      // 自动发现规则
  maxRulesPerRequest: 5,   // 每次请求最多加载的规则数
  cacheTimeout: 5 * 60 * 1000, // 缓存 5 分钟
}

const DEFAULT_COMMANDS_CONFIG = {
  discover: true,
  sources: ["justfile", "makefile", "package.json", "scripts"],
}
```

---

## 8. 错误处理

| 场景 | 处理 |
|------|------|
| index.yaml 不存在 | 自动生成默认索引 |
| index.yaml 格式错误 | 使用默认索引，记录警告 |
| 规则文件不存在 | 跳过该规则，记录警告 |
| Justfile/Makefile 解析失败 | 跳过该来源，记录警告 |

---

## 9. 示例

### 9.1 用户输入触发

```
用户: 帮我修改 src/utils/format.ts 的代码风格

上下文:
  files: ["src/utils/format.ts"]
  input: "帮我修改 src/utils/format.ts 的代码风格"

匹配规则:
  - typescript-style (glob: *.ts)

加载内容:
  - .naught/rules/typescript.md
```

### 9.2 命令触发

```
用户: /commit

上下文:
  command: "/commit"

匹配规则:
  - git-workflow (command: /commit)

加载内容:
  - .naught/rules/git.md
```

### 9.3 工具调用触发

```
Agent 调用: bash { command: "pnpm test" }

上下文:
  tools: ["bash"]
  input: "pnpm test"

匹配规则:
  - testing (tool: bash, keyword: test)

加载内容:
  - .naught/rules/testing.md
```
