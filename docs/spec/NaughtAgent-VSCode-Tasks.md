# NaughtAgent VSCode 集成 — 任务清单

> 版本：v1.0 | 日期：2026-04-04 | 对应文档：Requirements + Design

## 任务总览

- P0：打通 VSCode Chat MVP（消息发送、流式显示、权限确认）
- P1：补齐工具可视化、Diff 预览、上下文增强
- P1：CLI 记忆可发现性增强（/memory 命令）
- P2：体验优化（状态栏、配置、发布）

---

## Phase 1 - VSCode Chat MVP（P0）

### Task 1.1 新建 ChatViewProvider
- 文件：`packages/vscode/src/views/chat/ChatViewProvider.ts`
- 内容：
  - 实现 `WebviewViewProvider`
  - 注入 `AgentClient` / `ContextCollector` / `DiffProvider`
  - 处理 webview 消息通道
- 验收：扩展激活后 Chat View 可正常打开，无报错

### Task 1.2 新建 Webview 前端资源
- 文件：
  - `packages/vscode/src/views/chat/webview/index.html`
  - `packages/vscode/src/views/chat/webview/main.js`
  - `packages/vscode/src/views/chat/webview/styles.css`
- 内容：
  - 输入框 + 发送按钮
  - 消息列表
  - 基础样式
- 验收：可输入并触发 `send_message`

### Task 1.3 Extension 入口接线
- 文件：`packages/vscode/src/extension.ts`
- 内容：
  - 正确 import ChatViewProvider
  - 传递必要 service
  - 注册 webview provider
- 验收：`naughtyagent.openChat` 可聚焦聊天视图

### Task 1.4 流式消息桥接
- 文件：`packages/vscode/src/views/chat/ChatViewProvider.ts`
- 内容：
  - 监听 Agent 消息
  - 转发 text/tool/error/done 到 webview
- 验收：能看到逐步输出而不是一次性输出

---

## Phase 2 - 工具与权限（P0/P1）

### Task 2.1 工具调用可视化
- 文件：`main.js` + `styles.css`
- 内容：
  - tool_start/tool_end 卡片
  - 折叠长输出
- 验收：工具过程清晰可见

### Task 2.2 权限确认 UI
- 文件：`main.js` + `ChatViewProvider.ts`
- 内容：
  - 弹出确认面板
  - 支持允许/拒绝
  - 回传 `permission_response`
- 验收：write/bash 操作必须确认后执行

### Task 2.3 Diff 预览联动
- 文件：`ChatViewProvider.ts`
- 内容：
  - 调用 DiffProvider 解析工具结果
  - 提供 `Preview Diff` 行为
- 验收：编辑类工具可触发 VSCode 原生 diff

---

## Phase 3 - 上下文与会话（P1）

### Task 3.1 上下文注入优化
- 文件：`ChatViewProvider.ts`
- 内容：
  - 调用 ContextCollector.collect()
  - 将 context prompt 前置到用户消息
- 验收：询问时可利用当前文件和选中代码

### Task 3.2 @file 引用能力暴露
- 文件：`main.js` + `ChatViewProvider.ts`
- 内容：
  - 基础提示与补全入口
  - 扩展端 resolve file refs
- 验收：`@file src/x.ts` 生效

### Task 3.3 会话切换体验优化
- 文件：`extension.ts` + `SessionPicker.ts`
- 内容：
  - 切换会话时通知 ChatView 刷新
- 验收：切会话后消息区可正确重置/恢复

---

## Phase 4 - CLI 记忆完善（P1）

### Task 4.1 Plain-text 交互层新增 `/memory`
- 文件：`packages/agent/src/cli/plain-text/interaction.ts`
- 内容：
  - 注册 `/memory`、`/memory add <text>`
  - 输出当前 memory 文件摘要
- 验收：命令可用，无破坏已有命令

### Task 4.2 CLI 启动提示记忆状态
- 文件：`packages/agent/src/cli/cli.ts` 或 `plain-text/index.ts`
- 内容：
  - 检测 `.naughty/memory.md` 并提示已加载
- 验收：启动时显示 memory 状态

### Task 4.3 文档更新
- 文件：`docs/naughtyagent/README.md`（或 CLI 文档）
- 内容：新增 `/memory` 使用说明
- 验收：文档与功能一致

---

## Phase 5 - 迁移发布（P2）

### Task 5.1 版本与变更记录
- 文件：
  - `packages/agent/package.json`（patch +1）
  - `CLAUDE.md`（版本更新日志）
- 验收：版本号与功能一致

### Task 5.2 构建与类型检查
- 命令：
  - `pnpm -C packages/agent build`
  - `pnpm -C packages/agent typecheck`
  - `pnpm -C packages/vscode build`
- 验收：零错误

### Task 5.3 手工验收脚本
- 场景：
  - 发送普通消息
  - 触发 read/write/bash 权限
  - 切换会话
  - 使用 `/memory`
- 验收：核心流程全部通过

---

## 依赖关系

- Task 1.1 -> Task 1.3 -> Task 1.4
- Task 1.x 完成后才能做 Task 2.x
- Task 2.x 完成后做 Task 3.x
- Task 4.x（CLI）可并行推进
- Task 5.x 最后执行

---

## 里程碑

- M1（2 天）：Phase 1 完成，Chat MVP 可用
- M2（4 天）：Phase 2 完成，权限 + 工具可视化可用
- M3（6 天）：Phase 3 + Phase 4 完成，上下文 + CLI 记忆增强
- M4（7 天）：Phase 5 完成，发布候选版本
