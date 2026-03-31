# Phase B: 感知与知识 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent 能"永远工作"（三层压缩管道完整接入）且能"按需学习"（Knowledge Skill 两层注入生效）

**Architecture:** 整合现有三套压缩器为单一管道（agent/compact.ts 为核心），删除 884 行重复代码。修复 CompactTool 和 LoadSkillTool 的工具可见性问题（当前注册了但不在 agent tools 列表中，LLM 看不到）。Knowledge Skill 的两层注入（system prompt 摘要 + load_skill 按需加载）链路已存在但断裂，需要接通。

**Tech Stack:** TypeScript, Anthropic Messages API, pnpm monorepo

**Current State Analysis:**
- `agent/compact.ts` (194行): 唯一实际工作的压缩管道，Layer 1/2 已完成
- `context/token-compressor.ts` (489行): 未使用的规则化压缩器 → **删除**
- `token/compressor.ts` (395行): 未使用的规则化压缩器 → **删除**
- `skill/knowledge.ts` (156行): SkillLoader 已实现，但 `load_skill` 不在 LLM 工具列表中
- `tool/compact.ts` (54行): CompactTool 已实现，但不在 LLM 工具列表中
- **关键 Bug**: `agent/agent.ts` 的 `BUILTIN_AGENTS.build.tools` 数组缺少 `"compact"` 和 `"load_skill"`

---

## File Structure

### Files to Modify
- `packages/agent/src/agent/agent.ts` — 添加 compact + load_skill 到工具列表
- `packages/agent/src/agent/compact.ts` — 增强 transcript 清理机制
- `packages/agent/src/skill/knowledge.ts` — 修复目录加载逻辑（支持项目+全局同时加载）
- `packages/agent/src/cli/runner.ts` — 验证 initKnowledgeSkillDirs 链路

### Files to Delete
- `packages/agent/src/context/token-compressor.ts` (489行) — 未使用的重复压缩器
- `packages/agent/src/token/compressor.ts` (395行) — 未使用的重复压缩器

### Files to Create
- `packages/agent/test/agent/compact.test.ts` — compact 管道单元测试
- `packages/agent/test/skill/knowledge.test.ts` — SkillLoader 单元测试

### Config Conflict to Resolve
- `context/optimization-config.ts` 定义阈值 80000 vs `config/constants.ts` 定义 50000
- 统一为 `AUTO_COMPACT_TOKEN_THRESHOLD` (50000)

---

## Task 1: 修复工具可见性（CompactTool + LoadSkillTool）

**Files:**
- Modify: `packages/agent/src/agent/agent.ts` — BUILTIN_AGENTS.build.tools 数组

- [ ] **Step 1: 写失败测试 — 确认 compact 和 load_skill 工具对 LLM 可见**

```typescript
// test/agent/tool-visibility.test.ts
import { describe, it, expect } from "vitest"
import { BUILTIN_AGENTS } from "../../src/agent/agent"

describe("BUILTIN_AGENTS tool visibility", () => {
  it("build agent should include compact tool", () => {
    expect(BUILTIN_AGENTS.build.tools).toContain("compact")
  })

  it("build agent should include load_skill tool", () => {
    expect(BUILTIN_AGENTS.build.tools).toContain("load_skill")
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd packages/agent && npx vitest run test/agent/tool-visibility.test.ts`
Expected: FAIL — "compact" 和 "load_skill" 不在数组中

- [ ] **Step 3: 修复 agent.ts — 添加工具到 build agent 的 tools 列表**

在 `packages/agent/src/agent/agent.ts` 的 `BUILTIN_AGENTS.build.tools` 数组中添加：
```typescript
tools: [
  // ...existing tools...
  "compact",       // Layer 3: LLM 主动触发压缩
  "load_skill",    // Layer 2: 按需加载 skill 内容
]
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd packages/agent && npx vitest run test/agent/tool-visibility.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/agent/agent.ts packages/agent/test/agent/tool-visibility.test.ts
git commit -m "fix: expose compact and load_skill tools to LLM"
```

---

## Task 2: 删除重复压缩器（-884 行）

**Files:**
- Delete: `packages/agent/src/context/token-compressor.ts` (489行)
- Delete: `packages/agent/src/token/compressor.ts` (395行)
- Modify: `packages/agent/src/context/index.ts` — 移除 token-compressor 导出
- Modify: `packages/agent/src/token/index.ts` — 移除 compressor 导出

- [ ] **Step 1: 确认无引用**

Run: `cd packages/agent && grep -r "token-compressor" src/ --include="*.ts" | grep -v "token-compressor.ts"`
Run: `cd packages/agent && grep -r "token/compressor" src/ --include="*.ts" | grep -v "compressor.ts"`
Run: `cd packages/agent && grep -r "createTokenCompressor\|createCompressor" src/ --include="*.ts" | grep -v "token-compressor.ts" | grep -v "token/compressor.ts"`

Expected: 仅 index.ts 的 re-export，无实际调用

- [ ] **Step 2: 删除文件并清理导出**

```bash
rm packages/agent/src/context/token-compressor.ts
rm packages/agent/src/token/compressor.ts
```

从 `context/index.ts` 移除 `token-compressor` 相关导出。
从 `token/index.ts` 移除 `compressor` 相关导出（如有）。

- [ ] **Step 3: 运行 typecheck 验证无编译错误**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: 零错误（如有报错则之前的"无引用"检查有遗漏，需修复引用处）

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "refactor: remove 884 lines of unused compression code

Delete context/token-compressor.ts (489 lines) and token/compressor.ts (395 lines).
Both were never called by runner/loop. agent/compact.ts is the sole compression pipeline."
```

---

## Task 3: 修复 Knowledge Skill 目录加载（项目+全局同时加载）

**Files:**
- Modify: `packages/agent/src/skill/knowledge.ts` — 改 if/else if 为累积加载
- Test: `packages/agent/test/skill/knowledge.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// test/skill/knowledge.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { SkillLoader } from "../../src/skill/knowledge"

describe("SkillLoader", () => {
  const tmpDir = join(process.cwd(), ".test-skills-tmp")
  const skillDir = join(tmpDir, "test-skill")

  beforeEach(() => {
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, "SKILL.md"), `---
name: test-skill
description: A test skill
---

# Test Skill Content

This is the full content.`)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("should load skill descriptions from directory", () => {
    const loader = new SkillLoader()
    loader.addDirectory(tmpDir)
    const descriptions = loader.getDescriptions()
    expect(descriptions).toContain("test-skill")
  })

  it("should return full content via getContent", () => {
    const loader = new SkillLoader()
    loader.addDirectory(tmpDir)
    const content = loader.getContent("test-skill")
    expect(content).toContain("Test Skill Content")
  })

  it("should support multiple directories", () => {
    const tmpDir2 = join(process.cwd(), ".test-skills-tmp2")
    const skillDir2 = join(tmpDir2, "another-skill")
    mkdirSync(skillDir2, { recursive: true })
    writeFileSync(join(skillDir2, "SKILL.md"), `---
name: another-skill
description: Another test skill
---
# Another`)

    const loader = new SkillLoader()
    loader.addDirectory(tmpDir)
    loader.addDirectory(tmpDir2)
    const descriptions = loader.getDescriptions()
    expect(descriptions).toContain("test-skill")
    expect(descriptions).toContain("another-skill")

    rmSync(tmpDir2, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: 运行测试验证失败（如果 addDirectory 方法不存在）**

Run: `cd packages/agent && npx vitest run test/skill/knowledge.test.ts`

- [ ] **Step 3: 修复 knowledge.ts — 支持多目录累积加载**

在 `SkillLoader` 类中：
- 添加 `addDirectory(dir: string)` 方法，累积扫描多个目录
- 修改 `initKnowledgeSkillDirs` 逻辑：不再 if/else if，而是依次添加项目级和全局级目录

- [ ] **Step 4: 运行测试通过**

Run: `cd packages/agent && npx vitest run test/skill/knowledge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/skill/knowledge.ts packages/agent/test/skill/knowledge.test.ts
git commit -m "fix: SkillLoader supports multiple directories (project + global)"
```

---

## Task 4: Transcript 清理机制

**Files:**
- Modify: `packages/agent/src/agent/compact.ts` — 添加过期清理

- [ ] **Step 1: 在 autoCompact 的 transcript 写入后添加清理**

```typescript
// 在 writeFileSync 后添加
cleanOldTranscripts(transcriptDir, 7 * 24 * 60 * 60 * 1000) // 保留 7 天
```

```typescript
function cleanOldTranscripts(dir: string, maxAge: number): void {
  try {
    const now = Date.now()
    for (const file of readdirSync(dir)) {
      const filePath = join(dir, file)
      const stat = statSync(filePath)
      if (now - stat.mtimeMs > maxAge) {
        unlinkSync(filePath)
      }
    }
  } catch {
    // 清理失败不影响主流程
  }
}
```

- [ ] **Step 2: 运行 typecheck**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/agent/compact.ts
git commit -m "feat: auto-clean transcripts older than 7 days"
```

---

## Task 5: 统一配置冲突

**Files:**
- Modify: `packages/agent/src/context/optimization-config.ts` — 确认已引用 AUTO_COMPACT_TOKEN_THRESHOLD

- [ ] **Step 1: 验证 optimization-config.ts 已使用统一常量**

检查 `targetTokens` 字段已引用 `AUTO_COMPACT_TOKEN_THRESHOLD` 而非硬编码 50000。
（根据上下文，这在之前的常量统一化会话中已完成。验证即可。）

Run: `cd packages/agent && grep "AUTO_COMPACT_TOKEN_THRESHOLD" src/context/optimization-config.ts`
Expected: import 和使用都存在

- [ ] **Step 2: 运行完整 build 验证**

Run: `cd packages/agent && npx tsc --noEmit && npx tsup`
Expected: 零错误，build 成功

- [ ] **Step 3: Commit（如有改动）**

---

## Phase B 完成标准

- [ ] `compact` 和 `load_skill` 工具在 LLM 工具列表中可见
- [ ] 无重复压缩器（仅 `agent/compact.ts` 存在）
- [ ] SkillLoader 支持项目级+全局级目录同时加载
- [ ] Transcript 有过期清理机制
- [ ] `pnpm typecheck` 零错误
- [ ] `pnpm build` 成功

---

## 工作量评估

| Task | 预估 | 复杂度 |
|------|------|--------|
| Task 1: 修复工具可见性 | 1 步 | 低 |
| Task 2: 删除重复压缩器 | 1 步 | 低（但需仔细检查引用） |
| Task 3: SkillLoader 多目录 | 2-3 步 | 中 |
| Task 4: Transcript 清理 | 1 步 | 低 |
| Task 5: 配置统一验证 | 1 步 | 低 |
| **总计** | **1-2 个会话** | |
