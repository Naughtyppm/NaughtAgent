---
name: find-skills
description: |
  Skills 发现与安装器。搜索在线 Skill 生态、本地 CC Skills、以及 clawhub.ai 社区 Skill。
  支持安装到项目级或全局级目录，兼容 CC 和 NA 格式。
hooks:
  - event: "skill:needed"
    action: "当 LLM 遇到不熟悉的领域且现有 skills 无法覆盖时，搜索可用 skill"
    priority: medium
emits:
  - event: "skill:installed"
    when: "成功安装了一个新 skill"
    timing: deferred
---

# Skills 发现与安装

## 触发标识

```
🔍 【Skill 发现】
```

## 何时触发

- 用户说 "找一个 skill"、"有没有 xx 相关的 skill"、"search skills"
- 用户说 "安装 skill"、"install skill"
- LLM 遇到不熟悉的领域，且现有 skills 无法覆盖（自动触发）
- 用户想扩展 Agent 能力

## 搜索来源（优先级从高到低）

### 1. 本地已安装 Skills

首先检查是否已有相关 skill：

```
使用 load_skill 列出所有可用 skills
检查名称和描述是否匹配用户需求
```

### 2. Skills CLI 生态（skills.sh）

```bash
npx skills find [query]        # 交互式搜索
npx skills add <owner/repo>    # 安装
npx skills check               # 检查更新
```

浏览地址：https://skills.sh/

### 3. ClawHub 社区（clawhub.ai）

```
访问 https://clawhub.ai/skills 搜索
支持通过 fetch 工具获取 SKILL.md 内容
```

### 4. CC 全局 Skills（~/.claude/skills/）

NA 自动加载 `~/.claude/skills/` 目录中的所有 CC Skills。
如果用户需要的 skill 已在 CC 全局目录中存在，直接可用。

## 安装流程

### 从 skills.sh 安装

```bash
# 搜索
npx skills find react performance

# 安装到 NA 项目级
npx skills add <owner/repo@skill> --dir .naughty/skills/

# 安装到 NA 全局级
npx skills add <owner/repo@skill> --dir ~/.naughtyagent/skills/
```

### 从 ClawHub 安装

1. 获取 SKILL.md 内容（通过 fetch）
2. 使用 `create_skill` 工具创建本地 skill
3. 如有 scripts/、references/ 等资源，手动下载到 skill 目录

### 手动创建

当找不到现成 skill 时，使用 `create_skill` 工具基于用户需求创建：

```
create_skill({
  name: "skill-name",
  description: "描述",
  body: "# Skill 内容\n...",
  scope: "project" | "global",
  hooks: [...],  // 可选：事件订阅
  emits: [...]   // 可选：事件发射
})
```

## 展示规范

搜索到结果时，向用户展示：

1. **Skill 名称** + 简短描述
2. **来源**（本地已安装 / skills.sh / clawhub / CC全局）
3. **安装命令**（一键复制）
4. **兼容性**（NA/CC 双向兼容标识）

## 安装后验证

安装 skill 后必须验证：

1. `load_skill` 能成功加载
2. frontmatter 解析正确（name、description）
3. hooks/emits 声明无误（如有）
4. 向用户确认安装成功

## 与其他 Skills 的关系

- **skill-creator**：find-skills 找不到时，引导用户用 skill-creator 自创
- **experience-distiller**：when pattern detected → suggest create_skill
- **event-bus**：安装的 skill 如有 hooks/emits，自动注册到事件总线
