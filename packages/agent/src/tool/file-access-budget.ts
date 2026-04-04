/**
 * 全局文件访问预算
 *
 * 统一计量来自 read/grep/bash 的文件内容获取，
 * 不管 LLM 从哪个工具绕，都受同一套预算控制。
 *
 * CC 没有这个机制——这是 NA 的独创防护层。
 */

import * as path from "path"

// ─── 配置 ────────────────────────────────────────────

/** 同一文件最大访问次数（跨所有工具累计） */
const MAX_FILE_ACCESSES = 50

/** 访问被耗尽后返回的 stub（告诉 LLM 不要再读了） */
const BUDGET_EXHAUSTED_STUB =
  'File access budget exhausted. This file has been read too many times across different tools. ' +
  'The content was already returned — refer to previous tool results. ' +
  'Do NOT attempt to read this file again via ANY tool (read, grep, bash, etc.).'

// ─── 路径归一化 ──────────────────────────────────────

/**
 * 归一化路径，解决 Windows 大小写不敏感问题
 * D:\Dir\File.ts 和 d:\dir\file.ts 应该视为同一文件
 */
function normalizePath(filePath: string): string {
  const resolved = path.resolve(filePath)
  // Windows 下统一小写（NTFS 大小写不敏感）
  if (process.platform === "win32") {
    return resolved.toLowerCase()
  }
  return resolved
}

// ─── 状态 ────────────────────────────────────────────

interface AccessEntry {
  count: number
  /** 来源记录（调试用） */
  sources: string[]
}

const accessMap = new Map<string, AccessEntry>()

// ─── API ─────────────────────────────────────────────

/**
 * 记录一次文件访问并检查是否超预算
 *
 * @param filePath 文件绝对路径
 * @param source 来源工具名（"read" / "grep" / "bash"）
 * @returns null 表示在预算内可继续；string 表示超预算的 stub 消息
 */
export function checkFileAccessBudget(filePath: string, source: string): string | null {
  const key = normalizePath(filePath)
  const entry = accessMap.get(key)
  if (!entry) {
    accessMap.set(key, { count: 1, sources: [source] })
    return null
  }

  entry.count++
  entry.sources.push(source)

  if (entry.count > MAX_FILE_ACCESSES) {
    return `${BUDGET_EXHAUSTED_STUB}\n(File: ${filePath}, accessed ${entry.count} times via: ${[...new Set(entry.sources)].join(', ')})`
  }

  return null
}

/**
 * 获取文件当前访问次数（不计入预算，纯查询）
 */
export function getFileAccessCount(filePath: string): number {
  return accessMap.get(filePath)?.count ?? 0
}

/**
 * 重置文件访问预算（compact 后调用）
 *
 * 不完全清零——保留文件记录但 count 降低到 1，
 * 给 LLM compact 后一次重读机会，但不是无限机会。
 */
export function resetFileAccessBudget(): void {
  for (const entry of accessMap.values()) {
    entry.count = Math.min(entry.count, 1)
    entry.sources = []
  }
}

/**
 * 完全清空文件访问预算（session 结束时调用）
 */
export function clearFileAccessBudget(): void {
  accessMap.clear()
}
