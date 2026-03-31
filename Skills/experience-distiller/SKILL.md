---
name: experience-distiller
description: 经验蒸馏器 - 识别可提炼的经验，创建新 Skill 实现自我进化
---

# 🧪 经验蒸馏器

## 核心职责

**识别值得提炼的经验 → 创建新 Skill → 实现自我进化**

## 事件订阅

### 发现改进点（主要场景）
- 事件：`skill.improvement.identified`
- 触发：LLM 在多次尝试后成功，发现可提炼的经验
- 动作：分析是否值得创建新 Skill

### 重复错误
- 事件：`debug.error.repeated`
- 触发：同一个错误出现 3 次以上
- 动作：提炼解决方案，创建 troubleshooting Skill

## 触发标识

```
🧪 【经验蒸馏】
```

## 工作流程

### 1. 搜索现有记录（去重）

**关键步骤：避免重复记录**

```bash
# 搜索 Pattern-Key
grep "Pattern-Key: domain.category.specific" .learnings/LEARNINGS.md
```

如果找到记录：
- 更新 Recurrence-Count += 1
- 更新 Last-Seen 日期
- 判断是否达到阈值（>= 3）

如果没有记录：
- 创建新记录（见步骤 3）

### 2. 分析经验类型
- 代码规范？（如：命名规范、代码风格）
- 调试技巧？（如：常见错误解决方案）
- 工具使用？（如：MCP 工具最佳实践）
- 流程规范？（如：任务审核标准）

### 3. 记录到 .learnings/

**生成唯一 ID：**
- 格式：`LRN-YYYYMMDD-NNN`
- 示例：`LRN-20260315-001`

**生成 Pattern-Key：**
- 格式：`domain.category.specific`
- 示例：`mcp.firecrawl.formats`

**写入记录：**
```markdown
### LRN-20260315-001

- **Pattern-Key:** `mcp.firecrawl.formats`
- **Recurrence-Count:** 1
- **First-Seen:** 2026-03-15
- **Last-Seen:** 2026-03-15
- **Status:** recorded

**问题描述：**
[简短描述]

**解决方案：**
[最终方法]

**相关 Skill：**
- 无（等待重复出现）
```

### 4. 检查是否已有相关 Skill
**关键步骤：避免重复创建**

搜索范围（两个位置都要搜）：
- 全局 Skills：`~/.kiro/skills/`
- 项目 Skills：`Skills/`（兼容旧目录结构）

搜索策略：
- 工具相关 → 搜索 `{tool-name}-usage`
- 代码规范 → 搜索 `code-*`
- 调试技巧 → 搜索 `debug-*` 或 `troubleshooting`

如果找到相关 Skill：
- ✅ 更新现有 Skill（添加新规则）
- ❌ 不创建新 Skill

如果没有相关 Skill：
- 判断是否值得创建（见下一步）

### 5. 判断是否创建/更新 Skill

**阈值判断：**
- Recurrence-Count < 3 → 只记录，不创建 Skill
- Recurrence-Count >= 3 → 询问用户是否创建/更新 Skill

**询问用户：**
```
🧪 【经验蒸馏】发现重复模式（第 N 次）

Pattern: [Pattern-Key]
问题：[简短描述]
解决方案：[最终方法]

建议操作：
1. 创建新 Skill
2. 更新现有 Skill
3. 暂不处理（继续观察）

作用域：
- [G] 全局（所有项目可用）→ ~/.kiro/skills/[名称]/SKILL.md
- [P] 项目级（仅当前项目）→ Skills/[名称]/SKILL.md

请选择操作和作用域（如：1G / 2P / 3）
```

**作用域判断建议：**
- MCP 工具使用经验 → 建议全局（G）
- 项目代码规范 → 建议项目级（P）
- 通用调试技巧 → 建议全局（G）
- 项目特定流程 → 建议项目级（P）

### 6. 执行 Skill 更新

**用户同意后，根据作用域执行：**

如果创建新 Skill（全局）：
```
创建 ~/.kiro/skills/{skill-name}/SKILL.md
```

如果创建新 Skill（项目级）：
```
创建 Skills/{skill-name}/SKILL.md
```

如果更新现有 Skill（自动识别位置）：
```
# 先搜索 Skill 所在位置
# 全局：~/.kiro/skills/{existing-skill}/SKILL.md
# 项目：Skills/{existing-skill}/SKILL.md
# 在原位置更新，不改变作用域
```

**更新学习记录状态：**
- Status: recorded → skill-created 或 skill-updated
- 添加相关 Skill 链接

## 核心原则

1. **先搜索 .learnings/ 去重**（避免重复记录）
2. **Recurrence-Count >= 3 才询问用户**（避免为一次性问题创建 Skill）
3. **优先更新现有 Skill**，而非创建新 Skill
4. **询问用户后再执行**（不自动创建/更新 Skill）
5. **记录必须包含 Pattern-Key**（用于搜索去重）
6. **新 Skill 必须包含事件订阅**（自动触发）


## 完整示例

### 第 1 次遇到问题

```
LLM 调用 firecrawl_scrape，formats: "markdown"
  ↓ 报错
  ↓ 改成 formats: ["markdown"]
  ↓ 成功
  ↓ 发出事件 <event:skill.improvement.identified>

experience-distiller 触发：
  ├─ 搜索：grep "Pattern-Key: mcp.firecrawl.formats" .learnings/LEARNINGS.md
  ├─ 结果：无记录
  ├─ 创建记录：LRN-20260315-001
  ├─ Pattern-Key: mcp.firecrawl.formats
  ├─ Recurrence-Count: 1
  └─ 状态：recorded（只记录，不询问）
```

### 第 2 次遇到

```
一周后，又犯同样错误
  ↓ 发出事件

experience-distiller 触发：
  ├─ 搜索：找到 LRN-20260315-001
  ├─ 更新：Recurrence-Count: 2
  ├─ 更新：Last-Seen: 2026-03-22
  └─ 状态：recorded（继续观察）
```

### 第 3 次遇到

```
又犯同样错误
  ↓ 发出事件

experience-distiller 触发：
  ├─ 搜索：找到 LRN-20260315-001
  ├─ 更新：Recurrence-Count: 3 → 达到阈值！
  └─ 询问用户：

🧪 【经验蒸馏】发现重复模式（第 3 次）

Pattern: mcp.firecrawl.formats
问题：firecrawl_scrape 的 formats 参数使用字符串导致错误
解决方案：formats 必须是数组格式 ["markdown"]

建议操作：
1. 创建新 Skill
2. 更新现有 Skill
3. 暂不处理

建议作用域：[G] 全局（MCP 工具经验，所有项目通用）

请选择（如：1G / 2P / 3）
```

### 用户同意后

```
用户选择：1G（创建全局 Skill）
  ↓
创建 ~/.kiro/skills/firecrawl-usage/SKILL.md
  ↓
更新学习记录：
  ├─ Status: recorded → skill-created
  └─ 相关 Skill: ~/.kiro/skills/firecrawl-usage/SKILL.md
```

### 下次自动应用

```
再次调用 firecrawl_scrape
  ↓ 触发事件
  ↓ firecrawl-usage Skill 注入提示词
  ↓ 直接使用正确格式
  ↓ 一次成功！
```
