/**
 * 路径安全工具
 *
 * 统一的路径解析。
 */

import * as path from "path"

/**
 * 安全解析路径（宽松模式）
 *
 * 只做 resolve，不做沙箱检查。
 * 用于 LLM 可能需要访问 cwd 外文件的场景（如 /etc/hosts、全局配置等）。
 */
export function resolvePath(userPath: string, cwd: string): string {
  return path.isAbsolute(userPath)
    ? path.resolve(userPath)
    : path.resolve(cwd, userPath)
}
