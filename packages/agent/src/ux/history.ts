/**
 * 操作历史管理器
 *
 * 负责：
 * - 记录文件操作历史
 * - 支持撤销操作
 * - 可选持久化存储
 */

import * as fs from "fs/promises"
import * as path from "path"
import { randomUUID } from "crypto"

// ============================================================================
// Types
// ============================================================================

/**
 * 文件操作记录
 */
export interface FileOperation {
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
export interface UndoResult {
  /** 是否成功 */
  success: boolean
  /** 撤销的操作 */
  operation?: FileOperation
  /** 错误信息 */
  error?: string
}

/**
 * 历史配置
 */
export interface HistoryConfig {
  /** 最大记录数 */
  maxOperations?: number
  /** 是否持久化 */
  persist?: boolean
  /** 存储路径 */
  storagePath?: string
}

/**
 * 操作历史管理器接口
 */
export interface OperationHistory {
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

  /** 保存到磁盘（如果启用持久化） */
  save(): Promise<void>

  /** 从磁盘加载（如果启用持久化） */
  load(): Promise<void>
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * 创建操作历史管理器
 */
export function createOperationHistory(config: HistoryConfig = {}): OperationHistory {
  const { maxOperations = 100, persist = false, storagePath } = config

  // 操作历史栈
  let operations: FileOperation[] = []

  /**
   * 记录操作
   */
  function record(operation: Omit<FileOperation, "id" | "timestamp">): FileOperation {
    const fullOperation: FileOperation = {
      ...operation,
      id: randomUUID(),
      timestamp: Date.now(),
    }

    operations.push(fullOperation)

    // 限制最大记录数
    if (operations.length > maxOperations) {
      operations = operations.slice(-maxOperations)
    }

    return fullOperation
  }

  /**
   * 获取最近的操作
   */
  function getRecent(count: number = 10): FileOperation[] {
    return operations.slice(-count).reverse()
  }

  /**
   * 获取指定文件的操作历史
   */
  function getByFile(filePath: string): FileOperation[] {
    const normalized = path.normalize(filePath)
    return operations
      .filter((op) => path.normalize(op.filePath) === normalized)
      .reverse()
  }

  /**
   * 获取指定会话的操作历史
   */
  function getBySession(sessionId: string): FileOperation[] {
    return operations.filter((op) => op.sessionId === sessionId).reverse()
  }

  /**
   * 执行撤销
   */
  async function performUndo(operation: FileOperation): Promise<UndoResult> {
    try {
      const { type, filePath, previousContent } = operation

      switch (type) {
        case "create":
          // 撤销创建 = 删除文件
          try {
            await fs.unlink(filePath)
          } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
              throw err
            }
            // 文件已不存在，视为成功
          }
          break

        case "modify":
          // 撤销修改 = 恢复原内容
          if (previousContent === undefined) {
            return {
              success: false,
              error: "Cannot undo: previous content not recorded",
            }
          }

          // 检查文件是否被外部修改
          try {
            const currentContent = await fs.readFile(filePath, "utf-8")
            if (currentContent !== operation.newContent) {
              return {
                success: false,
                error: "File has been modified externally since the operation",
              }
            }
          } catch {
            return {
              success: false,
              error: "Cannot read file to verify content",
            }
          }

          await fs.writeFile(filePath, previousContent, "utf-8")
          break

        case "delete":
          // 撤销删除 = 重新创建文件
          if (previousContent === undefined) {
            return {
              success: false,
              error: "Cannot undo: previous content not recorded",
            }
          }

          // 确保目录存在
          const dir = path.dirname(filePath)
          await fs.mkdir(dir, { recursive: true })

          // 检查文件是否已存在
          try {
            await fs.access(filePath)
            return {
              success: false,
              error: "Cannot undo delete: file already exists",
            }
          } catch {
            // 文件不存在，可以创建
          }

          await fs.writeFile(filePath, previousContent, "utf-8")
          break
      }

      return { success: true, operation }
    } catch (err: unknown) {
      return {
        success: false,
        error: `Undo failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  /**
   * 撤销最近一次操作
   */
  async function undoLast(): Promise<UndoResult> {
    if (operations.length === 0) {
      return { success: false, error: "No operations to undo" }
    }

    const operation = operations.pop()!
    const result = await performUndo(operation)

    // 如果撤销失败，把操作放回去
    if (!result.success) {
      operations.push(operation)
    }

    return result
  }

  /**
   * 撤销指定操作
   */
  async function undo(operationId: string): Promise<UndoResult> {
    const index = operations.findIndex((op) => op.id === operationId)
    if (index === -1) {
      return { success: false, error: "Operation not found" }
    }

    const operation = operations[index]
    const result = await performUndo(operation)

    // 如果撤销成功，从历史中移除
    if (result.success) {
      operations.splice(index, 1)
    }

    return result
  }

  /**
   * 清空历史
   */
  function clear(): void {
    operations = []
  }

  /**
   * 保存到磁盘
   */
  async function save(): Promise<void> {
    if (!persist || !storagePath) {
      return
    }

    const dir = path.dirname(storagePath)
    await fs.mkdir(dir, { recursive: true })

    const data = JSON.stringify(operations, null, 2)
    await fs.writeFile(storagePath, data, "utf-8")
  }

  /**
   * 从磁盘加载
   */
  async function load(): Promise<void> {
    if (!persist || !storagePath) {
      return
    }

    try {
      const data = await fs.readFile(storagePath, "utf-8")
      operations = JSON.parse(data)
    } catch {
      // 文件不存在或解析失败，使用空历史
      operations = []
    }
  }

  return {
    record,
    getRecent,
    getByFile,
    getBySession,
    undoLast,
    undo,
    clear,
    get count() {
      return operations.length
    },
    save,
    load,
  }
}

// ============================================================================
// Global History Instance
// ============================================================================

let globalHistory: OperationHistory | null = null

/**
 * 获取全局操作历史实例
 */
export function getGlobalHistory(config?: HistoryConfig): OperationHistory {
  if (!globalHistory) {
    globalHistory = createOperationHistory(config)
  }
  return globalHistory
}

/**
 * 重置全局操作历史
 */
export function resetGlobalHistory(): void {
  globalHistory = null
}
