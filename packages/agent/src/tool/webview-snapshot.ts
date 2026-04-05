/**
 * webview_snapshot 工具 - 捕获 Webview 当前状态
 *
 * 让 Agent 能"看到" Webview 的当前 DOM 状态和元素样式。
 * 支持基线对比：修改前存 baseline，修改后自动 diff。
 * 用于自我迭代：修改前端代码后验证渲染效果。
 */

import { z } from "zod"
import { Tool } from "./tool"

// 全局快照请求器注册表（由 websocket handler 注册）
const snapshotRequestors = new Map<string, () => Promise<Record<string, unknown>>>()

// 基线快照存储（per session）
const baselineSnapshots = new Map<string, Record<string, unknown>>()

/**
 * 注册快照请求器（由 WS handler 在连接建立时调用）
 */
export function registerSnapshotRequestor(sessionId: string, requestor: () => Promise<Record<string, unknown>>): void {
  snapshotRequestors.set(sessionId, requestor)
}

/**
 * 注销快照请求器
 */
export function unregisterSnapshotRequestor(sessionId: string): void {
  snapshotRequestors.delete(sessionId)
  baselineSnapshots.delete(sessionId)
}

type ElementInfo = { visible: boolean; width: number; height: number; bg: string; color: string }

/**
 * 对比两个快照的元素差异
 */
function diffElements(
  baseline: Record<string, ElementInfo | null>,
  current: Record<string, ElementInfo | null>
): string[] {
  const diffs: string[] = []
  const allKeys = new Set([...Object.keys(baseline), ...Object.keys(current)])
  for (const key of allKeys) {
    const b = baseline[key]
    const c = current[key]
    if (!b && c) {
      diffs.push(`🆕 ${key}: appeared (${c.width}x${c.height})`)
    } else if (b && !c) {
      diffs.push(`❌ ${key}: DISAPPEARED`)
    } else if (b && c) {
      const changes: string[] = []
      if (b.visible !== c.visible) changes.push(`visible: ${b.visible} → ${c.visible}`)
      if (b.width !== c.width) changes.push(`width: ${b.width} → ${c.width}`)
      if (b.height !== c.height) changes.push(`height: ${b.height} → ${c.height}`)
      if (b.bg !== c.bg) changes.push(`bg: ${b.bg} → ${c.bg}`)
      if (b.color !== c.color) changes.push(`color: ${b.color} → ${c.color}`)
      if (changes.length > 0) {
        diffs.push(`🔄 ${key}: ${changes.join(', ')}`)
      }
    }
  }
  return diffs
}

const DESCRIPTION = `Capture the current state of the Webview UI for visual analysis and comparison.

Three modes:
- **default**: Capture current snapshot
- **save_baseline**: Capture and save as baseline for later comparison
- **compare**: Capture current state and diff against saved baseline

Returns DOM snapshot including:
- Recent message content
- Element visibility and computed styles (background, color, dimensions)
- Current UI state (pending, runStatus, usage)

Recommended workflow:
1. Before making UI changes: \`webview_snapshot(mode="save_baseline")\`
2. Make your changes and reload
3. After changes: \`webview_snapshot(mode="compare")\` — see exactly what changed`

export const WebviewSnapshotTool = Tool.define({
  id: "webview_snapshot",
  description: DESCRIPTION,
  isConcurrencySafe: true,
  isReadOnly: true,

  parameters: z.object({
    reason: z.string().optional().describe("Why you're capturing the snapshot (for logging)"),
    mode: z.enum(["default", "save_baseline", "compare"]).optional().default("default")
      .describe("default: just capture; save_baseline: capture and save as baseline; compare: capture and diff against baseline"),
  }),

  async execute(params, ctx) {
    // 找到当前 session 的快照请求器
    const sessionId = ctx.sessionID || "default"
    let requestor: (() => Promise<Record<string, unknown>>) | undefined
    requestor = snapshotRequestors.get(sessionId)
    // 如果当前 session 找不到，用第一个可用的
    if (!requestor && snapshotRequestors.size > 0) {
      requestor = snapshotRequestors.values().next().value
    }

    if (!requestor) {
      return {
        title: "Webview Snapshot",
        output: "No Webview connected. The snapshot tool requires an active VSCode Webview connection.",
        isError: true,
      }
    }

    try {
      const snapshot = await requestor()

      if (snapshot.error) {
        return {
          title: "Webview Snapshot",
          output: `Snapshot failed: ${snapshot.error}`,
          isError: true,
        }
      }

      const mode = params.mode || "default"

      // 保存基线
      if (mode === "save_baseline") {
        baselineSnapshots.set(sessionId, JSON.parse(JSON.stringify(snapshot)))
      }

      // 格式化输出
      const lines: string[] = []
      lines.push(`=== Webview Snapshot (${mode}) ===`)
      if (params.reason) lines.push(`Reason: ${params.reason}`)

      lines.push(`\n--- UI State ---`)
      lines.push(`Message count: ${snapshot.messageCount}`)
      lines.push(`Pending: ${snapshot.pending}`)
      lines.push(`Run status: ${snapshot.runStatus}`)
      if (snapshot.usage) {
        const u = snapshot.usage as Record<string, number>
        lines.push(`Usage: ↑${u.totalInput || 0} ↓${u.totalOutput || 0} · ${u.requestCount || 0} requests`)
      }

      if (snapshot.elements) {
        lines.push(`\n--- Element Status ---`)
        const elements = snapshot.elements as Record<string, ElementInfo | null>
        for (const [name, el] of Object.entries(elements)) {
          if (el) {
            lines.push(`${name}: ${el.visible ? '✅ visible' : '❌ hidden'} ${el.width}x${el.height} bg=${el.bg} color=${el.color}`)
          } else {
            lines.push(`${name}: ❌ NOT FOUND in DOM`)
          }
        }
      }

      // 基线对比
      if (mode === "compare") {
        const baseline = baselineSnapshots.get(sessionId)
        if (!baseline) {
          lines.push(`\n⚠️ No baseline saved. Use mode="save_baseline" first.`)
        } else {
          lines.push(`\n--- Diff vs Baseline ---`)
          const baseElements = (baseline.elements || {}) as Record<string, ElementInfo | null>
          const curElements = (snapshot.elements || {}) as Record<string, ElementInfo | null>
          const diffs = diffElements(baseElements, curElements)
          if (diffs.length === 0) {
            lines.push(`✅ No element changes detected`)
          } else {
            lines.push(`Found ${diffs.length} change(s):`)
            for (const d of diffs) lines.push(`  ${d}`)
          }
          // 消息数量差异
          const bMsgCount = baseline.messageCount as number || 0
          const cMsgCount = snapshot.messageCount as number || 0
          if (bMsgCount !== cMsgCount) {
            lines.push(`📝 Message count: ${bMsgCount} → ${cMsgCount}`)
          }
        }
      }

      if (mode === "save_baseline") {
        lines.push(`\n✅ Baseline saved. Use mode="compare" after making changes.`)
      }

      if (snapshot.recentMessages) {
        lines.push(`\n--- Recent Messages ---`)
        const msgs = snapshot.recentMessages as Array<{ role: string; kind: string; content: string }>
        for (const msg of msgs) {
          const kind = msg.kind ? ` [${msg.kind}]` : ''
          lines.push(`[${msg.role}${kind}] ${msg.content}`)
        }
      }

      if (snapshot.html) {
        lines.push(`\n--- DOM Preview (first 3000 chars) ---`)
        lines.push(String(snapshot.html).substring(0, 3000))
      }

      return {
        title: "Webview Snapshot",
        output: lines.join('\n'),
      }
    } catch (err) {
      return {
        title: "Webview Snapshot",
        output: `Snapshot error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }
  },
})
