/**
 * 路径安全工具
 *
 * 统一的路径解析和沙箱检查，防止路径逃逸。
 * 对应教程 s02 的 safe_path() 函数。
 */

import * as path from "path"

/**
 * 安全解析路径
 *
 * 1. 相对路径 → resolve(cwd, userPath)
 * 2. 绝对路径 → 直接使用
 * 3. 检查结果是否在 cwd（或其子目录）内
 *
 * 如果路径逃逸 cwd，抛出错误。
 *
 * @param userPath 用户提供的路径
 * @param cwd 工作目录（沙箱根目录）
 * @param opts 选项
 * @returns 解析后的绝对路径
 */
export function safePath(
  userPath: string,
  cwd: string,
  opts?: { allowEscape?: boolean },
): string {
  const resolved = path.isAbsolute(userPath)
    ? path.resolve(userPath)    // normalize（去掉 ../ 等）
    : path.resolve(cwd, userPath)

  // 沙箱检查：resolved 必须以 cwd 开头
  if (!opts?.allowEscape) {
    const normalizedCwd = path.resolve(cwd)
    const normalizedResolved = path.resolve(resolved)
    if (!normalizedResolved.startsWith(normalizedCwd + path.sep) && normalizedResolved !== normalizedCwd) {
      throw new Error(
        `Path escapes working directory.\n  Path: ${userPath}\n  Resolved: ${resolved}\n  CWD: ${cwd}`
      )
    }
  }

  return resolved
}

/**
 * 判断给定路径是否在 cwd 内（含 cwd 自身）
 *
 * 使用 path.resolve 标准化路径后比较前缀。
 * 与 safePath 不同，不抛异常，仅返回 boolean。
 *
 * @param targetPath 待检查的路径（绝对或相对）
 * @param cwd 工作目录（沙箱根目录）
 * @returns 路径在 cwd 内返回 true，否则 false
 */
export function isWithinCwd(targetPath: string, cwd: string): boolean {
  const normalizedCwd = path.resolve(cwd)
  const resolved = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(cwd, targetPath)

  return resolved === normalizedCwd || resolved.startsWith(normalizedCwd + path.sep)
}

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
