# NaughtAgent 深度分析与优化方案

> 分析日期：2026-04-07 | 版本：v0.10.0 | 分析师：NaughtyAgent

---

## 目录

- [一、项目概览](#一项目概览)
- [二、架构分析](#二架构分析)
- [三、优点分析（17 项）](#三优点分析17-项)
- [四、问题分析（22 项）](#四问题分析22-项)
- [五、优化方案（4 阶段）](#五优化方案4-阶段)
- [六、优先级路线图](#六优先级路线图)

---

## 一、项目概览

### 1.1 技术栈

| 维度 | 技术选型 |
|------|---------|
| **语言** | TypeScript 5.x (strict mode) |
| **运行时** | Node.js / Bun |
| **LLM SDK** | @anthropic-ai/sdk + Vercel AI SDK + OpenAI 兼容 |
| **Schema** | Zod + zod-to-json-schema |
| **UI 框架** | React Ink 5 (CLI) + VSCode Webview (GUI) |
| **构建** | tsup (agent) + esbuild (vscode) |
| **包管理** | pnpm workspace (monorepo) |

### 1.2 规模统计

| 模块 | 文件数 | 核心行数 | 职责 |
|------|--------|---------|------|
| `packages/agent` | 321 TS | ~15,000+ | 核心引擎 |
| `packages/vscode` | 10 TS + 1 JS | ~3,900 | VSCode 扩展 |
| `packages/iterative-probe-mcp` | ~10 | ~800 | MCP 服务器 |
| `.naughty/skills/` | 12 Skills | ~3,000 | 技能库 |
| 合计 | **~350+** | **~22,000+** | |

### 1.3 架构分层图

```
┌─────────────────────────────────────────────────────────────┐
│                     客户端层 (Client)                        │
│  CLI Plain-text │ CLI Ink UI │ VSCode Extension │ HTTP API  │
├─────────────────────────────────────────────────────────────┤
│                   传输层 (Transport)                         │
│  WebSocket (手写 RFC 6455) │ HTTP REST │ SSE Streaming      │
├─────────────────────────────────────────────────────────────┤
│                   服务层 (Service)                           │
│  Daemon Server │ Session Manager │ Task Scheduler           │
├─────────────────────────────────────────────────────────────┤
│                   核心层 (Core)                              │
│  AgentLoop │ ToolRegistry │ PromptManager │ CompactEngine   │
├─────────────────────────────────────────────────────────────┤
│                   提供者层 (Provider)                        │
│  Anthropic API │ OpenAI Compatible │ Provider Factory        │
├─────────────────────────────────────────────────────────────┤
│                   支撑层 (Support)                           │
│  Skill │ MCP │ SubAgent │ Memory │ Security │ Logging       │
└─────────────────────────────────────────────────────────────┘
```

## 二、架构分析

### 2.1 核心引擎 — AsyncGenerator 事件流

Agent 核心循环 (`agent/loop.ts`) 采用 **AsyncGenerator 模式**：

```typescript
async function* run(input): AsyncGenerator<AgentEvent>
```

事件类型共 9 种：`text_delta` | `thinking` | `thinking_end` | `tool_start` | `tool_end` | `error` | `done` | `await_input` | `text`

**评价**：✅ 优秀。生产者(Loop)与消费者(Runner/CLI/WebSocket)完全解耦，支持多种消费方式。

### 2.2 工具系统 — Namespace + Class 混合

- `Tool.define()` 工厂函数自动包装超时/日志/Zod 验证
- `ToolRegistry` 实例化设计（非全局单例），每 Runner 独立实例
- 支持 `clone()` 给子代理继承工具集
- 权限检查内嵌于 `execute()` — 真阻断

**评价**：✅ 优秀。消灭全局状态，支持多会话隔离。

### 2.3 三层 Compact 策略

| 层级 | 触发条件 | 机制 |
|------|---------|------|
| microCompact | 每步执行 | 截断过长 tool_result |
| autoCompact | token > 140K | LLM 生成对话摘要 |
| reactiveCompact | API 返回 413 | 紧急压缩后重试 |

**评价**：✅ 优秀。三层递进，从被动到主动全覆盖。

### 2.4 循环保护 — 三级阻断

| 级别 | 阈值 | 行为 |
|------|------|------|
| 软警告 | 同一工具调用 3 次 | 追加 ⚠️ WARNING 到输出 |
| 硬阻断 | 同一工具调用 10 次 | 不执行，返回 🛑 BLOCKED |
| 熔断器 | 累计 5 次硬阻断 | 注入 🚨 系统消息，终止循环 |

**评价**：✅ 优秀。防止 LLM 进入无限读取/重试循环。

### 2.5 Daemon 服务架构

```
CLI/VSCode ──WebSocket──► Daemon Server ──► Runner ──► AgentLoop ──► LLM
                              │
                         Scheduler
                         ├─ TaskQueue (优先级队列, 100上限)
                         └─ WorkerPool (3并发, 同会话串行)
```

**评价**：✅ 良好。支持后台持久运行，多客户端连接。但缺乏消息持久化恢复。

### 2.6 VSCode 扩展架构

```
ChatViewProvider (1550行, 过重)
├── HTML/CSS 内联模板 (800+行)
├── WS 事件路由
├── 状态管理
└── Session 生命周期

AgentClient ──WebSocket──► Daemon
DaemonClient ──进程管理──► daemon 进程
```

**评价**：⚠️ 功能完整但 ChatViewProvider 是 God Object，需拆分。

## 三、优点分析（17 项）

### 🏗️ A. 架构设计（5 项）

| # | 优点 | 关键文件 | 说明 |
|---|------|---------|------|
| A1 | **AsyncGenerator 事件流** | `agent/loop.ts` | 生产者/消费者完全解耦，支持 CLI/WebSocket/SSE 多种消费方式 |
| A2 | **实例化 ToolRegistry** | `tool/registry.ts` | 每 Runner 独立实例，消灭全局状态，支持 `clone()` 继承 |
| A3 | **三层 Compact 策略** | `agent/compact.ts` | micro/auto/reactive 三层递进，从截断到压缩到紧急恢复 |
| A4 | **三级循环保护** | `agent/loop.ts:137-201` | 软警告→硬阻断→熔断器，防止 LLM 无限循环 |
| A5 | **Prompt Cache 分段** | `agent/prompt.ts:249-342` | 静态段缓存（cache_control: ephemeral），动态段按需更新 |

### ⚡ B. 性能优化（3 项）

| # | 优点 | 关键文件 | 说明 |
|---|------|---------|------|
| B1 | **StreamingToolExecutor** | `loop.ts:226-276` | LLM 输出期间提前并行执行安全工具（read/glob/grep） |
| B2 | **增量 Token 报告** | `websocket.ts` | `reportedUsage` 去重，`await_input` + `done` 不重复计算 |
| B3 | **WeakMap Schema 缓存** | `tool.ts:148` | 零泄漏风险的 JSON Schema 缓存 |

### 🛡️ C. 可靠性（4 项）

| # | 优点 | 关键文件 | 说明 |
|---|------|---------|------|
| C1 | **多层错误恢复** | `loop.ts` | 413→compact重试，429→retry-after等待，max_tokens→续写提示 |
| C2 | **同会话串行执行** | `daemon/pool.ts` | WorkerPool 的 `runningSessions` 保证同一会话不并发 |
| C3 | **零依赖 WebSocket** | `server/websocket.ts` | 手写 RFC 6455 实现，减少供应链风险 |
| C4 | **Daemon 自愈** | `cli/daemon.ts` | PID 锁 + 进程探活 + 自动启动 + 超时强杀 |

### 🧩 D. 扩展性（3 项）

| # | 优点 | 关键文件 | 说明 |
|---|------|---------|------|
| D1 | **Skill 系统** | `skill/` | 12 个内置技能，支持 hooks 事件订阅 + emits 发射 |
| D2 | **MCP 集成** | `mcp/` | Model Context Protocol 外部工具服务器集成 |
| D3 | **SubAgent 体系** | `subtask/` | run_agent/parallel_agents/fork_agent 多种子代理模式 |

### 📦 E. 工程化（2 项）

| # | 优点 | 关键文件 | 说明 |
|---|------|---------|------|
| E1 | **Zod Schema 验证** | 全局 | 工具参数、配置、消息格式统一 Zod 定义，自动生成 JSON Schema |
| E2 | **Monorepo 管理** | `pnpm-workspace.yaml` | agent/vscode/mcp 三包独立，依赖关系清晰 |

## 四、问题分析（22 项）

### 🔴 Critical（4 项）— 严重影响可维护性/可靠性

#### P1. ChatViewProvider God Object（1550 行）
- **位置**：`packages/vscode/src/views/chat/ChatViewProvider.ts`
- **问题**：单个类承担状态管理 + WS 事件路由 + HTML 生成(500行) + CSS(400行) + Session 生命周期
- **影响**：修改任何 UI 元素都要编辑 1550 行大文件，牵一发动全身
- **建议**：拆分为 StateManager + EventRouter + TemplateEngine + SessionController

#### P2. 800+ 行 HTML/CSS 内联在 TypeScript 中
- **位置**：`ChatViewProvider.getHtml()` 方法
- **问题**：整个 Webview 模板是单个模板字面量，无语法高亮、无 linting、无热更新
- **影响**：前端开发体验极差，CSS 修改需要重新编译整个扩展
- **建议**：HTML/CSS 提取为独立文件，构建时注入

#### P3. 权限系统空壳
- **位置**：`cli/runner.ts:147-151`
- **问题**：`buildPermissionChecker` 始终返回 `true`，所有操作自动批准
- **影响**：安全基础设施存在但未生效，用户无法控制工具执行权限
- **建议**：实现基于配置的权限策略（allowlist/denylist/prompt）

#### P4. WebSocket 不支持分片帧
- **位置**：`server/websocket.ts`
- **问题**：手写 RFC 6455 未处理 `opcode 0x00`（continuation frame）
- **影响**：超大消息（>65KB）可能丢数据
- **建议**：补全分片帧拼装逻辑，或对超大消息分段发送

### 🟡 Medium（10 项）— 影响开发效率或存在隐患

#### P5. cc-ink 移植代码体积过大
- **位置**：`packages/agent/src/cli/cc-ink/`（~150 文件）
- **问题**：Claude Code 的 Ink UI 整体移植，占 agent 包文件数近一半
- **影响**：增加构建时间、包体积、维护负担
- **建议**：审计实际使用的组件，删除未引用代码

#### P6. 死代码 — DiffProvider / FileReferenceProvider
- **位置**：`packages/vscode/src/services/DiffProvider.ts`, `FileReferenceProvider.ts`
- **问题**：DiffProvider 创建但未连接到 ChatViewProvider；FileReferenceProvider 实例化但未使用
- **影响**：混淆代码理解，增加维护成本
- **建议**：完成集成或删除

#### P7. Session 消息内存无上限
- **位置**：`ChatViewProvider.sessionMessages` Map + `server/routes.ts` sessions Map
- **问题**：旧 Session 消息从不淘汰，长时间运行累积大量内存
- **影响**：内存泄漏风险，尤其长时间运行的 Daemon
- **建议**：实现 LRU 淘汰策略或设置 Session 数量上限

#### P8. 测试覆盖率极低
- **位置**：项目全局
- **问题**：仅发现少量测试文件，核心模块（loop/registry/session）缺乏单元测试
- **影响**：重构风险高，无法快速验证改动正确性
- **建议**：优先为 ToolRegistry、AgentLoop、Session 添加测试

#### P9. ToolRegistryCompat 废弃兼容层
- **位置**：`tool/registry.ts:367-385`
- **问题**：标注 `@deprecated` 但仍在导出，可能被旧代码引用
- **影响**：维护两套 API，新开发者困惑
- **建议**：搜索引用，迁移后删除

#### P10. Daemon 消息持久化未完成
- **位置**：`daemon/sessions.ts`
- **问题**：`messages.jsonl` 路径已定义但写入逻辑不完整，Daemon 重启丢失对话
- **影响**：意外崩溃时丢失所有对话历史
- **建议**：完成 JSONL 写入逻辑，启动时加载恢复

#### P11. resolveWebviewPanel 类型 hack
- **位置**：`ChatViewProvider.ts:247`
- **问题**：`this.view = { webview } as unknown as vscode.WebviewView` 强制类型转换
- **影响**：Sidebar 和 Editor Panel 同时打开时，Sidebar 停止接收更新
- **建议**：维护独立的 view 引用列表

#### P12. 手写 Markdown 渲染器局限
- **位置**：`media/chat.js renderMarkdown()`
- **问题**：~50 行正则实现，不支持嵌套列表/删除线/任务列表/脚注
- **影响**：复杂 Markdown 内容显示异常
- **建议**：引入 marked.js 或 markdown-it 等成熟库

#### P13. handleSend 竞态轮询
- **位置**：`server/websocket.ts:609-624`
- **问题**：用 `while + setTimeout` 轮询等待旧任务完成
- **影响**：CPU 不友好（虽有超时保护）
- **建议**：改为 Promise 事件驱动等待

#### P14. 私有字段越权访问
- **位置**：`SessionPicker.ts:167-196`
- **问题**：直接访问 `this.agentClient['config']` 私有字段发起 HTTP 请求
- **影响**：破坏封装性，AgentClient 内部变更会隐性破坏 SessionPicker
- **建议**：在 AgentClient 中暴露公共方法

### 🟢 Low（8 项）— 可改善但不紧急

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| P15 | **Magic Regex 检测并行意图** | `loop.ts:113` | `/同时\|并行\|一起\|agent.*team/i` 脆弱易误触发 |
| P16 | **常量内联散落** | `loop.ts` 等 | `constants.ts` 声明"严禁硬编码"但多处仍有内联常量 |
| P17 | **index.ts 手动导出 261 行** | `src/index.ts` | Barrel export 维护成本高，易遗漏 |
| P18 | **暗色主题硬编码** | `ChatViewProvider.getHtml()` | `--bg: #1e1e1e` 等硬编码色值，亮色主题不适配 |
| P19 | **代码块无语法高亮** | `media/chat.js` | 纯 `<pre>` 标签，无 highlight.js 集成 |
| P20 | **输入框高度局促** | Webview CSS | `<textarea>` 仅 48px，窄面板体验差 |
| P21 | **CSP 不一致** | Webview HTML | Script 有 nonce，inline style 无 nonce |
| P22 | **10s 轮询刷新 Session 列表** | `SessionListProvider` | 应改为事件驱动更新 |

### 问题严重度分布

```
Critical  ████ 4 项 (18%)
Medium    ██████████ 10 项 (45%)
Low       ████████ 8 项 (37%)
```

## 五、优化方案（4 阶段）

### Phase 1：架构治理（预计 3-5 天）

> 目标：消除 Critical 问题，提升可维护性

#### 1.1 拆分 ChatViewProvider（P1 + P2）

**当前**：1550 行 God Object
**目标**：4 个独立模块 < 400 行/个

```
packages/vscode/src/views/chat/
├── ChatViewProvider.ts    (300行, 路由+生命周期)
├── ChatStateManager.ts    (200行, 消息/会话状态)
├── ChatEventRouter.ts     (200行, WS事件分发)
├── ChatTemplateEngine.ts  (100行, HTML/CSS加载器)
├── templates/
│   ├── chat.html          (200行, HTML结构)
│   └── chat.css           (400行, 样式表)
└── chat.js                (已有, Webview脚本)
```

**实施步骤**：
1. 提取 `getHtml()` 中的 HTML 到 `templates/chat.html`
2. 提取内联 CSS 到 `templates/chat.css`
3. `ChatTemplateEngine` 在构建时读取文件，运行时注入 nonce/URI
4. 抽取状态管理逻辑到 `ChatStateManager`
5. 抽取 WS 事件处理到 `ChatEventRouter`
6. ChatViewProvider 只保留路由和生命周期管理

#### 1.2 完善 WebSocket 分片帧支持（P4）

```typescript
// server/websocket.ts 补充 continuation frame 处理
class WebSocketConnection {
  private fragmentBuffer: Buffer[] = [];
  private fragmentOpcode: number = 0;

  handleFrame(frame: Frame) {
    if (frame.opcode === 0x00) { // continuation
      this.fragmentBuffer.push(frame.payload);
      if (frame.fin) {
        const fullPayload = Buffer.concat(this.fragmentBuffer);
        this.processMessage(this.fragmentOpcode, fullPayload);
        this.fragmentBuffer = [];
      }
    } else if (!frame.fin) { // 首个分片
      this.fragmentOpcode = frame.opcode;
      this.fragmentBuffer = [frame.payload];
    } else { // 完整帧
      this.processMessage(frame.opcode, frame.payload);
    }
  }
}
```

#### 1.3 权限系统实装（P3）

```typescript
// 权限策略配置 (.naughty/permissions.json)
{
  "mode": "prompt",          // "auto" | "prompt" | "strict"
  "allowlist": ["read", "glob", "grep", "ask_llm"],
  "denylist": ["bash --rm", "bash --format"],
  "requireConfirmation": ["write", "edit", "bash"]
}
```

**实施**：
1. 定义 `PermissionPolicy` 接口
2. 从 `.naughty/permissions.json` + VSCode 配置加载策略
3. `buildPermissionChecker` 根据策略返回真实检查器
4. explore/plan 模式自动限制写操作

### Phase 2：代码清理与健壮性（预计 2-3 天）

> 目标：清除死代码、完善持久化、提升可靠性

#### 2.1 清理死代码（P5 + P6 + P9）

| 任务 | 操作 | 预计影响 |
|------|------|---------|
| cc-ink 审计 | `grep -r` 查找 cc-ink 实际引用，删除未使用文件 | 减少 50-100 文件 |
| DiffProvider | 完成与 ChatViewProvider 集成（显示 edit/write diff）或删除 | -297 行死代码 |
| FileReferenceProvider | 已被 ChatViewProvider 内联替代，删除 | -144 行死代码 |
| ToolRegistryCompat | 搜索引用，迁移到 ToolRegistry，删除兼容层 | -20 行 + 清晰 API |

#### 2.2 完成 Session 持久化（P10）

```typescript
// daemon/sessions.ts 补充消息写入
class DaemonSessionManager {
  async appendMessage(sessionId: string, message: Message): Promise<void> {
    const dir = path.join(this.sessionsDir, sessionId);
    const jsonlPath = path.join(dir, 'messages.jsonl');
    await fs.appendFile(jsonlPath, JSON.stringify(message) + '\n');
  }

  async loadMessages(sessionId: string): Promise<Message[]> {
    const jsonlPath = path.join(this.sessionsDir, sessionId, 'messages.jsonl');
    if (!await fs.access(jsonlPath).then(() => true).catch(() => false)) return [];
    const lines = (await fs.readFile(jsonlPath, 'utf-8')).split('\n').filter(Boolean);
    return lines.map(line => JSON.parse(line));
  }
}
```

**关键点**：
- 每条消息追加写入（不全量覆写）
- Daemon 启动时扫描并恢复
- 设置单文件最大 10MB，超出自动归档

#### 2.3 Session 内存淘汰（P7）

```typescript
class SessionMessageCache {
  private cache = new Map<string, Message[]>();
  private accessOrder: string[] = [];
  private maxSessions = 20;

  set(sessionId: string, messages: Message[]) {
    if (this.cache.size >= this.maxSessions) {
      const oldest = this.accessOrder.shift()!;
      this.cache.delete(oldest);
    }
    this.cache.set(sessionId, messages);
    this.accessOrder.push(sessionId);
  }
}
```

#### 2.4 竞态等待优化（P13）

将 `handleSend` 的轮询改为事件驱动：

```typescript
// 替换 while+setTimeout 轮询
private sessionCompleted = new Map<string, PromiseWithResolvers<void>>();

async waitForSessionIdle(sessionId: string, timeout = 5000): Promise<void> {
  if (!this.runningSessionIds.has(sessionId)) return;
  const { promise, resolve } = Promise.withResolvers<void>();
  this.sessionCompleted.set(sessionId, { promise, resolve });
  await Promise.race([promise, sleep(timeout)]);
  this.sessionCompleted.delete(sessionId);
}

// 在 session 完成时触发
onSessionComplete(sessionId: string) {
  this.sessionCompleted.get(sessionId)?.resolve();
}
```

### Phase 3：体验升级（预计 3-5 天）

> 目标：提升 VSCode 扩展和 CLI 的用户体验

#### 3.1 Webview Markdown 渲染升级（P12 + P19）

**方案**：引入 `marked` + `highlight.js`

```html
<!-- templates/chat.html 增加依赖 -->
<script src="${markedUri}"></script>
<script src="${highlightUri}"></script>
<link href="${highlightCssUri}" rel="stylesheet">
```

```javascript
// chat.js 替换 renderMarkdown
function renderMarkdown(text) {
  marked.setOptions({
    highlight: (code, lang) => hljs.highlightAuto(code, lang ? [lang] : undefined).value,
    breaks: true,
    gfm: true
  });
  return DOMPurify.sanitize(marked.parse(text));
}
```

**收益**：支持表格/任务列表/嵌套列表/代码高亮/XSS 安全

#### 3.2 VSCode 主题适配（P18）

```css
/* chat.css — 用 VSCode CSS 变量替换硬编码 */
:root {
  --bg: var(--vscode-editor-background);
  --fg: var(--vscode-editor-foreground);
  --border: var(--vscode-panel-border);
  --input-bg: var(--vscode-input-background);
  --input-fg: var(--vscode-input-foreground);
  --btn-bg: var(--vscode-button-background);
  --btn-fg: var(--vscode-button-foreground);
  --code-bg: var(--vscode-textCodeBlock-background);
  --hover-bg: var(--vscode-list-hoverBackground);
}
```

**收益**：自动适配所有 VSCode 颜色主题（暗色/亮色/高对比度）

#### 3.3 输入框体验优化（P20）

```css
.input-area textarea {
  min-height: 64px;
  max-height: 200px;
  resize: vertical;        /* 允许手动拉伸 */
  overflow-y: auto;
}
```

```javascript
// chat.js 自动增长
textarea.addEventListener('input', () => {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
});
```

#### 3.4 Session 列表事件驱动（P22）

```typescript
// 替换 10s 轮询
class SessionListProvider {
  // 监听 AgentClient 事件而非定时器
  constructor(agentClient: AgentClient) {
    agentClient.on('session:created', () => this.refresh());
    agentClient.on('session:deleted', () => this.refresh());
    agentClient.on('connected', () => this.refresh());
  }
}
```

### Phase 4：质量保障（持续）

> 目标：建立测试基础设施，保障长期可维护性

#### 4.1 核心模块测试（P8）

**优先级排序**：

| 模块 | 测试类型 | 理由 |
|------|---------|------|
| `ToolRegistry` | 单元测试 | 最核心组件，register/execute/clone |
| `AgentLoop` | 集成测试 | Mock Provider，验证循环/compact/保护机制 |
| `WebSocket` | 单元测试 | 帧解析/分片/心跳 |
| `Session` | 集成测试 | 创建/持久化/恢复 |
| `compact` | 单元测试 | micro/auto/reactive 三层策略 |

**测试框架选择**：`vitest`（与 TypeScript + ESM 原生兼容）

```jsonc
// vitest.config.ts
{
  test: {
    include: ['packages/agent/src/**/*.test.ts'],
    coverage: { provider: 'v8', thresholds: { lines: 60 } }
  }
}
```

#### 4.2 E2E 测试

```typescript
// tests/e2e/daemon.test.ts
describe('Daemon E2E', () => {
  test('CLI → Daemon → Agent → Tool → Response', async () => {
    const daemon = await startDaemon();
    const ws = new WebSocket(`ws://localhost:${daemon.port}`);
    ws.send(JSON.stringify({ type: 'send', prompt: 'echo hello' }));
    const response = await waitForMessage(ws, 'done');
    expect(response.text).toContain('hello');
  });
});
```

#### 4.3 CI 集成建议

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    steps:
      - run: pnpm install
      - run: pnpm -r build
      - run: pnpm -r test
      - run: pnpm -r typecheck
```

## 六、优先级路线图

### 总览甘特图

```
Week 1          Week 2          Week 3          持续
├── Phase 1 ────┤               │               │
│ P1 拆分God Obj│── Phase 2 ────┤               │
│ P2 HTML外置   │ P5 清理死代码  │── Phase 3 ────┤
│ P3 权限系统   │ P6+P9 删废代码 │ P12 MD渲染    │── Phase 4 ──►
│ P4 WS分片     │ P7 内存淘汰   │ P18 主题适配   │ 测试覆盖
│               │ P10 持久化    │ P20 输入框优化  │ E2E
│               │ P13 竞态优化  │ P22 事件驱动   │ CI/CD
└───────────────┴───────────────┴───────────────┴────────────►
```

### 优先级排序矩阵

| 优先级 | 编号 | 任务 | 难度 | 影响面 | 风险 |
|--------|------|------|------|--------|------|
| **P0** | P1+P2 | 拆分 ChatViewProvider + HTML 外置 | 🟡 中 | 🔴 高 | 🟡 中 |
| **P0** | P4 | WebSocket 分片帧支持 | 🟢 低 | 🔴 高 | 🟢 低 |
| **P1** | P3 | 权限系统实装 | 🟡 中 | 🟡 中 | 🟢 低 |
| **P1** | P10 | Session 消息持久化 | 🟡 中 | 🔴 高 | 🟡 中 |
| **P1** | P7 | Session 内存淘汰 | 🟢 低 | 🟡 中 | 🟢 低 |
| **P2** | P5 | cc-ink 代码审计清理 | 🟡 中 | 🟢 低 | 🟡 中 |
| **P2** | P6+P9 | 死代码/废弃兼容层清理 | 🟢 低 | 🟢 低 | 🟢 低 |
| **P2** | P13 | 竞态轮询→事件驱动 | 🟢 低 | 🟢 低 | 🟢 低 |
| **P3** | P12+P19 | Markdown 渲染 + 代码高亮 | 🟡 中 | 🟡 中 | 🟢 低 |
| **P3** | P18 | VSCode 主题适配 | 🟢 低 | 🟡 中 | 🟢 低 |
| **P3** | P8 | 核心模块测试 | 🔴 高 | 🔴 高 | 🟢 低 |
| **P4** | P15-P22 | Low 级别问题批量修复 | 🟢 低 | 🟢 低 | 🟢 低 |

### 预期收益

| 指标 | 当前 | Phase 1 后 | Phase 4 后 |
|------|------|-----------|-----------|
| 最大文件行数 | 1550 行 | < 400 行 | < 400 行 |
| 死代码文件数 | ~100+ | ~100+ | < 10 |
| 测试覆盖率 | ~5% | ~5% | > 60% |
| WS 消息可靠性 | 有分片风险 | 完整支持 | 完整支持 |
| 权限控制 | 空壳 | 可配置策略 | 可配置策略 |
| Session 持久化 | 不可靠 | JSONL 持久 | JSONL + 压缩 |
| 主题适配 | 仅暗色 | 全主题 | 全主题 |

---

## 附录：技术决策说明

### 为什么不用现成 WebSocket 库？
当前手写 WS 已稳定运行，仅需补全分片帧。引入 `ws` 库会增加约 500KB 依赖，收益不大。

### 为什么推荐 vitest 而非 jest？
NaughtAgent 使用 ESM + TypeScript，vitest 原生支持无需额外配置。jest 需要 ts-jest 或 @swc/jest 转换。

### ChatViewProvider 拆分风险评估
- **高风险点**：`resolveWebviewView` 和 `resolveWebviewPanel` 的双重注册机制
- **缓解措施**：先写测试固定当前行为，再分步拆分
- **回退方案**：每个子模块独立 PR，单独可回滚

---

*文档生成：NaughtyAgent | 最后更新：2026-04-07*
