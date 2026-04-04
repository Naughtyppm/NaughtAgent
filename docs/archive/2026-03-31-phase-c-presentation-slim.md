# Phase C: 表现层精简 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 砍掉冗余代码，统一 CLI 体验，Server 层稳定化

**Architecture:** 删除 942 行传统 REPL（Ink REPL 已足够）。保留但精简 parseArgs（不引入 commander 新依赖）。Server 层添加集中式 SessionManager 和 WebSocket 心跳。子代理模式从 7 种砍到 4 种核心。provider/types.ts 旧映射表清理。

**Tech Stack:** TypeScript, React Ink 5, WebSocket, pnpm monorepo

**Current State Analysis:**
- `cli/repl.ts` (942行): 传统 readline REPL，与 Ink REPL 功能重叠 60%+ → **删除**
- `cli/repl-ink.ts` (80行): Ink REPL 入口，已有 fallback 逻辑
- `cli/cli.ts` (637行): 手写 parseArgs ~100 行，功能完整
- `server/routes.ts` (1112行): REST API，无集中 SessionManager
- `server/websocket.ts` (803行): WebSocket 处理，无心跳检测
- 子代理工具 7 种 (2268行): ask_llm, run_agent, fork_agent, parallel_agents, multi_agent, dispatch_agent, run_workflow

---

## File Structure

### Files to Delete
- `packages/agent/src/cli/repl.ts` (942行) — 被 Ink REPL 取代

### Subagent Tools to Delete (3 种，~900 行)
- `packages/agent/src/tool/subagent/dispatch-agent-tool.ts` (287行) — Na 反复误用，功能被 run_agent 覆盖
- `packages/agent/src/tool/subagent/multi-agent-tool.ts` (450行) — 过于复杂，parallel_agents 足够
- `packages/agent/src/tool/subagent/run-workflow-tool.ts` (166行) — workflow 系统由 skill executor 处理

### Files to Modify
- `packages/agent/src/cli/cli.ts` — 移除 repl.ts 引用
- `packages/agent/src/tool/subagent/register.ts` — 移除被删工具的注册
- `packages/agent/src/tool/subagent/index.ts` — 清理导出
- `packages/agent/src/agent/agent.ts` — 从 tools 列表移除被删工具
- `packages/agent/src/server/websocket.ts` — 添加 ping/pong 心跳
- `packages/agent/src/provider/types.ts` — 删除旧映射表

### Subagent Tools to Keep (4 种核心)
- `ask_llm` (117行) — 简单 LLM 查询
- `run_agent` (139行) — 独立子代理执行
- `fork_agent` (143行) — 后台子代理
- `parallel_agents` (367行) — 并行多代理

---

## Task 1: 删除传统 REPL (-942 行)

**Files:**
- Delete: `packages/agent/src/cli/repl.ts`
- Modify: `packages/agent/src/cli/cli.ts` — 移除 import 和调用

- [ ] **Step 1: 搜索 repl.ts 的所有引用**

Run: `cd packages/agent && grep -rn "repl" src/cli/ --include="*.ts" | grep -v "repl-ink" | grep -v "node_modules"`

记录所有引用点。

- [ ] **Step 2: 修改 cli.ts 移除 repl.ts 引用**

将所有指向旧 `repl.ts` 的 import/调用替换为 `repl-ink.ts` 的对应功能，或直接删除（如 repl-ink 已覆盖该路径）。

- [ ] **Step 3: 删除 repl.ts**

```bash
rm packages/agent/src/cli/repl.ts
```

- [ ] **Step 4: typecheck 验证**

Run: `cd packages/agent && npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "refactor: delete legacy REPL (-942 lines)

Ink REPL (repl-ink.ts) handles all REPL functionality including
non-TTY fallback. The traditional readline REPL was redundant."
```

---

## Task 2: 精简子代理工具 (7→4 种，-903 行)

**Files:**
- Delete: `packages/agent/src/tool/subagent/dispatch-agent-tool.ts` (287行)
- Delete: `packages/agent/src/tool/subagent/multi-agent-tool.ts` (450行)
- Delete: `packages/agent/src/tool/subagent/run-workflow-tool.ts` (166行)
- Modify: `packages/agent/src/tool/subagent/register.ts`
- Modify: `packages/agent/src/tool/subagent/index.ts`
- Modify: `packages/agent/src/agent/agent.ts`

- [ ] **Step 1: 确认被删工具的引用**

```bash
cd packages/agent
grep -rn "dispatch_agent\|dispatch-agent" src/ --include="*.ts" | grep -v "dispatch-agent-tool.ts"
grep -rn "multi_agent\|multi-agent" src/ --include="*.ts" | grep -v "multi-agent-tool.ts"
grep -rn "run_workflow\|run-workflow" src/ --include="*.ts" | grep -v "run-workflow-tool.ts"
```

- [ ] **Step 2: 从 register.ts 和 index.ts 移除注册和导出**

- [ ] **Step 3: 从 agent.ts 的 tools 列表移除**

- [ ] **Step 4: 删除 3 个文件**

```bash
rm packages/agent/src/tool/subagent/dispatch-agent-tool.ts
rm packages/agent/src/tool/subagent/multi-agent-tool.ts
rm packages/agent/src/tool/subagent/run-workflow-tool.ts
```

- [ ] **Step 5: typecheck + build 验证**

Run: `cd packages/agent && npx tsc --noEmit && npx tsup`
Expected: 零错误

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "refactor: reduce subagent tools from 7 to 4 (-903 lines)

Remove dispatch_agent (misused by Na), multi_agent (parallel_agents sufficient),
run_workflow (handled by skill executor). Keep: ask_llm, run_agent, fork_agent,
parallel_agents."
```

---

## Task 3: WebSocket Ping/Pong 心跳

**Files:**
- Modify: `packages/agent/src/server/websocket.ts`

- [ ] **Step 1: 添加心跳检测（每 30s ping，10s 内无 pong 则断开）**

在 WebSocket 连接建立后设置 interval：

```typescript
const HEARTBEAT_INTERVAL = 30_000
const HEARTBEAT_TIMEOUT = 10_000

const heartbeat = setInterval(() => {
  if (!ws.isAlive) {
    clearInterval(heartbeat)
    ws.terminate()
    return
  }
  ws.isAlive = false
  ws.ping()
}, HEARTBEAT_INTERVAL)

ws.on("pong", () => { ws.isAlive = true })
ws.on("close", () => { clearInterval(heartbeat) })
```

- [ ] **Step 2: typecheck 验证**

Run: `cd packages/agent && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add packages/agent/src/server/websocket.ts
git commit -m "feat: add WebSocket ping/pong heartbeat (30s interval)"
```

---

## Task 4: 清理 provider/types.ts 旧映射表

**Files:**
- Modify: `packages/agent/src/provider/types.ts`
- Check: 确认 `config/models.ts` 已包含所有需要的映射

- [ ] **Step 1: 识别 types.ts 中的废弃导出**

找到 DEFAULT_MODEL、FAST_MODEL 和 3 套独立映射表。
确认所有引用方已迁移到 `config/models.ts`。

- [ ] **Step 2: 删除废弃代码**

- [ ] **Step 3: 修复编译错误（如果还有引用方）**

- [ ] **Step 4: typecheck + Commit**

---

## Phase C 完成标准

- [ ] `repl.ts` 已删除
- [ ] 子代理工具从 7 种精简到 4 种
- [ ] WebSocket 有心跳检测
- [ ] provider/types.ts 无冗余映射表
- [ ] `pnpm typecheck` 零错误
- [ ] `pnpm build` 成功
- [ ] `na "hello"` standalone 模式正常工作

---

## 工作量评估

| Task | 预估 | 复杂度 |
|------|------|--------|
| Task 1: 删除传统 REPL | 1 步 | 低（但需仔细检查依赖） |
| Task 2: 精简子代理工具 | 2 步 | 中（引用检查+清理） |
| Task 3: WebSocket 心跳 | 1 步 | 低 |
| Task 4: 清理旧映射表 | 1-2 步 | 中（可能有残余引用） |
| **总计** | **1-2 个会话** | |
