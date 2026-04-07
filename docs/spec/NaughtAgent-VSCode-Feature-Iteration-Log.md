# NaughtAgent VSCode Feature Iteration Log

## 2026-04-04 Iteration 1 - Thinking Toggle

### Goal
Add a user-visible thinking toggle in chat UI and send thinking options to daemon per message.

### Changes
- Added thinking toggle and budget selector in chat webview UI.
- Switched chat sending path from SSE polling to WebSocket stream for richer events.
- Added WebSocket send options support for model/thinking payload.
- Added thinking event types in extension client.

### Files
- packages/vscode/src/views/chat/ChatViewProvider.ts
- packages/vscode/src/services/AgentClient.ts

### Test Steps
1. Start daemon and extension host.
2. Open NaughtyAgent chat view.
3. Enable "深度思考" and set budget to 16000.
4. Send a prompt like: "请先思考再回答：项目结构要点是什么？"
5. Verify response arrives normally and no "未收到有效回复" appears.

### Result
- Implemented, pending user side verification.

## 2026-04-04 Iteration 2 - Runtime Controls

### Goal
Add practical runtime controls directly in chat panel: model switch, agent mode switch, and permission auto strategy.

### Changes
- Added model selector in chat panel.
- Added mode selector (build/plan/explore) in chat panel.
- Switching mode triggers session reset and recreates proper session type.
- Sending message now includes selected model in WebSocket payload.
- Added auto permission strategy based on naughtyagent.autoConfirm.* config.
- Fixed WebSocket text_delta rendering path to avoid empty final answer.

### Files
- packages/vscode/src/views/chat/ChatViewProvider.ts
- packages/vscode/src/services/AgentClient.ts

### Self-check
1. Build extension: pass.
2. Type diagnostics for modified files: pass.
3. Manual runtime expectations:
	- model/mode controls visible
	- text_delta no longer dropped
	- permission can auto-allow by config key when matched

### Result
- Implemented, waiting integrated UI run verification.

## 2026-04-04 Iteration 5 - Automated Smoke Test

### Goal
Create a repeatable smoke test before asking user for integrated acceptance.

### Changes
- Added smoke script for build + daemon health + message stream validation.
- Script auto-starts daemon when not running.

### Files
- scripts/test-vscode-smoke.ps1

### Self-check
- Executed script successfully.
- Final output: [SMOKE PASS] build + daemon + stream pipeline is healthy

### Result
- Implemented and validated.

## 2026-04-04 Iteration 13 - Permission Ask-All Protocol Fix

### Goal
Fix "逐个审批" (ask-all) permission mode: daemon was ignoring client's permission mode because (1) `onPermissionRequest` was a notification-only callback but WS handler treated it as a decision-maker, and (2) `autoConfirm` was a static server config not overridable per-message.

### Root Cause
- `runner.ts`: `buildPermissionChecker` calls `handlers.onPermissionRequest?(request)` as notification (void return), then `confirmCallback(request)` for the actual decision.
- `confirmCallback` checks `autoConfirm` — if true, returns true immediately, never reaching `onConfirm`.
- `websocket.ts`: `createRunner` passed `autoConfirm: this.config.autoConfirm` (static) and no `onConfirm`. The WS permission prompt logic was in `handlers.onPermissionRequest` (notification), so its Promise return was ignored.
- Result: With `autoConfirm=true`, no permission requests ever reached the client.

### Fix
- Added `autoConfirmRef: { value: boolean }` to `WebSocketConnection` (runtime-mutable reference).
- Created `confirmViaWs()` method — sends `permission_request` WS event, waits for client response with 60s timeout.
- All 3 `createRunner` calls now pass `autoConfirmRef` + `onConfirm: (req) => this.confirmViaWs(req)`.
- `handleSend` accepts `autoConfirm` from WS message and updates `autoConfirmRef.value`.
- Extension sends `autoConfirm: permissionMode === 'auto-safe'` in WS send payload.
- Added `autoConfirm` to `WSSendMessage` type and `SendOptions` interface.

### Files
- packages/agent/src/server/websocket.ts (autoConfirmRef, confirmViaWs, onConfirm, handleSend)
- packages/agent/src/server/types.ts (WSSendMessage.autoConfirm)
- packages/vscode/src/services/AgentClient.ts (SendOptions.autoConfirm, WS payload)
- packages/vscode/src/views/chat/ChatViewProvider.ts (send autoConfirm based on permissionMode)

### Self-check
1. agent tsc --noEmit: pass
2. vscode esbuild: pass

### Result
- Implemented, pending user retest with "逐个审批" mode.

## 2026-04-04 Iteration 12 - Thinking Collapsible & CSS Polish

### Goal
Make thinking blocks collapsible (like tools), improve CSS for thinking/code elements.

### Changes
- Thinking blocks now render as `<details>` collapsible with "思考过程 (点击展开)" summary.
- `.msg.thinking` CSS: max-height 200px, overflow-y auto, font-size 13px, muted color.
- Added `code` element styling (background, padding, border-radius, monospace font).
- Fixed `else` branch in render() after thinking block — added missing `roleTitle` variable.

### Files
- packages/vscode/media/chat.js (thinking → details collapsible)
- packages/vscode/src/views/chat/ChatViewProvider.ts (CSS updates)

### Self-check
1. vscode esbuild: pass

### Result
- Implemented, pending user retest.

## 2026-04-04 Iteration 11 - UX Polish & Regex Fix

### Goal
Fix markdown rendering regex in template literal, clean up model list, improve tool folding, clarify permission mode labels.

### Changes
- Fixed renderMarkdown regex escaping: `\\*\\*` for bold, `\\*` for italic, `\\n` for newlines (template literal requires double-backslash).
- Fixed tool message split using correct `'\\n'` escape.
- Cleaned up model dropdown labels (Sonnet 4, Opus 4.5, Haiku 4).
- Changed permission mode labels to Chinese (自动审批/逐个审批).
- Tool messages already use `<details>` collapsible sections.

### Files
- packages/vscode/src/views/chat/ChatViewProvider.ts

### Self-check
1. Build: pass
2. Script syntax validation: pass
3. Smoke test: pass

### Result
- Implemented, pending user retest of full chat flow.

## 2026-04-04 Iteration 10 - Runtime Logging

### Goal
Add actionable logs for send pipeline diagnosis.

### Changes
- Added output channel NaughtyAgent and key lifecycle logs.
- Added chat pipeline logs in ChatViewProvider (webview message, send start, ws event, done/error).
- Added command NaughtyAgent: 显示日志.

### Files
- packages/vscode/src/extension.ts
- packages/vscode/src/views/chat/ChatViewProvider.ts
- packages/vscode/package.json

### Self-check
1. Build extension: pass.
2. Type diagnostics: pass.

### Result
- Implemented and ready for user-assisted diagnosis.

## 2026-04-04 Iteration 9 - Webview Script Execution Reliability

### Goal
Eliminate possible nonce/CSP mismatch causing webview script not running.

### Changes
- Relaxed webview CSP script policy to unsafe-inline for development validation.

### Files
- packages/vscode/src/views/chat/ChatViewProvider.ts

### Self-check
1. Build extension: pass.

### Result
- Implemented for diagnosis and reliability in current dev iteration.

## 2026-04-04 Iteration 9.1 - Template Escape Regression Fix

### Goal
Fix template-escape regression that could break webview script execution.

### Changes
- Corrected markdown regex escaping strategy for embedded script.
- Removed inline-code regex to avoid backtick conflict in template literal.

### Files
- packages/vscode/src/views/chat/ChatViewProvider.ts

### Self-check
1. Build extension: pass.
2. Smoke script: pass.

### Result
- Implemented and validated.

## 2026-04-04 Iteration 8 - Debugging Entry For Send Pipeline

### Goal
Provide a deterministic command to test extension-side send flow.

### Changes
- Added command naughtyagent.debugPing to send message directly from extension host.
- This bypasses webview input event and helps isolate whether failure is UI event layer or backend chain.

### Files
- packages/vscode/src/commands/index.ts
- packages/vscode/package.json

### Self-check
1. Build extension: pass.

### Result
- Implemented and validated.

## 2026-04-04 Iteration 7 - Send Freeze Fix And Model List Alignment

### Goal
Fix chat send freeze reported by user and align model selector with agent-supported names.

### Changes
- Added safe tool payload summarization to avoid JSON serialization crashes.
- Added message-handler try/catch guard to prevent pending state lockup.
- Added webview DOM initialization guards to avoid silent JS crash.
- Expanded model selector to match NaughtAgent model aliases and ids.

### Files
- packages/vscode/src/views/chat/ChatViewProvider.ts

### Self-check
1. Build extension: pass.
2. Type diagnostics: pass.
3. Smoke script: pass.

### Result
- Implemented and validated.

## 2026-04-04 Iteration 6 - Feedback Driven UX Fixes

### Goal
Address concrete test feedback from user UI run.

### Changes
- Added basic markdown rendering in chat content (bold/italic/inline-code/headings/newline).
- Beautified thinking block with dedicated icon and style.
- Tool timeline now includes summarized input/output payload.
- Added permission mode selector:
	- auto-safe: follow naughtyagent.autoConfirm.*
	- ask-all: always prompt in chat
- Added input history navigation in textbox with ArrowUp/ArrowDown.
- Added safe tool payload serialization and message-handler error guard to prevent send pipeline freeze.

### Files
- packages/vscode/src/views/chat/ChatViewProvider.ts

### Self-check
1. Build extension: pass.
2. Type diagnostics for modified files: pass.
3. Smoke script: pass.

### Result
- Implemented and validated.

## 2026-04-04 Iteration 4 - Observability And Reliability

### Goal
Improve user visibility and reliability during long-running tool flows.

### Changes
- Added current session ID to runtime status line.
- Added explicit system message when session gets created.
- Added explicit system message when permission request times out and auto-denies.

### Files
- packages/vscode/src/views/chat/ChatViewProvider.ts

### Self-check
1. Build extension: pass.
2. Type diagnostics for modified files: pass.

### Result
- Implemented, waiting integrated UI run verification.

## 2026-04-04 Iteration 3 - Workflow Controls

### Goal
Improve practical workflow controls for daily usage.

### Changes
- Added "中断" button to cancel running task.
- Added "新会话" button to reset session quickly.
- Added runtime status line (mode/model/status).
- Added tool timeline messages for tool_start/tool_end events.

### Files
- packages/vscode/src/views/chat/ChatViewProvider.ts

### Self-check
1. Build extension: pass.
2. Type diagnostics for modified files: pass.

### Result
- Implemented, waiting integrated UI run verification.

### Next Candidate Iterations
- Iteration 2: Model switch (UI + runtime payload)
- Iteration 3: Mode switch (build/plan/explore session control)
- Iteration 4: Permission policy presets (ask/auto-allow read/search)

## 2026-04-04 Iteration 1.1 - UX Fixes From Real Test

### Goal
Fix three practical issues reported from real usage.

### Reported Issues
1. Permission was shown as VS Code popup, not in chat flow.
2. Thinking content and final answer were mixed together.
3. Response looked interrupted after model said it would continue.

### Changes
- Replaced modal permission prompt with in-chat permission card (Allow/Reject).
- Split thinking content into a separate "[思考过程]" system block.
- Kept assistant final output as a separate answer block for clarity.
- Added timeout fallback for unattended permission requests.

### Files
- packages/vscode/src/views/chat/ChatViewProvider.ts

### Test Steps
1. Send a prompt that triggers tool calls/permissions.
2. Confirm permission request appears inside chat panel.
3. Click "允许" and verify answer continues in same run.
4. Enable thinking and verify:
	- thinking shows in system block
	- final answer shows in assistant block

### Result
- Implemented, pending user side verification.
