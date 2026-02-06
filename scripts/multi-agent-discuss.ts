#!/usr/bin/env npx tsx
/**
 * 多角色讨论脚本 v2 - 支持 handoff 机制
 *
 * 三种讨论模式：
 * - round-robin: 固定轮转（默认）
 * - handoff: 角色自主决定下一个发言者
 * - moderated: 主持人（第一个角色）协调讨论
 *
 * 用法：
 *   npx tsx scripts/multi-agent-discuss.ts --config discuss-config.json
 *   npx tsx scripts/multi-agent-discuss.ts --topic "主题" --mode handoff
 */

import * as fs from "fs"
import * as path from "path"

// ============================================================================
// 配置
// ============================================================================

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080/v1"
const API_KEY = process.env.API_KEY || "sk-placeholder"
const MODEL = process.env.MODEL || "claude-sonnet-4-20250514"
const MAX_ROUNDS = parseInt(process.env.MAX_ROUNDS || "3")

// ============================================================================
// 类型定义
// ============================================================================

interface AgentRole {
  name: string
  role: string
}

interface DiscussionMessage {
  agent: string
  role: string
  content: string
  /** 发言序号（不再是"轮"的概念） */
  turn: number
  /** 该角色指定的下一个发言者 */
  nextSpeaker?: string
}

/** 讨论模式 */
type DiscussMode = "round-robin" | "handoff" | "moderated"
