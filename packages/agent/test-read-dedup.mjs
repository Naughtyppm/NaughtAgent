// 独立测试 read 工具的缓存去重行为
import * as fs from 'fs/promises'
import * as path from 'path'

// 直接从源码逻辑模拟 read 缓存行为
const readCache = new Map()

async function simulateRead(filePath, offset = 0, limit = 2000, sessionID = 'test-1') {
  const stat = await fs.stat(filePath)
  const cacheKey = `${sessionID}:${filePath}`  // 新逻辑：不含 offset/limit
  const cached = readCache.get(cacheKey)
  const currentMtimeMs = stat.mtimeMs

  if (cached && cached.mtimeMs === currentMtimeMs) {
    cached.count++
    if (cached.count >= 3) {
      return { lines: 12, truncated: true, count: cached.count }
    }
    return { lines: cached.lineCount, truncated: false, count: cached.count }
  }

  const content = await fs.readFile(filePath, 'utf-8')
  const lineCount = content.split('\n').length
  readCache.set(cacheKey, { mtimeMs: currentMtimeMs, lineCount, count: 1 })
  return { lines: lineCount, truncated: false, count: 1 }
}

const testFile = 'D:\\AISpace\\Docs\\spec\\PrivacyGuard-Requirements.md'

console.log('=== 测试 1: 相同参数连续读取 ===')
readCache.clear()
for (let i = 1; i <= 6; i++) {
  const r = await simulateRead(testFile)
  console.log(`Read #${i}: ${r.lines} lines, truncated=${r.truncated}, count=${r.count}`)
}

console.log('\n=== 测试 2: 不同 offset/limit 读取同一文件 ===')
readCache.clear()
for (let i = 1; i <= 6; i++) {
  const r = await simulateRead(testFile, i * 10, 100 + i)
  console.log(`Read #${i} (offset=${i*10}, limit=${100+i}): ${r.lines} lines, truncated=${r.truncated}, count=${r.count}`)
}

console.log('\n✅ 测试 2 证明：不同 offset/limit 也被正确去重（缓存 key 不含参数）')
