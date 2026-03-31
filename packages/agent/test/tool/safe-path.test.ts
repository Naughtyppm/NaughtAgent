import { describe, it, expect } from "vitest"
import { safePath, resolvePath, isWithinCwd } from "../../src/tool/safe-path"
import * as path from "path"

describe("safePath", () => {
  const cwd = path.resolve("/test/project")

  it("解析相对路径到 cwd", () => {
    const result = safePath("src/index.ts", cwd)
    expect(result).toBe(path.resolve(cwd, "src/index.ts"))
  })

  it("解析绝对路径（在 cwd 内）", () => {
    const innerPath = path.join(cwd, "src", "file.ts")
    const result = safePath(innerPath, cwd)
    expect(result).toBe(path.resolve(innerPath))
  })

  it("cwd 本身是合法路径", () => {
    const result = safePath(cwd, cwd)
    expect(result).toBe(path.resolve(cwd))
  })

  it("路径逃逸 → 抛出 Error", () => {
    expect(() => safePath("../../etc/passwd", cwd)).toThrow("Path escapes working directory")
  })

  it("绝对路径逃逸 → 抛出 Error", () => {
    expect(() => safePath("/other/dir/file.txt", cwd)).toThrow("Path escapes working directory")
  })

  it("allowEscape: true → 允许逃逸", () => {
    const result = safePath("../../etc/passwd", cwd, { allowEscape: true })
    expect(result).toBe(path.resolve(cwd, "../../etc/passwd"))
  })

  it("含 ../ 但仍在 cwd 内 → 通过", () => {
    const result = safePath("src/../lib/util.ts", cwd)
    expect(result).toBe(path.resolve(cwd, "lib/util.ts"))
  })

  it("空路径 → 返回 cwd 本身", () => {
    const result = safePath("", cwd)
    expect(result).toBe(path.resolve(cwd))
  })
})

describe("isWithinCwd", () => {
  const cwd = path.resolve("/test/project")

  it("相对路径在 cwd 内 → true", () => {
    expect(isWithinCwd("src/index.ts", cwd)).toBe(true)
  })

  it("cwd 本身 → true", () => {
    expect(isWithinCwd(cwd, cwd)).toBe(true)
  })

  it("绝对路径在 cwd 内 → true", () => {
    const innerPath = path.join(cwd, "src", "file.ts")
    expect(isWithinCwd(innerPath, cwd)).toBe(true)
  })

  it("含 ../ 但仍在 cwd 内 → true", () => {
    expect(isWithinCwd("src/../lib/util.ts", cwd)).toBe(true)
  })

  it("空路径（= cwd）→ true", () => {
    expect(isWithinCwd("", cwd)).toBe(true)
  })

  it("相对路径逃逸 → false", () => {
    expect(isWithinCwd("../../etc/passwd", cwd)).toBe(false)
  })

  it("绝对路径逃逸 → false", () => {
    expect(isWithinCwd("/other/dir/file.txt", cwd)).toBe(false)
  })

  it("cwd 前缀同名目录 → false", () => {
    // /test/project-extra 不应被视为 /test/project 的子目录
    const sneakyPath = cwd + "-extra/file.txt"
    expect(isWithinCwd(sneakyPath, cwd)).toBe(false)
  })

  it("Windows 盘符不同 → false", () => {
    // 即使路径结构相似，不同盘符应判定为逃逸
    const cwdOnC = "C:\\Users\\dev\\project"
    const pathOnD = "D:\\Users\\dev\\project\\src\\index.ts"
    expect(isWithinCwd(pathOnD, cwdOnC)).toBe(false)
  })
})

describe("resolvePath", () => {
  const cwd = path.resolve("/test/project")

  it("相对路径 → 拼接 cwd", () => {
    const result = resolvePath("src/index.ts", cwd)
    expect(result).toBe(path.resolve(cwd, "src/index.ts"))
  })

  it("绝对路径 → 直接 resolve", () => {
    const result = resolvePath("/other/dir/file.txt", cwd)
    expect(result).toBe(path.resolve("/other/dir/file.txt"))
  })

  it("不做沙箱检查 → 允许逃逸", () => {
    const result = resolvePath("../../etc/passwd", cwd)
    expect(result).toBe(path.resolve(cwd, "../../etc/passwd"))
  })

  it("含 ../ → normalize", () => {
    const result = resolvePath("src/../lib/util.ts", cwd)
    expect(result).toBe(path.resolve(cwd, "lib/util.ts"))
  })
})
