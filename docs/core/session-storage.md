# 会话存储格式文档

## 概述

会话数据采用文件系统存储，每个会话有独立的目录，包含元数据和消息历史。

## 目录结构

```
.naught/
└── sessions/
    ├── session_1234567890_abc123/
    │   ├── session.json          # 会话元数据
    │   └── messages.jsonl        # 消息历史（JSONL 格式）
    ├── session_1234567890_def456/
    │   ├── session.json
    │   └── messages.jsonl
    └── session_xxx.backup/       # 备份目录（迁移时创建）
        ├── session.json
        └── messages.jsonl
```

## 存储格式

### 会话元数据 (session.json)

```json
{
  "id": "session_1234567890_abc123",
  "status": "idle",
  "cwd": "/path/to/project",
  "agentType": "build",
  "createdAt": 1234567890000,
  "updatedAt": 1234567890000,
  "usage": {
    "inputTokens": 1000,
    "outputTokens": 500
  },
  "tags": ["refactor", "auth"],
  "total_cost_usd": 0.05,
  "num_turns": 10,
  "parent_session_id": "session_1234567890_parent",
  "branch_point": 5
}
```

#### 字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 会话唯一标识符 |
| `status` | string | ✅ | 会话状态：idle, running, paused, completed, error |
| `cwd` | string | ✅ | 工作目录路径 |
| `agentType` | string | ✅ | Agent 类型：build, plan, explore |
| `createdAt` | number | ✅ | 创建时间戳（毫秒） |
| `updatedAt` | number | ✅ | 最后更新时间戳（毫秒） |
| `usage` | object | ✅ | Token 使用统计 |
| `usage.inputTokens` | number | ✅ | 输入 Token 数量 |
| `usage.outputTokens` | number | ✅ | 输出 Token 数量 |
| `tags` | string[] | ⚠️ | 会话标签（v2 新增） |
| `total_cost_usd` | number | ⚠️ | 总成本，美元（v2 新增） |
| `num_turns` | number | ⚠️ | 对话轮次（v2 新增） |
| `parent_session_id` | string | ❌ | 父会话 ID（仅分支会话，v2 新增） |
| `branch_point` | number | ❌ | 分支点消息索引（仅分支会话，v2 新增） |

**图例**：
- ✅ 必需字段
- ⚠️ 可选字段（v2 新增，旧版本可能没有）
- ❌ 条件字段（仅特定情况下存在）

### 消息历史 (messages.jsonl)

JSONL 格式（每行一个 JSON 对象）：

```jsonl
{"id":"msg_1","role":"user","content":[{"type":"text","text":"Hello"}],"timestamp":1234567890000}
{"id":"msg_2","role":"assistant","content":[{"type":"text","text":"Hi there"}],"timestamp":1234567891000,"stop_reason":"end_turn"}
{"id":"msg_3","role":"user","content":[{"type":"text","text":"Help me"}],"timestamp":1234567892000}
```

#### 消息字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 消息唯一标识符 |
| `role` | string | ✅ | 角色：user, assistant |
| `content` | array | ✅ | 内容块数组 |
| `timestamp` | number | ✅ | 消息时间戳（毫秒） |
| `stop_reason` | string | ❌ | 停止原因（仅 assistant 消息） |

#### 内容块类型

**文本块**：
```json
{
  "type": "text",
  "text": "消息内容"
}
```

**工具调用块**：
```json
{
  "type": "tool_use",
  "id": "tool_call_123",
  "name": "read_file",
  "input": {
    "path": "src/main.ts"
  }
}
```

**工具结果块**：
```json
{
  "type": "tool_result",
  "tool_use_id": "tool_call_123",
  "content": "文件内容...",
  "is_error": false
}
```

**图片块**（v2 新增）：
```json
{
  "type": "image",
  "source": {
    "type": "base64",
    "media_type": "image/png",
    "data": "iVBORw0KGgoAAAANS..."
  }
}
```

**音频块**（v2 新增）：
```json
{
  "type": "audio",
  "source": {
    "type": "base64",
    "media_type": "audio/wav",
    "data": "UklGRiQAAABXQVZF..."
  }
}
```

## 版本兼容性

### v1 格式（旧版本）

```json
{
  "id": "session_xxx",
  "status": "idle",
  "cwd": "/path",
  "agentType": "build",
  "createdAt": 1234567890000,
  "updatedAt": 1234567890000,
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0
  }
}
```

### v2 格式（当前版本）

```json
{
  "id": "session_xxx",
  "status": "idle",
  "cwd": "/path",
  "agentType": "build",
  "createdAt": 1234567890000,
  "updatedAt": 1234567890000,
  "usage": {
    "inputTokens": 0,
    "outputTokens": 0
  },
  "tags": [],
  "total_cost_usd": 0,
  "num_turns": 0
}
```

### 向后兼容性

- ✅ v2 代码可以读取 v1 格式的会话
- ✅ 缺失的字段会使用默认值：
  - `tags`: `[]`
  - `total_cost_usd`: `0`
  - `num_turns`: 从消息数量计算（`Math.floor(messages.length / 2)`）
- ✅ 保存时会自动升级到 v2 格式

## 数据迁移

### 自动迁移

使用迁移工具将 v1 格式升级到 v2：

```typescript
import { migrateAllSessions, printMigrationResult } from '@naughtyagent/agent'

const result = await migrateAllSessions({
  baseDir: process.cwd(),
  backup: true,      // 创建备份
  force: false,      // 只迁移需要的会话
  verbose: true      // 详细输出
})

printMigrationResult(result)
```

### 迁移选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `baseDir` | string | - | 基础目录（必需） |
| `backup` | boolean | true | 是否创建备份 |
| `force` | boolean | false | 是否强制迁移（重新计算字段） |
| `verbose` | boolean | false | 是否详细输出 |

### 迁移结果

```typescript
interface MigrationResult {
  total: number        // 总会话数
  migrated: number     // 成功迁移数
  skipped: number      // 跳过数（已是新格式）
  failed: number       // 失败数
  errors: Array<{      // 错误列表
    sessionId: string
    error: string
  }>
}
```

### 备份恢复

如果迁移出现问题，可以从备份恢复：

```bash
# 删除迁移后的会话
rm -rf .naught/sessions/session_xxx

# 从备份恢复
mv .naught/sessions/session_xxx.backup .naught/sessions/session_xxx
```

## 存储 API

### 保存会话

```typescript
import { saveSession } from '@naughtyagent/agent'

await saveSession(session, baseDir)
```

### 加载会话

```typescript
import { loadSession } from '@naughtyagent/agent'

const session = await loadSession(sessionId, baseDir)
```

### 追加消息

```typescript
import { appendMessage } from '@naughtyagent/agent'

await appendMessage(sessionId, message, baseDir)
```

### 删除会话

```typescript
import { deleteSessionStorage } from '@naughtyagent/agent'

await deleteSessionStorage(sessionId, baseDir)
```

### 列出会话

```typescript
import { listSavedSessions } from '@naughtyagent/agent'

const sessionIds = await listSavedSessions(baseDir)
```

### 检查会话是否存在

```typescript
import { isSessionSaved } from '@naughtyagent/agent'

const exists = await isSessionSaved(sessionId, baseDir)
```

## 性能考虑

### JSONL 格式优势

- **追加高效**：新消息直接追加到文件末尾，无需重写整个文件
- **流式读取**：可以逐行读取，不需要一次性加载所有消息
- **易于调试**：纯文本格式，可以直接查看和编辑

### 存储优化

1. **消息分离**：元数据和消息分开存储，减少小更新的开销
2. **目录隔离**：每个会话独立目录，便于管理和备份
3. **增量保存**：使用 `appendMessage` 追加消息，避免重写

### 性能指标

- 保存会话：< 10ms（小会话）
- 加载会话：< 50ms（< 1000 条消息）
- 追加消息：< 5ms
- 列出会话：< 100ms（< 100 个会话）

## 最佳实践

### 1. 定期清理

```typescript
// 删除超过 30 天的会话
const sessions = await listSavedSessions(baseDir)
for (const sessionId of sessions) {
  const session = await loadSession(sessionId, baseDir)
  const age = Date.now() - session.updatedAt
  if (age > 30 * 24 * 60 * 60 * 1000) {
    await deleteSessionStorage(sessionId, baseDir)
  }
}
```

### 2. 备份重要会话

```typescript
import * as fs from 'fs/promises'

// 备份到其他位置
await fs.cp(
  '.naught/sessions/important_session',
  'backups/important_session',
  { recursive: true }
)
```

### 3. 监控存储空间

```typescript
import { listSavedSessions, loadSession } from '@naughtyagent/agent'

let totalMessages = 0
const sessions = await listSavedSessions(baseDir)

for (const sessionId of sessions) {
  const session = await loadSession(sessionId, baseDir)
  totalMessages += session.messages.length
}

console.log(`总消息数: ${totalMessages}`)
```

### 4. 使用标签组织

```typescript
// 为会话添加标签
session.tags = ['refactor', 'auth', 'urgent']
await saveSession(session, baseDir)

// 按标签搜索
const authSessions = manager.findByTags(['auth'])
```

## 故障排查

### 问题 1：会话加载失败

**症状**：`loadSession` 抛出错误

**可能原因**：
- 会话文件损坏
- JSON 格式错误
- 文件权限问题

**解决方案**：
1. 检查文件是否存在
2. 验证 JSON 格式
3. 从备份恢复

### 问题 2：消息丢失

**症状**：加载的会话缺少部分消息

**可能原因**：
- 追加消息时出错
- 文件写入不完整

**解决方案**：
1. 检查 `messages.jsonl` 文件
2. 验证每行都是有效的 JSON
3. 从备份恢复

### 问题 3：迁移失败

**症状**：`migrateAllSessions` 报告失败

**可能原因**：
- 旧格式数据损坏
- 磁盘空间不足
- 权限问题

**解决方案**：
1. 查看错误详情（`result.errors`）
2. 手动修复损坏的会话
3. 确保有足够的磁盘空间

## 未来改进

### 计划中的功能

1. **压缩存储**：对旧会话进行压缩，节省空间
2. **索引优化**：添加索引文件，加速搜索
3. **增量备份**：只备份变更的部分
4. **云存储支持**：支持将会话同步到云端

### 性能优化

1. **缓存机制**：缓存常用会话，减少磁盘 I/O
2. **批量操作**：支持批量保存和加载
3. **异步写入**：使用写入队列，避免阻塞

## 相关文档

- [会话管理 API](./session-manager.md)
- [消息协议](./message-protocol.md)
- [数据迁移指南](./migration-guide.md)
