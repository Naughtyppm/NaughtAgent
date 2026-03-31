# Agent 架构学习笔记

> 教材：[learn-claude-code](../../learn-claude-code-main/learn-claude-code-main/README-zh.md)
> 作业：NaughtyAgent（本项目）

## 目录结构

```
Agent架构/
├── 阶段1-基础循环与工具/     ← s01-s04（已完成）
├── 阶段2-知识与上下文管理/   ← s05-s06 + MCP
├── 阶段3-任务与并发/         ← s07-s08
├── 阶段4-团队协作/           ← s09-s11
├── 阶段5-隔离与安全/         ← s12
├── README.md                 ← 本文件
└── TODO.md                   ← 学习进度
```

## 学习路线

### 阶段 1：基础循环与工具 ✅

| 编号 | 主题 | 笔记 |
|------|------|------|
| s01 | Agent Loop | [笔记](阶段1-基础循环与工具/s01-Agent-Loop.md) / [代码拆解](阶段1-基础循环与工具/s01-代码拆解.md) |
| s02 | Tool Use | [笔记](阶段1-基础循环与工具/s02-Tool-Use.md) |
| s03 | Todo Write | [笔记](阶段1-基础循环与工具/s03-Todo-Write.md) |
| s04 | Subagent | [笔记](阶段1-基础循环与工具/s04-Subagent.md) / [SharedContext](阶段1-基础循环与工具/s04-SharedContext与融合代理.md) |

### 阶段 2：知识与上下文管理 🔄

| 编号 | 主题 | 笔记 |
|------|------|------|
| s05 | Skill Loading | [笔记](阶段2-知识与上下文管理/s05-Skill-Loading.md) |
| s06 | Context Compact | 待完成 |
| MCP | MCP 工具集成 | 待完成 |

### 阶段 3：任务与并发

| 编号 | 主题 | 笔记 |
|------|------|------|
| s07 | Task System | 待完成 |
| s08 | Background Tasks | 待完成 |

### 阶段 4：团队协作

| 编号 | 主题 | 笔记 |
|------|------|------|
| s09 | Agent Teams | 待完成 |
| s10 | Team Protocols | 待完成 |
| s11 | Autonomous Agents | 待完成 |

### 阶段 5：隔离与安全

| 编号 | 主题 | 笔记 |
|------|------|------|
| s12 | Worktree Isolation | 待完成 |

## 笔记格式

每篇笔记包含：
1. 术语表（必须）
2. 教材要点（这一阶段教了什么）
3. NaughtyAgent 现状（我的代码怎么写的）
4. 差距分析 / 代码改动
5. 面试考点
