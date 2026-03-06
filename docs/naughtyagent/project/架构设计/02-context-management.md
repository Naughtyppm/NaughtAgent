# 上下文管理层

上下文管理层负责 Token 预算、项目信息收集和会话状态维护。

## 1. Token 管理

### 当前实现

```typescript
// token/token.ts
function estimateTokens(text: string): number {
  // 简单估算：字符数 / 4
  return Math.ceil(text.length / 4)
}
```

### Token 限制配置

```typescript
interface TokenLimits {
  maxContextTokens: number    // 上下文窗口大小
  maxOutputTokens: number     // 单次输出限制
  reservedTokens: number      // 预留给系统提示词
}
```

### 工具输出截断

```typescript
// token/truncator.ts
interface TruncationConfig {
  maxLines: number           // 最大行数
  maxChars: number           // 最大字符数
  preserveStart: number      // 保留开头行数
  preserveEnd: number        // 保留结尾行数
}
```

### 待实现：精确 Token 计数

```typescript
// TODO: 使用 tiktoken 精确计数
import { encoding_for_model } from "tiktoken"

function countTokens(text: string, model: string): number {
  const enc = encoding_for_model(model)
  return enc.encode(text).length
}
```

## 2. 项目上下文

### 自动检测内容

| 内容 | 来源 | 用途 |
|------|------|------|
| 项目结构树 | 文件系统扫描 | 帮助 LLM 理解项目布局 |
| 技术栈 | package.json / Cargo.toml 等 | 选择合适的代码风格 |
| Git 上下文 | git 命令 | 了解当前分支、最近提交 |
| 规则文件 | .naught/rules/ | 注入项目特定指令 |

### 上下文加载

```typescript
// context/context.ts
interface Context {
  cwd: string
  rules: RuleSet
  techStack: TechStack
  projectStructure: ProjectStructure
  gitContext: GitContext
  config: AgentConfig
}

async function loadContext(cwd: string): Promise<Context>
```

### 技术栈检测

```typescript
// context/context.ts
interface TechStack {
  languages: string[]        // ["typescript", "python"]
  frameworks: string[]       // ["react", "express"]
  packageManager: string     // "pnpm" | "npm" | "yarn"
  buildTools: string[]       // ["tsup", "esbuild"]
  testFramework?: string     // "vitest" | "jest"
}
```

### Git 上下文

```typescript
interface GitContext {
  branch: string             // 当前分支
  recentCommits: GitCommit[] // 最近提交
  hasUncommittedChanges: boolean
  remoteUrl?: string
}
```

## 3. 会话管理

### 会话结构

```typescript
// session/session.ts
interface Session {
  id: SessionID
  status: SessionStatus      // idle | running | paused | completed | error
  cwd: string
  messages: Message[]
  agentType: AgentType       // build | plan | explore
  createdAt: number
  updatedAt: number
  usage: TokenUsage
  tags?: string[]
  parent_session_id?: string // 分支来源
}
```

### 会话状态机

```
idle → running → completed
         ↓
       paused → running
         ↓
       error
```

### 持久化存储

```typescript
// session/storage.ts
interface SessionStorage {
  save(session: Session): Promise<void>
  load(id: SessionID): Promise<Session | null>
  list(filter?: SessionFilter): Promise<Session[]>
  delete(id: SessionID): Promise<void>
}
```

存储位置：`~/.naught/sessions/{session-id}.json`

## 4. 规则系统

### 规则触发器类型

| 类型 | 说明 | 示例 |
|------|------|------|
| glob | 文件路径匹配 | `**/*.ts` |
| command | 命令匹配 | `/test` |
| keyword | 关键词匹配 | `["测试", "test"]` |
| tool | 工具调用匹配 | `bash` |

### 规则配置

```yaml
# .naught/rules/index.yaml
rules:
  - name: typescript-style
    file: typescript-style.md
    triggers:
      - type: glob
        pattern: "**/*.ts"
  - name: test-guide
    file: test-guide.md
    triggers:
      - type: keyword
        keywords: ["test", "测试"]
```

## 5. 关键文件索引

| 文件 | 职责 |
|------|------|
| `context/context.ts` | 上下文加载、项目检测 |
| `token/token.ts` | Token 估算 |
| `token/truncator.ts` | 输出截断 |
| `token/compressor.ts` | 上下文压缩 |
| `session/session.ts` | 会话类型定义 |
| `session/manager.ts` | 会话管理器 |
| `session/storage.ts` | 持久化存储 |
| `rules/loader.ts` | 规则加载 |
| `rules/matcher.ts` | 规则匹配 |
