# NaughtAgent 重构计划 v3 —— 精准重建

> 审计结论：文档 > 实现，重写核心 >> 修补，保留可用零件
> 策略：基于教程 s01-s06 原则，最小可用核心 → 逐步迁移

---

## 一、审计结论

### 1.1 这个项目的本质问题

**不是"需要重构的好代码"，而是"架构设计很好但实现没跟上"。**

44,000 行代码中：
- **可直接复用**：工具实现（bash/read/write/edit/glob/grep）、Anthropic Provider stream()、MCP 客户端、Session 数据结构
- **需要修复后复用**：Anthropic Provider chat()（加 thinking）、模型映射（合并 3 表）、Ink UI 组件
- **必须重写**：Loop（650→200行）、ToolRegistry（全局→实例）、Runner（权限修复+事件模型）、OpenAI Provider（tool call）、压缩管道（格式修复）
- **直接删除**：传统 REPL（Ink 足够）、冗余的 schema 双转换、7 种子代理模式砍到 4 种

### 1.2 可复用零件清单

| 零件 | 来源文件 | 状态 | 说明 |
|------|---------|------|------|
| Bash 工具 | `tool/bash.ts` | ✅ 可用 | 超时/截断/跨平台都正确 |
| Read 工具 | `tool/read.ts` | ✅ 可用 | 二进制检测、行号格式正确 |
| Write 工具 | `tool/write.ts` | ⚠️ 需修 | 80行限制不设 isError |
| Edit 工具 | `tool/edit.ts` | ✅ 可用 | 精确替换设计合理 |
| Glob/Grep | `tool/glob.ts`, `grep.ts` | ✅ 可用 | fast-glob + 自实现 grep |
| Anthropic stream() | `provider/anthropic.ts` | ✅ 可用 | 流式处理正确 |
| MCP 客户端 | `mcp/` 全目录 | ✅ 可用 | 有重试/池化/适配层 |
| Session 数据结构 | `session/session.ts` | ✅ 可用 | 纯数据接口 |
| Ink 组件 | `cli/ink/components/` | ⚠️ 需修 | dimColor 等小问题 |
| 统一命令系统 | `command/` 全目录 | ✅ 可用 | 注册表/路由器/补全 |
| Zod→JSON Schema | `tool/tool.ts` zodToJsonSchema | ✅ 可用 | 但只需保留一次转换 |
| JSON Schema→Zod | `tool/schema-converter.ts` | ✅ 可用 | MCP 工具用 |

---

## 二、重建策略

### 核心原则（来自教程）

1. **Loop 200 行**：只做 `LLM → Tool → LLM`，不耦合 Session/权限/监控
2. **ToolRegistry 可实例化**：每个 Runner 独立，消灭全局状态
3. **权限在工具执行前拦截**：不是事后通知
4. **压缩管道正确集成**：micro（每轮）+ auto（阈值）+ compact 工具（LLM 主动）
5. **类型安全零 `as any`**：typecheck 必须通过

### 阶段划分（4 个阶段，不是 7 个）

```
Phase A: 核心引擎重建    [Loop + Registry + Runner + Provider 修复]
Phase B: 感知与知识       [压缩管道 + Knowledge Skill]
Phase C: 表现层精简       [砍传统 REPL + CLI 现代化 + Server 修复]
Phase D: IDE 集成         [VS Code ChatViewProvider]
```

每个 Phase 完成后都是**可独立运行的完整版本**。

---

## 三、Phase A：核心引擎重建

**目标**：最小可用 Agent —— 能对话、能调工具、类型安全、权限生效

### A1. 配置中心（新建）

```
src/config/
├── constants.ts    # VERSION(从 package.json 读), 端口, token 限制
├── env.ts          # 统一 process.env 入口（替代 34 处散落）
├── models.ts       # 单一模型注册表（合并 3 套映射）
└── index.ts
```

**关键点**：所有硬编码数字（8192×9, 16000×7, 0.1.0×7）收敛到 constants.ts。

### A2. ToolRegistry 重写（class 替代 namespace）

```typescript
// src/tool/registry.ts
export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>()

  register(tool: ToolDefinition): this { ... }
  get(name: string): RegisteredTool | undefined { ... }
  getByNames(names: string[]): RegisteredTool[] { ... }

  // 关键改动：execute 前拦截权限
  async execute(name: string, input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) throw new ToolNotFoundError(name)

    // 权限检查在这里！不在 runner 的事件消费层
    if (ctx.permissionChecker) {
      const allowed = await ctx.permissionChecker(name, input)
      if (!allowed) return { output: 'Permission denied', isError: true }
    }

    return tool.execute(input, ctx)
  }

  // 克隆（子代理用）
  clone(): ToolRegistry { ... }
}
```

**消灭全局状态**：不导出 `defaultRegistry`，每个 Runner 必须显式创建。

### A3. Loop 重写（650 行→200 行）

```typescript
// src/agent/loop.ts（重写后）
export interface LoopConfig {
  provider: LLMProvider
  registry: ToolRegistry
  toolNames: string[]           // 本 Agent 可用的工具
  systemPrompt: string
  modelConfig: ModelConfig
  signal?: AbortSignal
  shouldContinue?: (ctx: LoopContext) => boolean  // 替代固定 maxSteps
}

export async function* agentLoop(
  messages: Message[],
  config: LoopConfig
): AsyncGenerator<AgentEvent> {
  let step = 0

  while (config.shouldContinue?.({ step, messages }) ?? step < 100) {
    step++

    // 1. 调用 LLM（流式）
    const toolDefs = config.registry.getByNames(config.toolNames)
      .map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))

    const stream = config.provider.stream({
      model: config.modelConfig,
      messages,
      system: config.systemPrompt,
      tools: toolDefs,
      signal: config.signal,
    })

    // 2. 消费流式事件
    let responseText = ''
    let toolCalls: ToolCall[] = []

    for await (const event of stream) {
      switch (event.type) {
        case 'text':
          responseText += event.text
          yield { type: 'text_delta', delta: event.text }  // 增量！不是累积
          break
        case 'thinking':
          yield { type: 'thinking', content: event.content }
          break
        case 'tool_call':
          toolCalls.push(event)
          break
        case 'usage':
          yield { type: 'usage', ...event }
          break
        case 'error':
          yield { type: 'error', error: event.error }
          return  // 致命错误终止循环
      }
    }

    // 3. 检查 stop_reason（修复现有 bug）
    if (stream.stopReason === 'max_tokens' && toolCalls.length === 0) {
      yield { type: 'warning', message: 'Response truncated by max_tokens' }
    }

    // 4. 保存 assistant 消息
    messages.push({
      role: 'assistant',
      content: [
        ...(responseText ? [{ type: 'text' as const, text: responseText }] : []),
        ...toolCalls.map(tc => ({ type: 'tool_use' as const, ...tc })),
      ],
    })

    // 5. 如果没有工具调用，正常结束
    if (toolCalls.length === 0) {
      yield { type: 'done' }
      return
    }

    // 6. 执行工具（权限检查在 registry.execute 内部）
    const toolResults: ToolResultBlock[] = []
    for (const tc of toolCalls) {
      yield { type: 'tool_start', id: tc.id, name: tc.name, input: tc.input }
      const result = await config.registry.execute(tc.name, tc.input, {
        cwd: config.cwd,
        permissionChecker: config.permissionChecker,
      })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tc.id,
        content: result.output,
        is_error: result.isError || undefined,
      })
      yield { type: 'tool_end', id: tc.id, result }
    }

    // 7. 工具结果作为 user 消息
    messages.push({ role: 'user', content: toolResults })
  }

  yield { type: 'max_steps_reached' }
}
```

**Loop 只管循环**，不管：Session 写入、错误恢复策略、性能监控、输出截断（这些由 Runner 在消费事件时处理）。

### A4. Provider 修复

**anthropic.ts**：
- chat() 加 thinking block 处理
- stream() 的 text 事件改为增量 delta

**openai.ts**：
- 修复致命 bug：`(part as any).input` → `part.args`
- chat() 加 try-catch 错误包装

**types.ts**：
- 删除 3 套独立映射表，改用 `config/models.ts` 统一注册表
- 删除 `DEFAULT_MODEL`/`FAST_MODEL` 死代码常量（用 constants.ts）

### A5. Runner 重写

```typescript
export function createRunner(config: RunnerConfig): Runner {
  // 1. 每个 Runner 独立的 ToolRegistry
  const registry = new ToolRegistry()
  registerBuiltinTools(registry)       // bash, read, write, edit, glob, grep
  registerSubagentTools(registry, ...) // ask_llm, run_agent, fork_agent, task（只留4种）

  // 2. 权限检查器（传给 registry，在工具执行前拦截）
  const permissionChecker = createPermissionChecker(config.permissions, config.onPermissionRequest)

  // 3. run 方法消费 Loop 事件，写 Session
  async function run(input: string, handlers: EventHandlers) {
    const session = getOrCreateSession()

    // 构建 messages（从 Session 读取历史）
    const messages = [...session.messages]
    messages.push({ role: 'user', content: input })

    for await (const event of agentLoop(messages, {
      provider, registry, toolNames, systemPrompt, modelConfig,
      permissionChecker, cwd: config.cwd,
    })) {
      // 事件消费层：写 Session、调 handlers、做监控
      switch (event.type) {
        case 'text_delta':
          session.appendText(event.delta)
          handlers.onText?.(event.delta)
          break
        case 'tool_start':
          handlers.onToolStart?.(event.id, event.name, event.input)
          break
        // ...
      }
    }
  }

  return { run, ... }
}
```

### A6. 基础设施修复

- **safePath**：统一路径校验函数，所有文件工具接入
- **typecheck 修复**：清理 14 个 TS 错误
- **测试脚本**：根 package.json 加 `"test": "pnpm --filter @naughtyagent/agent test"`

### A7. Phase A 完成标准

- [ ] `pnpm typecheck` 零错误
- [ ] `pnpm test` 能跑，核心路径有测试
- [ ] `pnpm build` 成功
- [ ] standalone 模式：`na "hello"` 能对话
- [ ] standalone 模式：`na "读取 README.md"` 工具调用正确
- [ ] 权限拒绝时工具真的不执行
- [ ] OpenAI 模式下工具调用参数正确
- [ ] 零 `as any`

---

## 四、Phase B：感知与知识

**目标**：Agent 能"永远工作"（压缩）且能"按需学习"（Knowledge Skill）

### B1. 三层压缩管道

```
src/context/compact/
├── micro.ts         # 每轮：替换旧 tool_result 为占位符（无损，纯规则）
├── auto.ts          # 阈值触发：LLM 摘要替换历史（有损，保存转录）
├── tool.ts          # compact 工具定义（LLM 主动调用）
└── transcript.ts    # 转录保存（压缩前完整历史写入磁盘）
```

**关键修复**：auto compact 生成的消息必须包含 `id` 和 `timestamp`。

**集成到 Runner**（不是 Loop）：
```typescript
// Runner 事件消费层
if (event.type === 'step_end') {
  microCompact(messages)
  if (estimateTokens(messages) > threshold) {
    await autoCompact(messages, provider)
  }
}
```

### B2. Knowledge Skill 系统

```
src/skill/knowledge/
├── loader.ts        # 扫描 skill 目录，解析 SKILL.md frontmatter
├── injector.ts      # 生成 system prompt Layer 1（摘要列表）
└── tool.ts          # load_skill 工具（Layer 2，按需加载全文）
```

与现有 Workflow Skill（/commit, /pr 等）共存。

### B3. Phase B 完成标准

- [ ] 长对话（100+ 轮）不会 token 溢出
- [ ] 压缩后消息格式合法（typecheck + API 测试）
- [ ] `load_skill("commit")` 返回完整 commit skill 内容
- [ ] system prompt 包含 skill 摘要列表

---

## 五、Phase C：表现层精简

**目标**：砍掉冗余，统一 CLI 体验

### C1. 删除传统 REPL

`repl.ts`（943 行）**直接删除**。理由：
- Ink REPL 已经有 fallback 逻辑（非 TTY 时回退到基础输出）
- 传统 REPL 和 Ink REPL 代码重复率 > 60%
- 维护两套是不可持续的

如果真的需要 dumb terminal 支持，写一个 200 行的 `simple-repl.ts`（只有 readline 输入 + 调用共享模块），而不是维护现在这个 943 行的怪物。

### C2. CLI 现代化

用 `commander` 替代手写 `parseArgs()`（约 100 行手写代码 → 30 行 commander 配置）。

### C3. Server 层修复

- 单一 `DaemonSessionManager`（Server 创建，注入到 routes 和 websocket）
- WebSocket 补充 Ping/Pong 心跳
- 中期考虑用 `ws` 库替代手写 WebSocket 协议

### C4. Phase C 完成标准

- [ ] `repl.ts` 已删除或替换为 ≤200 行的 simple-repl
- [ ] `na --help` 自动生成，与实际参数一致
- [ ] Daemon 多会话不会互相干扰
- [ ] WebSocket 有心跳检测

---

## 六、Phase D：IDE 集成

**目标**：VS Code 扩展 MVP

### D1. 实现 ChatViewProvider

```
packages/vscode/src/views/chat/
├── ChatViewProvider.ts     # WebviewViewProvider
└── webview/
    ├── index.html          # Webview 入口
    ├── main.ts             # 消息处理 + 渲染
    └── styles.css          # VS Code 主题变量
```

### D2. 功能范围

MVP 只做：
1. 基本对话（发送消息 → 流式显示回复）
2. Markdown 渲染（代码块高亮）
3. 工具调用展示（名称 + 状态）
4. 权限确认弹窗

不做：@file 补全、Diff 预览、多会话。

### D3. Phase D 完成标准

- [ ] VS Code 扩展能编译 (`pnpm --filter @naughtyagent/vscode build`)
- [ ] VSIX 安装后能打开 Chat 面板
- [ ] 能发送消息并接收流式回复
- [ ] 工具调用有视觉反馈

---

## 七、执行顺序和依赖

```
Phase A（核心引擎）─→ Phase B（感知与知识）─→ Phase C（表现层）
                                                      ↓
                                                Phase D（IDE）
```

Phase A 是一切的基础。Phase B 和 C 可以部分并行。Phase D 依赖 Server 层（Phase C）。

**每个 Phase 的第一步**都是写测试，再改代码。

---

## 八、删除清单

| 文件/模块 | 行数 | 删除原因 |
|-----------|------|---------|
| `src/cli/repl.ts` | 943 | 被 Ink REPL 取代 |
| `src/provider/types.ts` 中 3 套映射表 | ~120 | 合并到 `config/models.ts` |
| `src/provider/types.ts` 中 DEFAULT_MODEL/FAST_MODEL | ~20 | 死代码，改用 constants.ts |
| `src/tool/subagent/parallel-agents-tool.ts` | ~150 | 砍到 4 种子代理 |
| `src/tool/subagent/multi-agent-tool.ts` | ~150 | 同上 |
| `src/tool/subagent/run-workflow-tool.ts` | ~150 | 同上 |
| `src/tool/subagent/dispatch-agent-tool.ts` | ~150 | 同上 |
| `src/cli/repl-ink.ts` 中 checkTerminalSupport 重复 | ~20 | 合并到一处 |
| **合计约** | **~1700** | 减少维护面 |

---

## 九、不妥协的底线

1. **`pnpm typecheck` 零错误** —— 每个 Phase 结束时
2. **零 `as any`** —— 用正确的类型适配替代
3. **权限真正生效** —— 工具执行前拦截，不是事后通知
4. **增量文本输出** —— `text_delta` 而非累积 `text`
5. **stop_reason 必须处理** —— max_tokens 截断时告知用户
