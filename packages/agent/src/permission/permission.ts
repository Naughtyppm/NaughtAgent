/**
 * Permission 权限系统
 *
 * 控制工具执行的权限，支持：
 * - allow: 直接允许
 * - deny: 直接拒绝
 * - ask: 需要用户确认
 */

import { minimatch } from "minimatch"

/**
 * 权限类型
 */
export type PermissionType = "read" | "write" | "edit" | "bash" | "glob" | "grep"

/**
 * 权限动作
 */
export type PermissionAction = "allow" | "deny" | "ask"

/**
 * 权限规则
 */
export interface PermissionRule {
  /** 权限类型 */
  type: PermissionType
  /** 动作 */
  action: PermissionAction
  /** 匹配模式（glob 语法） */
  pattern?: string
}

/**
 * 权限集合
 */
export interface PermissionSet {
  /** 规则列表（按顺序匹配） */
  rules: PermissionRule[]
  /** 默认动作 */
  default: PermissionAction
}

/**
 * 权限检查请求
 */
export interface PermissionRequest {
  /** 权限类型 */
  type: PermissionType
  /** 资源（文件路径或命令） */
  resource: string
  /** 描述（用于展示） */
  description?: string
}

/**
 * 权限检查结果
 */
export interface PermissionResult {
  /** 是否允许 */
  allowed: boolean
  /** 动作 */
  action: PermissionAction
  /** 匹配的规则 */
  matchedRule?: PermissionRule
  /** 是否需要确认 */
  needsConfirmation: boolean
}

/**
 * 用户确认回调
 */
export type ConfirmCallback = (request: PermissionRequest) => Promise<boolean>

/**
 * 检查权限
 */
export function checkPermission(
  request: PermissionRequest,
  permissions: PermissionSet
): PermissionResult {
  // 遍历规则，找到第一个匹配的
  for (const rule of permissions.rules) {
    if (rule.type !== request.type) {
      continue
    }

    // 如果有 pattern，检查是否匹配
    if (rule.pattern) {
      if (!matchPattern(rule.pattern, request.resource)) {
        continue
      }
    }

    // 找到匹配的规则
    return {
      allowed: rule.action === "allow",
      action: rule.action,
      matchedRule: rule,
      needsConfirmation: rule.action === "ask",
    }
  }

  // 没有匹配的规则，使用默认动作
  return {
    allowed: permissions.default === "allow",
    action: permissions.default,
    needsConfirmation: permissions.default === "ask",
  }
}

/**
 * 执行权限检查（包含用户确认）
 */
export async function enforcePermission(
  request: PermissionRequest,
  permissions: PermissionSet,
  onConfirm: ConfirmCallback
): Promise<boolean> {
  const result = checkPermission(request, permissions)

  if (result.action === "allow") {
    return true
  }

  if (result.action === "deny") {
    return false
  }

  // action === "ask"，需要用户确认
  return onConfirm(request)
}

/**
 * 匹配模式
 */
function matchPattern(pattern: string, resource: string): boolean {
  // 使用 minimatch 进行 glob 匹配
  return minimatch(resource, pattern, { dot: true })
}

/**
 * 创建默认权限集合
 */
export function createDefaultPermissions(mode: "build" | "plan" | "explore"): PermissionSet {
  switch (mode) {
    case "build":
      return {
        rules: [
          // 敏感文件需确认
          { type: "read", action: "ask", pattern: "**/.env*" },
          { type: "read", action: "ask", pattern: "**/*secret*" },
          { type: "read", action: "ask", pattern: "**/*credential*" },
          // 写操作需确认
          { type: "write", action: "ask" },
          { type: "edit", action: "ask" },
          // 危险命令拒绝
          { type: "bash", action: "deny", pattern: "rm -rf *" },
          { type: "bash", action: "deny", pattern: "rm -rf /*" },
          { type: "bash", action: "deny", pattern: "sudo *" },
          // 其他命令需确认
          { type: "bash", action: "ask" },
          // 读取和搜索默认允许
          { type: "read", action: "allow" },
          { type: "glob", action: "allow" },
          { type: "grep", action: "allow" },
        ],
        default: "ask",
      }

    case "plan":
      return {
        rules: [
          { type: "read", action: "allow" },
          { type: "glob", action: "allow" },
          { type: "grep", action: "allow" },
          { type: "write", action: "deny" },
          { type: "edit", action: "deny" },
          { type: "bash", action: "deny" },
        ],
        default: "deny",
      }

    case "explore":
      return {
        rules: [
          { type: "read", action: "allow" },
          { type: "glob", action: "allow" },
          { type: "grep", action: "allow" },
        ],
        default: "deny",
      }
  }
}

/**
 * 合并权限集合
 */
export function mergePermissions(
  base: PermissionSet,
  override: Partial<PermissionSet>
): PermissionSet {
  return {
    rules: [...(override.rules || []), ...base.rules],
    default: override.default || base.default,
  }
}
