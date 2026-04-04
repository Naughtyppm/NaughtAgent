// 全面回归测试 v0.8.5 四层防护机制
import * as fs from 'fs/promises'

// ==================== 模拟 read 缓存逻辑 ====================

const readCache = new Map()

async function simulateRead(filePath, offset = 0, limit = 2000, sessionID = 'test-1') {
  const stat = await fs.stat(filePath)
  const cacheKey = `${sessionID}:${filePath}`
  const cached = readCache.get(cacheKey)
  const currentMtimeMs = stat.mtimeMs

  if (cached && cached.mtimeMs === currentMtimeMs) {
    cached.count++
    if (cached.count >= 3) {
      return { type: 'summary', lines: 12, count: cached.count }
    }
    return { type: 'cached', lines: cached.lineCount, count: cached.count }
  }

  const content = await fs.readFile(filePath, 'utf-8')
  const lineCount = content.split('\n').length
  readCache.set(cacheKey, { mtimeMs: currentMtimeMs, lineCount, count: 1 })
  return { type: 'fresh', lines: lineCount, count: 1 }
}

// ==================== 模拟 loop 层重复检测 ====================

function simulateLoopDetection(toolName, args, toolCallCounts) {
  const MAX_DUPLICATE_CALLS = 3
  const HARD_BLOCK_THRESHOLD = 10

  let argsKey
  if (toolName === 'read' && args && typeof args === 'object' && 'filePath' in args) {
    argsKey = `read:${args.filePath}`
  } else {
    argsKey = `${toolName}:${JSON.stringify(args)}`
  }

  const callCount = (toolCallCounts.get(argsKey) || 0) + 1
  toolCallCounts.set(argsKey, callCount)

  if (callCount > HARD_BLOCK_THRESHOLD) {
    return { result: 'BLOCKED', callCount }
  } else if (callCount > MAX_DUPLICATE_CALLS) {
    return { result: 'WARNING', callCount }
  }
  return { result: 'OK', callCount }
}

// ==================== 测试 ====================

const testFile = 'D:\\AISpace\\Docs\\spec\\PrivacyGuard-Requirements.md'
let passed = 0
let failed = 0

function assert(condition, msg) {
  if (condition) {
    passed++
    console.log(`  ✅ ${msg}`)
  } else {
    failed++
    console.log(`  ❌ FAIL: ${msg}`)
  }
}

// --- Test 1: Read 缓存去重 ---
console.log('\n=== Test 1: Read 缓存去重（相同参数）===')
readCache.clear()
for (let i = 1; i <= 5; i++) {
  const r = await simulateRead(testFile)
  if (i === 1) assert(r.type === 'fresh', `Read #${i}: 首次读取返回完整内容 (${r.lines} lines)`)
  if (i === 2) assert(r.type === 'cached', `Read #${i}: 缓存命中返回完整内容`)
  if (i === 3) assert(r.type === 'summary' && r.lines === 12, `Read #${i}: ≥3次返回摘要 (${r.lines} lines)`)
  if (i === 5) assert(r.type === 'summary', `Read #${i}: 持续返回摘要`)
}

// --- Test 2: Read 缓存 key 不含 offset/limit ---
console.log('\n=== Test 2: 变换 offset/limit 无法绕过缓存 ===')
readCache.clear()
const r1 = await simulateRead(testFile, 0, 2000)
const r2 = await simulateRead(testFile, 10, 500)
const r3 = await simulateRead(testFile, 20, 100)
assert(r1.type === 'fresh', 'Read 默认参数: 首次读取')
assert(r2.type === 'cached', 'Read offset=10,limit=500: 缓存命中（key 不含参数）')
assert(r3.type === 'summary', 'Read offset=20,limit=100: 第3次返回摘要')

// --- Test 3: Loop 层 read 工具 key 只按 filePath ---
console.log('\n=== Test 3: Loop 层 read 重复检测（忽略参数变化）===')
const counts = new Map()
const d1 = simulateLoopDetection('read', { filePath: testFile }, counts)
const d2 = simulateLoopDetection('read', { filePath: testFile, offset: 10 }, counts)
const d3 = simulateLoopDetection('read', { filePath: testFile, offset: 20, limit: 100 }, counts)
const d4 = simulateLoopDetection('read', { filePath: testFile }, counts)
assert(d1.result === 'OK', `Loop #1: OK (count=${d1.callCount})`)
assert(d2.result === 'OK', `Loop #2: 不同参数但同文件 OK (count=${d2.callCount})`)
assert(d3.result === 'OK', `Loop #3: 又不同参数 OK (count=${d3.callCount})`)
assert(d4.result === 'WARNING', `Loop #4: 第4次触发 WARNING (count=${d4.callCount})`)

// 继续到硬阻断
for (let i = 5; i <= 11; i++) {
  simulateLoopDetection('read', { filePath: testFile, offset: i * 5 }, counts)
}
const d12 = simulateLoopDetection('read', { filePath: testFile }, counts)
assert(d12.result === 'BLOCKED', `Loop #12: 硬阻断 BLOCKED (count=${d12.callCount})`)

// --- Test 4: 非 read 工具仍按完整参数检测 ---
console.log('\n=== Test 4: 非 read 工具保持原始参数检测 ===')
const counts2 = new Map()
const g1 = simulateLoopDetection('bash', { command: 'ls' }, counts2)
const g2 = simulateLoopDetection('bash', { command: 'ls -la' }, counts2)
assert(g1.result === 'OK', 'bash "ls": 首次 OK')
assert(g2.result === 'OK', 'bash "ls -la": 不同参数，独立计数 OK')

// --- 总结 ---
console.log(`\n========== 结果: ${passed} passed, ${failed} failed ==========`)
process.exit(failed > 0 ? 1 : 0)
