# 学习记录

> 记录 LLM 从失败中学到的经验，用于判断是否创建新 Skill

---

## 记录格式

```markdown
### LRN-YYYYMMDD-NNN

- **Pattern-Key:** `domain.category.specific`
- **Recurrence-Count:** N
- **First-Seen:** YYYY-MM-DD
- **Last-Seen:** YYYY-MM-DD
- **Status:** recorded | skill-created | skill-updated

**问题描述：**
简短描述遇到的问题

**解决方案：**
最终的解决方法

**相关 Skill：**
- Skills/xxx-skill/SKILL.md（如已创建）
```

---

## 示例记录

### LRN-20260315-001

- **Pattern-Key:** `mcp.firecrawl.formats`
- **Recurrence-Count:** 1
- **First-Seen:** 2026-03-15
- **Last-Seen:** 2026-03-15
- **Status:** recorded

**问题描述：**
调用 firecrawl_scrape 时，formats 参数使用字符串 "markdown" 导致错误

**解决方案：**
formats 必须是数组格式：`["markdown"]`

**相关 Skill：**
- 无（等待重复出现）

---

