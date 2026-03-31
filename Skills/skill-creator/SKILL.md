---
name: skill-creator
description: Skill 创建器 - 根据提炼的经验创建新 Skill
---

# 🔧 Skill 创建器

## 职责

接收 experience-distiller 的请求，创建新 Skill 文件。

## 触发标识

```
🔧 【Skill 创建】
```

## 创建流程

### 1. 确认 Skill 信息
- Skill 名称（kebab-case）
- Skill 类型（代码规范/调试技巧/工具使用/流程规范）
- 核心内容（提炼的经验）
- 订阅事件（何时触发）

### 2. 生成 Skill 文件

创建 `Skills/{skill-name}/SKILL.md`：

```yaml
---
name: skill-name
description: 简短描述
---

# 📋 Skill 标题

## 事件订阅

- 事件：`domain.action.status`
- 触发条件：具体描述
- 动作：注入的提示词

## 触发标识

🎯 【Skill 名称】

## 核心内容

[提炼的经验、规范、最佳实践]
```

### 3. 确认创建

告知用户新 Skill 已创建，下次遇到类似情况会自动触发。
