# AI Agent 命令系统调研报告

> 调研日期：2026-02-04
> 目的：了解主流 AI Agent 的命令系统设计，为 NaughtyAgent 提供参考

## 1. 调研对象

| Agent | 类型 | 特点 |
|-------|------|------|
| Claude Code | 官方 CLI | 最完善的命令系统，支持 Skills、Hooks、Subagents |
| Aider | 开源 CLI | 简洁的斜杠命令，专注代码编辑 |
| OpenCode | 开源 CLI | 模块化设计，支持 Command + Skill 双层架构 |
| Cursor | IDE 集成 | Agent 模式，多 Agent 并行 |

## 2. Claude Code 命令系统

### 2.1 三层命令架构

```
┌─────────────────────────────────────────────────────────┐
│                    Slash Commands                        │
│  /add-dir, /clear, /compact, /config, /context, /cost   │
│  /doctor, /help, /init, /login, /logout, /memory        │
│  /model, /permissions, /review, /terminal-setup, /vim   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      Skills                              │
│  .claude/skills/<name>/SKILL.md                         │
│  - 可被 Claude 自动调用                                  │
│  - 支持参数 $ARGUMENTS, $0, $1...                       │
│  - 支持动态上下文注入 !command"                          │
│  - 支持 subagent 执行 (context: fork)                   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    Custom Commands                       │
│  .claude/commands/<name>.md                             │
│  - 用户手动调用                                          │
│  - 简单的 prompt 模板                                    │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Skill 系统核心特性

**Frontmatter 配置：**
```yaml
---
name: my-skill
description: 技能描述，Claude 用此决定何时使用
argument-hint: [issue-number]
disable-model-invocation: false  # 是否禁止 Claude 自动调用
user-invocable: true             # 是否允许用户手动调用
allowed-tools: [Read, Grep]      # 限制可用工具
model: claude-sonnet             # 指定模型
context: fork                    # 在 subagent 中执行
agent: Explore                   # subagent 类型
---
```

**关键设计：**
1. **智能调用** - Claude 根据 description 自动决定是否使用 skill
2. **参数替换** - `$ARGUMENTS`, `$0`, `$1` 等占位符
3. **动态注入** - `!gh pr diff"` 语法执行命令并注入结果
4. **隔离执行** - `context: fork` 在独立 subagent 中运行
5. **工具限制** - `allowed-tools` 控制 skill 可用的工具

### 2.3 命令发现机制

```
优先级：Enterprise > Personal > Project > Plugin
位置：
  - ~/.claude/skills/           # 全局
  - .claude/skills/             # 项目
  - <plugin>/skills/            # 插件
```

## 3. Aider 命令系统

### 3.1 简洁的斜杠命令

Aider 采用扁平化设计，所有命令都是 `/command` 形式：

| 类别 | 命令 |
|------|------|
| 文件管理 | `/add`, `/drop`, `/ls`, `/read-only` |
| 模式切换 | `/ask`, `/code`, `/architect`, `/context` |
| Git 操作 | `/commit`, `/diff`, `/undo`, `/git` |
| 模型控制 | `/model`, `/editor-model`, `/weak-model` |
| 会话管理 | `/clear`, `/reset`, `/save`, `/load` |
| 工具命令 | `/run`, `/test`, `/lint`, `/web` |

### 3.2 设计特点

1. **无层级** - 所有命令平级，没有 skill/command 区分
2. **模式驱动** - 通过 `/ask`, `/code`, `/architect` 切换工作模式
3. **Git 集成** - 深度集成 Git，自动 commit/diff/undo
4. **外部命令** - `/run` 和 `/test` 执行 shell 命令

## 4. OpenCode 命令系统

### 4.1 双层架构

```typescript
// Command - 内置命令 + 配置命令 + MCP prompts
export namespace Command {
  const Default = {
    INIT: "init",      // 创建 AGENTS.md
    REVIEW: "review",  // 代码审查
  }
  
  // 从配置加载自定义命令
  for (const [name, command] of Object.entries(cfg.command ?? {})) {
    result[name] = { ... }
  }
  
  // 从 MCP 加载 prompts 作为命令
  for (const [name, prompt] of Object.entries(await MCP.prompts())) {
    result[name] = { ... }
  }
}

// Skill - 从文件系统扫描
export namespace Skill {
  // 扫描 .opencode/skill/ 和 .claude/skills/
  const OPENCODE_SKILL_GLOB = new Bun.Glob("{skill,skills}/**/SKILL.md")
  const CLAUDE_SKILL_GLOB = new Bun.Glob("skills/**/SKILL.md")
}
```

### 4.2 命令配置格式

```markdown
---
description: git commit and push
model: opencode/glm-4.6
subtask: true
---

commit and push
make sure it includes a prefix like docs:, tui:, core:...
```

### 4.3 设计特点

1. **兼容 Claude Code** - 支持 `.claude/skills/` 目录
2. **MCP 集成** - MCP prompts 自动注册为命令
3. **Subtask 支持** - `subtask: true` 在子任务中执行
4. **模型指定** - 每个命令可指定不同模型

## 5. Cursor Agent 模式

### 5.1 多 Agent 并行

- 最多 8 个 Agent 并行执行
- Git worktree 隔离
- 自动规划、执行、验证

### 5.2 设计特点

1. **无显式命令** - 自然语言驱动
2. **Agent 角色** - planner, implementer, tester, docs
3. **审批机制** - 变更前需要用户确认

## 6. 对比总结

| 特性 | Claude Code | Aider | OpenCode | Cursor |
|------|-------------|-------|----------|--------|
| 命令层级 | 3层 | 1层 | 2层 | 无 |
| 自动调用 | ✅ Skill | ❌ | ❌ | ✅ |
| 参数支持 | ✅ | ❌ | ✅ | ❌ |
| 动态注入 | ✅ | ❌ | ❌ | ❌ |
| Subagent | ✅ | ❌ | ✅ | ✅ |
| MCP 集成 | ✅ | ❌ | ✅ | ❌ |
| 工具限制 | ✅ | ❌ | ❌ | ❌ |
| 文件配置 | Markdown | 无 | Markdown | 无 |

## 7. NaughtyAgent 改进建议

### 7.1 统一命令注册中心

```typescript
interface CommandRegistry {
  // 内置命令
  builtin: Map<string, BuiltinCommand>
  // Skill 命令（可被 AI 自动调用）
  skills: Map<string, SkillCommand>
  // 外部命令（justfile、shell）
  external: Map<string, ExternalCommand>
  
  // 智能路由
  route(input: string): CommandExecution
  // 自动发现
  discover(): Promise<void>
}
```

### 7.2 Skill 系统

参考 Claude Code 的 Skill 设计：

```markdown
<!-- ~/.naughtyagent/skills/init/SKILL.md -->
---
name: init
description: 初始化项目，生成 Naughty.md 规范文档
disable-model-invocation: true
---

分析当前项目结构，生成 Naughty.md 文档...
```

### 7.3 智能执行路由

```typescript
function routeCommand(input: string): ExecutionPlan {
  // 1. 检查是否是内置命令 (/help, /clear, /model)
  if (isBuiltinCommand(input)) {
    return { type: 'builtin', handler: getBuiltinHandler(input) }
  }
  
  // 2. 检查是否是 Skill（可能需要 AI 执行）
  const skill = findMatchingSkill(input)
  if (skill) {
    return { type: 'skill', skill, needsAI: true }
  }
  
  // 3. 检查是否是外部命令（justfile）
  const external = findExternalCommand(input)
  if (external) {
    return { type: 'external', command: external }
  }
  
  // 4. 默认作为自然语言发送给 AI
  return { type: 'chat', message: input }
}
```

### 7.4 错误处理与自动修复

```typescript
async function executeWithRecovery(plan: ExecutionPlan): Promise<Result> {
  try {
    return await execute(plan)
  } catch (error) {
    // 分析错误类型
    const diagnosis = diagnoseError(error)
    
    // 尝试自动修复
    if (diagnosis.recoverable) {
      const fix = await suggestFix(diagnosis)
      if (await userConfirm(fix)) {
        return await execute(fix.plan)
      }
    }
    
    // 无法自动修复，提供建议
    return { error, suggestions: diagnosis.suggestions }
  }
}
```

## 8. 实施优先级

1. **P0 - 统一命令注册** - 合并内置命令、justfile 命令
2. **P1 - Skill 系统** - 支持 `.naughtyagent/skills/` 目录
3. **P2 - 智能路由** - 根据命令类型自动选择执行方式
4. **P3 - 错误恢复** - 命令失败时自动诊断和建议
5. **P4 - MCP 集成** - MCP prompts 作为命令

---

*Content was rephrased for compliance with licensing restrictions*
*Sources: [Aider Commands](https://aider.chat/docs/usage/commands.html), [Claude Code Docs](https://docs.claude.com/en/docs/claude-code/slash-commands)*
