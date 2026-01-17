/**
 * 会话数据迁移示例
 *
 * 演示如何使用迁移工具将旧格式的会话数据迁移到新格式
 */

import {
  migrateAllSessions,
  migrateSingleSession,
  printMigrationResult,
} from "../src/session/migrate"

/**
 * 示例 1: 迁移所有会话
 */
async function example1_migrateAll() {
  console.log("=== 示例 1: 迁移所有会话 ===\n")

  const result = await migrateAllSessions({
    baseDir: process.cwd(),
    backup: true, // 创建备份
    verbose: true, // 详细输出
  })

  printMigrationResult(result)
}

/**
 * 示例 2: 迁移单个会话
 */
async function example2_migrateSingle() {
  console.log("\n=== 示例 2: 迁移单个会话 ===\n")

  const sessionId = "session_1234567890_abc123"

  try {
    await migrateSingleSession(sessionId, process.cwd(), {
      backup: true,
      force: false,
    })
    console.log(`✅ 会话 ${sessionId} 迁移成功`)
  } catch (error) {
    console.error(`❌ 迁移失败:`, error)
  }
}

/**
 * 示例 3: 强制迁移（重新计算字段）
 */
async function example3_forceMigrate() {
  console.log("\n=== 示例 3: 强制迁移 ===\n")

  const result = await migrateAllSessions({
    baseDir: process.cwd(),
    backup: true,
    force: true, // 强制迁移，重新计算 num_turns
    verbose: true,
  })

  printMigrationResult(result)
}

/**
 * 示例 4: 不备份的快速迁移
 */
async function example4_noBackup() {
  console.log("\n=== 示例 4: 不备份的快速迁移 ===\n")

  const result = await migrateAllSessions({
    baseDir: process.cwd(),
    backup: false, // 不创建备份（更快）
    verbose: false,
  })

  console.log(`迁移完成: ${result.migrated}/${result.total} 个会话`)
}

/**
 * 示例 5: 检查迁移结果
 */
async function example5_checkResult() {
  console.log("\n=== 示例 5: 检查迁移结果 ===\n")

  const result = await migrateAllSessions({
    baseDir: process.cwd(),
    backup: false,
    verbose: false,
  })

  if (result.failed > 0) {
    console.log("⚠️ 部分会话迁移失败:")
    for (const { sessionId, error } of result.errors) {
      console.log(`  - ${sessionId}: ${error}`)
    }
  } else if (result.migrated === 0 && result.skipped === result.total) {
    console.log("✅ 所有会话已是新格式，无需迁移")
  } else {
    console.log(`✅ 成功迁移 ${result.migrated} 个会话`)
  }
}

/**
 * 主函数
 */
async function main() {
  console.log("会话数据迁移示例\n")

  // 运行示例（根据需要取消注释）
  // await example1_migrateAll()
  // await example2_migrateSingle()
  // await example3_forceMigrate()
  // await example4_noBackup()
  await example5_checkResult()
}

// 运行示例
main().catch(console.error)

/**
 * 使用说明：
 *
 * 1. 基本迁移（推荐）：
 *    - 自动检测需要迁移的会话
 *    - 创建备份以防万一
 *    - 只迁移缺少新字段的会话
 *
 * 2. 强制迁移：
 *    - 重新计算所有字段（如 num_turns）
 *    - 适用于数据修复场景
 *    - 建议先备份
 *
 * 3. 快速迁移：
 *    - 不创建备份，速度更快
 *    - 适用于测试环境或确定数据安全时
 *
 * 4. 单会话迁移：
 *    - 只迁移指定的会话
 *    - 适用于增量迁移或修复特定会话
 *
 * 迁移后的数据格式：
 * - tags: string[] - 会话标签（默认为空数组）
 * - total_cost_usd: number - 总成本（默认为 0）
 * - num_turns: number - 对话轮次（从消息数量计算）
 * - parent_session_id?: string - 父会话 ID（仅分支会话）
 * - branch_point?: number - 分支点（仅分支会话）
 *
 * 备份位置：
 * - 原会话目录：.naught/sessions/{sessionId}/
 * - 备份目录：.naught/sessions/{sessionId}.backup/
 *
 * 注意事项：
 * 1. 迁移前建议先备份整个 .naught 目录
 * 2. 迁移是幂等的，可以安全地多次运行
 * 3. 备份会占用额外的磁盘空间
 * 4. 强制迁移会覆盖现有的 num_turns 值
 */
