# NaughtyAgent 学习与重构 TodoList

> 基于 learn-claude-code 教材的 12 阶段路线
> 每个任务标注：解决什么问题

## 阶段 1：基础循环与工具 ✅

- [x] s01 笔记 - Agent Loop
- [x] s02 笔记 - Tool Use
- [x] s03 笔记 - Todo Write
- [x] s04 笔记 - Subagent
- [x] s01 代码拆解
- [x] 实现 TodoManager + Nag Reminder
  - 解决：LLM 执行复杂任务时"忘记"计划的问题
- [x] 添加子代理递归深度限制（MAX_DEPTH=3）
  - 解决：子代理无限递归导致资源耗尽
- [x] 实现 SharedContext 共享状态容器
  - 解决：子代理之间只能传字符串摘要，丢失结构化信息

## 阶段 2：知识与上下文管理 🔄

- [x] s05 笔记 - Skill Loading
  - 解决：理解按需加载知识 vs 工作流技能的差异

- [ ] s06 笔记 - Context Compact
  - 解决：长对话上下文窗口爆满，LLM 丢失早期信息
  - [ ] 学习教材的上下文压缩策略
  - [ ] 检查 NaughtyAgent 现有压缩机制
  - [ ] 规划实现方案

- [ ] MCP 工具集成分析（s02 扩展）
  - 解决：理解外部工具协议，NaughtyAgent 如何接入第三方能力
  - [ ] 理解 MCP 协议
  - [ ] 分析 NaughtyAgent 的 MCP 集成

- [ ] 实现 Knowledge Skill（load_skill 工具）
  - 解决：NaughtyAgent 只有 Workflow Skill，缺少按需知识注入能力
  - [ ] 实现 SkillLoader（扫描 skills/ 目录，解析 frontmatter）
  - [ ] 注册 load_skill 工具
  - [ ] 修改 buildSystemPrompt 注入 Layer 1 摘要

## 阶段 3：任务与并发

- [ ] s07 笔记 - Task System
  - 解决：理解结构化任务分解和追踪机制
- [ ] s08 笔记 - Background Tasks
  - 解决：理解长任务后台执行，不阻塞主循环

## 阶段 4：团队协作

- [ ] s09 笔记 - Agent Teams
  - 解决：理解多 Agent 协作模式（这是融合代理的理论基础）
- [ ] s10 笔记 - Team Protocols
  - 解决：理解 Agent 之间的通信协议和协调机制
- [ ] s11 笔记 - Autonomous Agents
  - 解决：理解自主 Agent 的决策和终止条件

## 阶段 5：隔离与安全

- [ ] s12 笔记 - Worktree Isolation
  - 解决：子代理操作文件系统时的安全隔离

## 重构任务

### P0 - 核心修复

- [x] ~~添加子代理递归限制~~（已在阶段1完成）
- [x] ~~实现 TodoManager~~（已在阶段1完成）

- [ ] 统一 safePath 函数
  - 解决：每个文件工具各自校验路径，逻辑重复且不一致
  - [ ] 创建全局路径校验工具
  - [ ] 所有文件工具使用统一校验

### P1 - 架构优化

- [ ] Loop 解耦 Session
  - 解决：loop.ts 直接操作 session，职责不清，难以测试
  - [ ] Loop 只 yield 事件
  - [ ] 外层负责 Session 写入

- [ ] Registry 实例化
  - 解决：全局单例导致测试互相污染，多实例场景无法支持
  - [ ] 改为 `createToolRegistry()`
  - [ ] 移除全局单例

### P2 - 融合代理（Orchestrator Loop）⭐ 核心目标

> 目标：Agent 能自主探索需求、拆解任务、编排执行，最终产出完整成果（如一个 APP）
> 前置依赖：s06（上下文压缩）、s08（后台任务）、s09-s11（团队协作）

- [ ] 实现 Orchestrator Loop
  - 解决：当前子代理是一次性的，缺少"派发→收集→判断→再派发"的多轮编排循环
  - 与普通 Agent Loop 的区别：orchestrator 不直接调工具，而是派发 worker 并汇总
  - [ ] 设计 OrchestratorLoop 接口
  - [ ] 实现多轮派发-收集-决策循环
  - [ ] 集成 SharedContext 作为共享状态

- [ ] Worker 结果结构化回传
  - 解决：worker 只返回字符串摘要，orchestrator 无法精确判断下一步
  - [ ] worker 自动写入 SharedContext（finding/artifact/error）
  - [ ] orchestrator 通过 summarize() 获取结构化概览

- [ ] 动态任务拆解
  - 解决：当前任务拆解完全靠 LLM 一次性规划，无法根据中间结果调整
  - [ ] orchestrator 每轮读取 SharedContext 后重新评估
  - [ ] 支持追加/取消/调整子任务

- [ ] 并行 Worker 执行
  - 解决：当前子代理串行执行，多个独立任务无法并行
  - 前置：s08 Background Tasks
  - [ ] 复用现有 parallel_agents 能力
  - [ ] 集成到 Orchestrator Loop

- [ ] Orchestrator 终止条件
  - 解决：orchestrator 不知道什么时候该停，可能无限循环
  - [ ] 最大轮数限制
  - [ ] LLM 判断 "任务完成" 信号
  - [ ] SharedContext 中所有子任务 completed 时自动终止

### P3 - 后续优化

- [ ] 错误恢复策略可插拔化
  - 解决：当前错误恢复逻辑硬编码在 loop.ts，无法按场景定制
- [ ] 统一类型系统（减少转换）
  - 解决：session/provider/tool 之间类型转换过多，容易出错
- [ ] 工具并行执行
  - 解决：同一轮多个工具调用只能串行，浪费时间

### 待清理

- [ ] 清理 ChatViewProvider 删除后的引用
  - `packages/vscode/src/extension.ts`
  - `packages/vscode/src/commands/index.ts`

## 当前进度

**已完成**：s01-s05 笔记（5/12）+ s01 代码拆解 + 深度限制 + SharedContext
**下一步**：s06 Context Compact 笔记

## 融合代理学习路径

```
现在 ──────────────────────────────────────→ 目标
  │                                           │
  │ s06 上下文压缩                             │
  │  └→ 解决：长任务上下文爆满                  │
  │ s07 任务系统                               │
  │  └→ 解决：结构化任务追踪                    │
  │ s08 后台任务                               │
  │  └→ 解决：并行 worker 执行                  │
  │ s09 Agent Teams                            │
  │  └→ 解决：多 Agent 协作模式（理论基础）      │
  │ s10 Team Protocols                         │
  │  └→ 解决：Agent 间通信协议                  │
  │ s11 Autonomous Agents                      │
  │  └→ 解决：自主决策和终止条件                │
  │                                            │
  └→ 实现 Orchestrator Loop（融合代理）  ←──────┘
     能自主探索、拆解、编排、产出完整成果
```
