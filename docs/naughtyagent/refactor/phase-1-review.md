# Phase 1 Spec 审查报告

## 审查日期
2026-01-17

## 审查范围
- `.kiro/specs/phase-1-infrastructure/requirements.md`
- `.kiro/specs/phase-1-infrastructure/design.md`
- `.kiro/specs/phase-1-infrastructure/tasks.md`
- 现有代码实现对比

---

## 🔴 严重问题（阻塞性）

### 问题 1: SessionManager 架构冲突

**位置**: `design.md` 第 2.2 节，`tasks.md` 任务 2.2

**问题描述**:
Spec 中设计的 `SessionManager.branch()` 方法是 **async** 的：
```typescript
async branch(sessionId: SessionID, fromIndex: number): Promise<Session>
```

但现有的 `SessionManager` 是**内存管理器**，所有方法都是**同步**的：
```typescript
// 现有实现
class SessionManager {
  private sessions = new Map<SessionID, Session>()
  create(options): Session { ... }  // 同步
  get(id): Session | undefined { ... }  // 同步
}
```

**影响**:
1. 如果改成 async，会破坏所有现有调用代码
2. 如果保持同步，与 Spec 设计不一致
3. 存储层（`storage.ts`）是 async 的，但 SessionManager 是同步的，职责混乱

**建议方案**:
```typescript
// 方案 A: 分离内存管理和持久化（推荐）
class SessionManager {
  // 内存管理 - 同步
  private sessions = new Map<SessionID, Session>()
  
  create(options): Session { ... }
  get(id): Session | undefined { ... }
  branch(sessionId, fromIndex): Session {  // 同步分支
    const parent = this.getOrThrow(sessionId)
    const branched = { ...createSession(), messages: parent.messages.slice(0, fromIndex + 1) }
    this.sessions.set(branched.id, branched)
    return branched
  }
}

// 持久化 - 异步（已有 storage.ts）
async function saveSession(session: Session): Promise<void> { ... }
async function loadSession(sessionId: SessionID): Promise<Session> { ... }
```

**修复优先级**: 🔴 高（必须在实施前解决）

---

### 问题 2: 存储格式不兼容

**位置**: `design.md` 数据模型，`tasks.md` 任务 2.5

**问题描述**:
现有存储格式：
```
.naught/sessions/{sessionId}/
├── session.json      # 元数据（不含 messages）
└── messages.jsonl    # 消息（JSONL 格式）
```

Spec 设计的新字段（`tags`, `total_cost_usd`, `num_turns`, `parent_session_id`, `branch_point`）需要存储在 `session.json` 中，但现有的 `SessionMeta` 接口没有这些字段。

**影响**:
1. 需要更新 `SessionMeta` 接口
2. 需要迁移脚本处理旧数据
3. 任务 2.5 的工作量被低估（3小时可能不够）

**建议方案**:
```typescript
// 更新 SessionMeta
interface SessionMeta {
  id: string
  status: Session["status"]
  cwd: string
  agentType: Session["agentType"]
  createdAt: number
  updatedAt: number
  usage: Session["usage"]
  
  // 新增字段（可选，向后兼容）
  tags?: string[]
  total_cost_usd?: number
  num_turns?: number
  parent_session_id?: string
  branch_point?: number
}

// 迁移函数
async function migrateSessionStorage(sessionId: SessionID, baseDir: string): Promise<void> {
  const session = await loadSession(sessionId, baseDir)
  // 自动补充缺失字段
  if (!session.tags) session.tags = []
  if (!session.total_cost_usd) session.total_cost_usd = 0
  if (!session.num_turns) session.num_turns = Math.floor(session.messages.length / 2)
  await saveSession(session, baseDir)
}
```

**修复优先级**: 🔴 高（必须在实施前明确）

---

## 🟡 中等问题（需要调整）

### 问题 3: ToolResultBlock 类型变更破坏性

**位置**: `design.md` 第 1.1 节

**问题描述**:
Spec 设计将 `ToolResultBlock.content` 从 `string` 改为 `string | ContentBlock[]`：
```typescript
// 现有
interface ToolResultBlock {
  type: "tool_result"
  tool_use_id: string
  content: string  // 只支持字符串
  is_error?: boolean
}

// Spec 设计
interface ToolResultBlock {
  type: "tool_result"
  tool_use_id: string
  content: string | ContentBlock[]  // 支持多模态
  is_error?: boolean
}
```

**影响**:
1. 所有使用 `ToolResultBlock.content` 的代码需要类型守卫
2. 现有工具返回的都是 `string`，需要逐步迁移
3. 可能破坏现有的序列化/反序列化逻辑

**建议方案**:
```typescript
// 方案 A: 渐进式迁移（推荐）
interface ToolResultBlock {
  type: "tool_result"
  tool_use_id: string
  content: string | ContentBlock[]
  is_error?: boolean
}

// 提供类型守卫
function isStringContent(content: string | ContentBlock[]): content is string {
  return typeof content === 'string'
}

// 提供兼容函数
function getToolResultText(block: ToolResultBlock): string {
  if (typeof block.content === 'string') {
    return block.content
  }
  return block.content
    .filter((b): b is TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
}
```

**修复优先级**: 🟡 中（可以在实施中处理）

---

### 问题 4: 缺少 sleep 函数实现

**位置**: `design.md` 第 3.3 节

**问题描述**:
`withRetry()` 函数中使用了 `await sleep(delay)`，但没有定义 `sleep` 函数。

**影响**:
代码无法编译

**建议方案**:
```typescript
// 在 error/retry.ts 中添加
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
```

**修复优先级**: 🟡 中（实施时容易发现和修复）

---

### 问题 5: getCurrentTraceId 未定义

**位置**: `design.md` 第 4.2 节

**问题描述**:
`Logger` 类中使用了 `getCurrentTraceId()`，但 Spec 中只在 4.4 节提到要实现，没有给出具体实现。

**影响**:
1. 任务 4.2 依赖任务 4.4，但 tasks.md 中没有标明
2. 可能导致实施顺序错误

**建议方案**:
```typescript
// packages/agent/src/logging/trace.ts
import { AsyncLocalStorage } from 'async_hooks'

const traceStorage = new AsyncLocalStorage<string>()

export function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export function getCurrentTraceId(): string | undefined {
  return traceStorage.getStore()
}

export function setTraceId(traceId: string): void {
  traceStorage.enterWith(traceId)
}

export async function withTraceId<T>(
  traceId: string,
  fn: () => Promise<T>
): Promise<T> {
  return traceStorage.run(traceId, fn)
}
```

**修复优先级**: 🟡 中（需要更新任务依赖关系）

---

## 🟢 轻微问题（建议优化）

### 问题 6: 任务时间估算可能不准确

**位置**: `tasks.md` 任务统计

**问题描述**:
- 任务 2.5（存储层更新）估算 3 小时，但涉及迁移脚本、兼容性测试，可能需要 5-6 小时
- 任务 3.4（应用错误处理）估算 4 小时，但需要修改多个模块，可能需要 6-8 小时
- 任务 4.5（应用日志监控）估算 4 小时，但需要仔细选择监控点，可能需要 5-6 小时

**影响**:
总时间可能从 62.5 小时增加到 70-75 小时（约 9-10 天）

**建议**:
调整时间估算，增加缓冲时间

**修复优先级**: 🟢 低（不影响实施，但影响进度预期）

---

### 问题 7: 缺少 parent_tool_use_id 的具体设计

**位置**: `requirements.md` US-1

**问题描述**:
需求中提到"支持 `parent_tool_use_id` 关联工具结果"，但 design.md 中没有具体设计。

**影响**:
实施时可能不清楚如何实现

**建议方案**:
```typescript
// 在 Message 接口中添加（用于工具结果消息）
export interface Message {
  id: string
  role: MessageRole
  content: ContentBlock[]
  timestamp: number
  stop_reason?: StopReason
  parent_tool_use_id?: string  // 新增：关联到父工具调用
}
```

**修复优先级**: 🟢 低（可以在实施时补充）

---

### 问题 8: 缺少 createAudioMessage 和 getAudios 实现

**位置**: `design.md` 第 1.2 节，`tasks.md` 任务 1.2

**问题描述**:
设计文档中只给出了 `createImageMessage` 和 `getImages` 的实现，但任务清单中要求实现 `createAudioMessage` 和 `getAudios`。

**影响**:
实施时需要自己补充设计

**建议方案**:
```typescript
export function createAudioMessage(
  audioData: string,
  mediaType: AudioBlock["source"]["media_type"]
): Message {
  return {
    id: generateMessageId(),
    role: "user",
    content: [{
      type: "audio",
      source: { type: "base64", media_type: mediaType, data: audioData }
    }],
    timestamp: Date.now()
  }
}

export function getAudios(message: Message): AudioBlock[] {
  return message.content.filter(
    (block): block is AudioBlock => block.type === "audio"
  )
}
```

**修复优先级**: 🟢 低（实施时容易补充）

---

## 📋 逻辑问题

### 问题 9: Step 依赖关系不准确

**位置**: `tasks.md` 依赖关系图

**问题描述**:
依赖关系图显示：
```
Step 1 (消息协议)
    ↓
Step 2 (会话管理) ← 依赖 Step 1
    ↓
Step 3 (错误处理) ← 独立
    ↓
Step 4 (日志监控) ← 独立
```

但实际上：
- Step 2 **不依赖** Step 1（会话管理的新字段与消息协议无关）
- Step 3 和 Step 4 可以**并行**进行
- Step 3 和 Step 4 应该在 Step 1-2 **之前**完成，因为它们是基础设施

**建议方案**:
```
Step 3 (错误处理) ← 独立，优先
Step 4 (日志监控) ← 独立，优先
    ↓
Step 1 (消息协议) ← 独立
Step 2 (会话管理) ← 独立
    ↓
Step 5 (集成文档) ← 依赖 Step 1-4
```

**修复优先级**: 🟢 低（不影响实施，但影响效率）

---

## 🤖 AI Agent 实施障碍

### 障碍 1: 缺少明确的"完成定义"

**问题**:
每个任务的完成标准不够明确，AI 可能不知道何时停止。

**建议**:
为每个任务添加明确的验收标准：
```markdown
### 任务 1.1: 添加多模态类型定义
- [ ] 在 `message.ts` 中添加 `ImageBlock` 接口
- [ ] 在 `message.ts` 中添加 `AudioBlock` 接口
- [ ] 更新 `ContentBlock` 联合类型
- [ ] 添加 `StopReason` 类型
- [ ] 扩展 `Message` 接口添加 `stop_reason` 字段
- [ ] 更新 `ToolResultBlock` 支持多模态内容

**验收标准**:
✅ TypeScript 编译通过，无类型错误
✅ 所有新类型都有 JSDoc 注释
✅ 导出到 index.ts
✅ 与现有类型兼容
```

---

### 障碍 2: 缺少测试用例的具体描述

**问题**:
任务清单中只说"测试 XXX"，但没有具体的测试场景。

**建议**:
为每个测试任务添加具体的测试用例：
```markdown
### 任务 1.3: 编写单元测试
- [ ] 测试 `ImageBlock` 创建和解析
  - 测试 base64 图片创建
  - 测试 URL 图片创建
  - 测试不同 media_type
  - 测试无效数据处理
- [ ] 测试 `AudioBlock` 创建和解析
  - 测试 wav 音频创建
  - 测试 mp3 音频创建
  - 测试无效数据处理
```

---

### 障碍 3: 缺少代码示例和上下文

**问题**:
AI 需要知道现有代码的风格和模式，但 Spec 中没有提供足够的上下文。

**建议**:
在 design.md 中添加"现有代码参考"章节：
```markdown
## 现有代码参考

### 消息创建模式
参考 `createUserMessage()` 的实现风格：
```typescript
export function createUserMessage(text: string): Message {
  return {
    id: generateMessageId(),
    role: "user",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
  }
}
```

### 测试模式
参考 `packages/agent/test/session/message.test.ts` 的测试风格
```

---

## 📊 问题汇总

| 问题 | 严重程度 | 影响范围 | 修复优先级 |
|------|---------|---------|-----------|
| SessionManager 架构冲突 | 🔴 严重 | 整个 Step 2 | 高 |
| 存储格式不兼容 | 🔴 严重 | 任务 2.5 | 高 |
| ToolResultBlock 类型变更 | 🟡 中等 | Step 1 | 中 |
| 缺少 sleep 函数 | 🟡 中等 | 任务 3.3 | 中 |
| getCurrentTraceId 未定义 | 🟡 中等 | 任务 4.2 | 中 |
| 时间估算不准确 | 🟢 轻微 | 进度预期 | 低 |
| 缺少 parent_tool_use_id 设计 | 🟢 轻微 | 任务 1.1 | 低 |
| 缺少音频函数实现 | 🟢 轻微 | 任务 1.2 | 低 |
| Step 依赖关系不准确 | 🟢 轻微 | 实施顺序 | 低 |
| 缺少完成定义 | 🤖 AI障碍 | 所有任务 | 中 |
| 缺少测试用例描述 | 🤖 AI障碍 | 测试任务 | 中 |
| 缺少代码示例 | 🤖 AI障碍 | 所有任务 | 低 |

---

## 🎯 建议的修复顺序

### 立即修复（阻塞性）
1. ✅ 解决 SessionManager 架构冲突
2. ✅ 明确存储格式迁移方案

### 实施前修复（重要）
3. ✅ 补充缺失的函数实现（sleep, getCurrentTraceId）
4. ✅ 调整任务依赖关系
5. ✅ 为每个任务添加验收标准

### 实施中修复（可选）
6. ⚪ 补充测试用例描述
7. ⚪ 添加代码示例和参考
8. ⚪ 调整时间估算

---

## ✅ 修复后的可行性评估

修复上述问题后，Spec 的可行性：
- **技术可行性**: ✅ 高（无技术障碍）
- **时间可行性**: ✅ 中（需要 9-10 天，而非 8-10 天）
- **AI 可实施性**: ✅ 中（需要补充更多细节）
- **向后兼容性**: ✅ 高（设计良好）

---

## 📝 下一步行动

1. **修复严重问题** - 更新 design.md 和 tasks.md
2. **补充缺失实现** - 添加 sleep, getCurrentTraceId 等
3. **细化任务描述** - 添加验收标准和测试用例
4. **开始实施** - 按修复后的 Spec 执行
