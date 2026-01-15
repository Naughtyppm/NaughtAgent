# Interface Spec: User Experience (UX)

> Phase 4.5.4 用户体验增强

## 概述

提升 Agent 的用户体验，包括：
1. **Diff 预览** - 修改文件前显示差异，让用户确认
2. **撤销操作** - 记录文件修改历史，支持回滚
3. **流式输出** - 完善实时显示效果

## 1. Diff 预览

### 1.1 Types

```typescript
/**
 * Diff 显示格式
 */
type DiffFormat = "unified" | "side-by-side" | "inline"

/**
 * 文件变更类型
 */
type ChangeType = "create" | "modify" | "delete"

/**
 * 文件变更预览
 */
interface FileChange {
  /** 文件路径 */
  filePath: string
  /** 变更类型 */
  changeType: ChangeType
  /** 原内容（modify/delete 时存在） */
  oldContent?: string
  /** 新内容（create/modify 时存在） */
  newContent?: string
  /** 统一 diff 格式 */
  unifiedDiff?: string
}

/**
 * Diff 预览选项
 */
interface DiffPreviewOptions {
  /** 显示格式 */
  format?: DiffFormat
  /** 上下文行数 */
  contextLines?: number
  /** 是否显示行号 */
  showLineNumbers?: boolean
  /** 是否高亮语法 */
  syntaxHighlight?: boolean
}

/**
 * Diff 生成器
 */
interface DiffGenerator {
  /** 生成统一 diff */
  generateUnifiedDiff(
    oldContent: string,
    newContent: string,
    filePath: string,
    options?: { contextLines?: number }
  ): string

  /** 生成文件变更预览 */
  generateFileChange(
    filePath: string,
    oldContent: string | null,
    newContent: string | null
  ): FileChange

  /** 格式化 diff 用于终端显示 */
  formatForTerminal(diff: string): string
}
```

### 1.2 Contracts

#### generateUnifiedDiff

**前置条件**:
1. `filePath` 必须非空

**后置条件**:
1. 返回标准 unified diff 格式
2. 包含 `---` 和 `+++` 头部
3. 包含 `@@` 行号标记

#### generateFileChange

**前置条件**:
1. `filePath` 必须非空
2. `oldContent` 和 `newContent` 不能同时为 null

**后置条件**:
1. `changeType` 正确反映变更类型：
   - `oldContent === null` → "create"
   - `newContent === null` → "delete"
   - 其他 → "modify"

### 1.3 集成方式

在工具执行前生成预览，权限确认时展示：

```typescript
// 在 write/edit 工具执行前
const change = diffGenerator.generateFileChange(filePath, oldContent, newContent)
const preview = diffGenerator.formatForTerminal(change.unifiedDiff)

// 展示给用户确认
const confirmed = await onConfirm({
  type: "write",
  resource: filePath,
  description: "Write file",
  preview, // 新增：diff 预览
})
```

---

## 2. 撤销操作

### 2.1 Types

```typescript
/**
 * 文件操作记录
 */
interface FileOperation {
  /** 操作 ID */
  id: string
  /** 时间戳 */
  timestamp: number
  /** 操作类型 */
  type: "create" | "modify" | "delete"
  /** 文件路径 */
  filePath: string
  /** 操作前内容（modify/delete 时存在） */
  previousContent?: string
  /** 操作后内容（create/modify 时存在） */
  newContent?: string
  /** 工具名称 */
  toolName: string
  /** 会话 ID */
  sessionId: string
}

/**
 * 撤销结果
 */
interface UndoResult {
  /** 是否成功 */
  success: boolean
  /** 撤销的操作 */
  operation?: FileOperation
  /** 错误信息 */
  error?: string
}

/**
 * 操作历史管理器
 */
interface OperationHistory {
  /** 记录操作 */
  record(operation: Omit<FileOperation, "id" | "timestamp">): FileOperation

  /** 获取最近的操作 */
  getRecent(count?: number): FileOperation[]

  /** 获取指定文件的操作历史 */
  getByFile(filePath: string): FileOperation[]

  /** 获取指定会话的操作历史 */
  getBySession(sessionId: string): FileOperation[]

  /** 撤销最近一次操作 */
  undoLast(): Promise<UndoResult>

  /** 撤销指定操作 */
  undo(operationId: string): Promise<UndoResult>

  /** 清空历史 */
  clear(): void

  /** 历史记录数量 */
  readonly count: number
}

/**
 * 历史配置
 */
interface HistoryConfig {
  /** 最大记录数 */
  maxOperations?: number
  /** 是否持久化 */
  persist?: boolean
  /** 存储路径 */
  storagePath?: string
}
```

### 2.2 Contracts

#### record

**前置条件**:
1. `filePath` 必须非空
2. `type` 必须有效
3. `toolName` 必须非空

**后置条件**:
1. 返回完整的 `FileOperation`（包含生成的 id 和 timestamp）
2. 操作被添加到历史记录
3. 如果超过 `maxOperations`，删除最旧的记录

#### undoLast

**前置条件**:
1. 历史记录非空

**后置条件**:
1. 文件恢复到操作前状态：
   - "create" → 删除文件
   - "modify" → 恢复 previousContent
   - "delete" → 重新创建文件
2. 操作从历史中移除
3. 返回撤销结果

#### undo(operationId)

**前置条件**:
1. `operationId` 对应的操作存在

**后置条件**:
1. 同 `undoLast`
2. 只撤销指定操作，不影响其他操作

### 2.3 错误处理

| 场景 | 处理 |
|------|------|
| 历史为空 | 返回 `{ success: false, error: "No operations to undo" }` |
| 操作不存在 | 返回 `{ success: false, error: "Operation not found" }` |
| 文件已被外部修改 | 返回 `{ success: false, error: "File has been modified externally" }` |
| 文件系统错误 | 返回 `{ success: false, error: "..." }` |

### 2.4 集成方式

```typescript
// 在 write/edit 工具执行时记录
const operation = history.record({
  type: existed ? "modify" : "create",
  filePath,
  previousContent: existed ? oldContent : undefined,
  newContent: content,
  toolName: "write",
  sessionId,
})

// CLI 提供撤销命令
// naughtagent --undo
const result = await history.undoLast()
```

---

## 3. 流式输出

### 3.1 Types

```typescript
/**
 * 输出样式
 */
interface OutputStyle {
  /** 文本颜色 */
  color?: "red" | "green" | "yellow" | "blue" | "cyan" | "magenta" | "white" | "gray"
  /** 是否加粗 */
  bold?: boolean
  /** 是否斜体 */
  italic?: boolean
  /** 是否下划线 */
  underline?: boolean
  /** 是否暗淡 */
  dim?: boolean
}

/**
 * 输出片段
 */
interface OutputChunk {
  /** 内容 */
  content: string
  /** 样式 */
  style?: OutputStyle
  /** 是否换行 */
  newline?: boolean
}

/**
 * 流式输出器
 */
interface StreamOutput {
  /** 写入文本 */
  write(content: string, style?: OutputStyle): void

  /** 写入一行 */
  writeLine(content: string, style?: OutputStyle): void

  /** 写入 diff（带颜色） */
  writeDiff(diff: string): void

  /** 写入进度指示器 */
  writeProgress(message: string): void

  /** 清除当前行 */
  clearLine(): void

  /** 写入工具调用开始 */
  writeToolStart(name: string, input: unknown): void

  /** 写入工具调用结束 */
  writeToolEnd(name: string, output: string, isError?: boolean): void

  /** 写入思考过程（可折叠） */
  writeThinking(content: string): void
}
```

### 3.2 输出格式规范

#### 文本输出
```
[Assistant 的回复文本，直接显示]
```

#### 工具调用
```
┌─ read src/index.ts
│  Reading file...
└─ ✓ 150 lines read

┌─ write src/new.ts
│  [diff preview]
│  --- /dev/null
│  +++ src/new.ts
│  @@ -0,0 +1,10 @@
│  +export function hello() {
│  +  return "world"
│  +}
└─ ✓ Created file (10 lines)

┌─ bash npm test
│  Running command...
│  > npm test
│  PASS src/index.test.ts
└─ ✓ Exit code: 0
```

#### 错误输出
```
┌─ write /etc/passwd
└─ ✗ Permission denied: Path is outside project directory
```

#### 权限确认
```
┌─ write src/config.ts
│  [diff preview]
│
│  Allow this operation? [y/N]
```

### 3.3 颜色规范

| 元素 | 颜色 |
|------|------|
| 工具名称 | cyan + bold |
| 成功标记 ✓ | green |
| 失败标记 ✗ | red |
| diff 添加行 (+) | green |
| diff 删除行 (-) | red |
| diff 上下文 | gray |
| 警告信息 | yellow |
| 文件路径 | blue |
| 命令 | magenta |

---

## 4. 实现优先级

1. **Diff 预览** - 最重要，直接影响用户对修改的理解
2. **撤销操作** - 重要，提供安全网
3. **流式输出** - 优化体验，可渐进增强

## 5. 文件结构

```
src/
├── ux/
│   ├── index.ts        # 导出
│   ├── diff.ts         # Diff 生成器
│   ├── history.ts      # 操作历史
│   └── output.ts       # 流式输出
```
