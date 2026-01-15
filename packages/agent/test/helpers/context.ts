import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { Tool } from '../../src/tool/tool'

/**
 * 测试辅助函数
 */

/**
 * 创建测试用的临时目录
 */
export async function createTempDir(prefix = 'naughtagent-test-'): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  return tempDir
}

/**
 * 清理临时目录
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true })
  } catch {
    // 忽略清理错误
  }
}

/**
 * 创建测试文件
 */
export async function createTestFile(
  dir: string,
  filename: string,
  content: string
): Promise<string> {
  const filePath = path.join(dir, filename)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
  return filePath
}

/**
 * 读取测试文件
 */
export async function readTestFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
}

/**
 * 创建测试用的 Tool.Context
 */
export function createTestContext(options: Partial<Tool.Context> = {}): Tool.Context {
  const controller = new AbortController()
  return {
    sessionID: options.sessionID ?? 'test-session',
    cwd: options.cwd ?? process.cwd(),
    abort: options.abort ?? controller.signal,
  }
}

/**
 * 创建带临时目录的测试上下文
 */
export async function createTestContextWithTempDir(): Promise<{
  ctx: Tool.Context
  tempDir: string
  cleanup: () => Promise<void>
}> {
  const tempDir = await createTempDir()
  const ctx = createTestContext({ cwd: tempDir })
  return {
    ctx,
    tempDir,
    cleanup: () => cleanupTempDir(tempDir),
  }
}

/**
 * 生成多行测试内容
 */
export function generateLines(count: number, prefix = 'Line'): string {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`).join('\n')
}

/**
 * 等待指定毫秒
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
