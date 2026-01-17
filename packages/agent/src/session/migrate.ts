/**
 * 会话数据迁移工具
 *
 * 用于将旧格式的会话数据迁移到新格式
 */

import * as fs from "fs/promises"
import * as path from "path"
import type { Session } from "./session"
import { loadSession, saveSession, listSavedSessions } from "./storage"

/**
 * 迁移选项
 */
export interface MigrationOptions {
  /** 基础目录 */
  baseDir: string
  /** 是否备份原始数据 */
  backup?: boolean
  /** 是否强制迁移（即使已有新字段） */
  force?: boolean
  /** 是否详细输出 */
  verbose?: boolean
}

/**
 * 迁移结果
 */
export interface MigrationResult {
  /** 总会话数 */
  total: number
  /** 成功迁移数 */
  migrated: number
  /** 跳过数（已是新格式） */
  skipped: number
  /** 失败数 */
  failed: number
  /** 错误列表 */
  errors: Array<{ sessionId: string; error: string }>
}

/**
 * 检查会话是否需要迁移
 */
function needsMigration(session: Session, force: boolean): boolean {
  if (force) return true

  // 检查是否缺少新字段
  return (
    session.tags === undefined ||
    session.total_cost_usd === undefined ||
    session.num_turns === undefined
  )
}

/**
 * 迁移单个会话
 */
function migrateSession(session: Session, force: boolean = false): Session {
  return {
    ...session,
    // 添加默认值（如果字段不存在）
    tags: session.tags ?? [],
    total_cost_usd: session.total_cost_usd ?? 0,
    // 强制模式下重新计算 num_turns，否则使用现有值或计算默认值
    num_turns: force 
      ? Math.floor(session.messages.length / 2)
      : (session.num_turns ?? Math.floor(session.messages.length / 2)),
    // parent_session_id 和 branch_point 保持 undefined（只有分支会话才有）
  }
}

/**
 * 备份会话数据
 */
async function backupSession(
  sessionId: string,
  baseDir: string
): Promise<void> {
  const sessionDir = path.join(baseDir, ".naught", "sessions", sessionId)
  const backupDir = path.join(baseDir, ".naught", "sessions", `${sessionId}.backup`)

  // 复制整个会话目录
  await fs.cp(sessionDir, backupDir, { recursive: true })
}

/**
 * 迁移所有会话
 */
export async function migrateAllSessions(
  options: MigrationOptions
): Promise<MigrationResult> {
  const { baseDir, backup = true, force = false, verbose = false } = options

  const result: MigrationResult = {
    total: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }

  try {
    // 获取所有会话 ID
    const sessionIds = await listSavedSessions(baseDir)
    result.total = sessionIds.length

    if (verbose) {
      console.log(`找到 ${sessionIds.length} 个会话`)
    }

    // 逐个迁移
    for (const sessionId of sessionIds) {
      try {
        // 加载会话
        const session = await loadSession(sessionId, baseDir)

        // 检查是否需要迁移
        if (!needsMigration(session, force)) {
          result.skipped++
          if (verbose) {
            console.log(`跳过 ${sessionId}（已是新格式）`)
          }
          continue
        }

        // 备份（如果需要）
        if (backup) {
          await backupSession(sessionId, baseDir)
          if (verbose) {
            console.log(`备份 ${sessionId}`)
          }
        }

        // 迁移
        const migrated = migrateSession(session, force)

        // 保存
        await saveSession(migrated, baseDir)

        result.migrated++
        if (verbose) {
          console.log(`迁移 ${sessionId} 成功`)
        }
      } catch (error) {
        result.failed++
        result.errors.push({
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        })
        if (verbose) {
          console.error(`迁移 ${sessionId} 失败:`, error)
        }
      }
    }
  } catch (error) {
    throw new Error(
      `迁移失败: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  return result
}

/**
 * 迁移单个会话（公开 API）
 */
export async function migrateSingleSession(
  sessionId: string,
  baseDir: string,
  options: { backup?: boolean; force?: boolean } = {}
): Promise<void> {
  const { backup = true, force = false } = options

  // 加载会话
  const session = await loadSession(sessionId, baseDir)

  // 检查是否需要迁移
  if (!needsMigration(session, force)) {
    return // 无需迁移
  }

  // 备份（如果需要）
  if (backup) {
    await backupSession(sessionId, baseDir)
  }

  // 迁移并保存
  const migrated = migrateSession(session, force)
  await saveSession(migrated, baseDir)
}

/**
 * 打印迁移结果
 */
export function printMigrationResult(result: MigrationResult): void {
  console.log("\n=== 迁移结果 ===")
  console.log(`总会话数: ${result.total}`)
  console.log(`成功迁移: ${result.migrated}`)
  console.log(`跳过: ${result.skipped}`)
  console.log(`失败: ${result.failed}`)

  if (result.errors.length > 0) {
    console.log("\n失败详情:")
    for (const { sessionId, error } of result.errors) {
      console.log(`  - ${sessionId}: ${error}`)
    }
  }

  console.log("\n迁移完成！")
}
