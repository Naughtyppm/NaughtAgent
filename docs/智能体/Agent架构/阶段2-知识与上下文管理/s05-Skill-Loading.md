# s05 - Skill Loading

> 教材：`learn-claude-code-main/agents/s05_skill_loading.py`
> 作业：`packages/agent/src/skill/`

## 术语表

| 术语 | 英文 | 含义 |
|------|------|------|
| Skill | Skill（技能） | 预定义的领域知识包，让 Agent 按需获取专业能力 |
| Two-Layer Injection | Two-Layer Injection（两层注入） | Layer 1 在 system prompt 放摘要，Layer 2 按需加载全文 |
| Frontmatter | Frontmatter（前置元数据） | SKILL.md 文件开头 `---` 之间的 YAML 元数据 |
| On-Demand Loading | On-Demand Loading（按需加载） | 模型主动调用 `load_skill` 才加载完整内容，避免 system prompt 膨胀 |
| System Prompt Bloat | System Prompt Bloat（系统提示膨胀） | 把所有知识塞进 system prompt 导致 token 浪费和注意力稀释 |
| Workflow Skill | Workflow Skill（工作流技能） | NaughtyAgent 的方式，skill 是预编排的多步骤工作流 |
| Knowledge Skill | Knowledge Skill（知识技能） | 教材的方式，skill 是纯文本知识，注入后由 LLM 自行决定怎么用 |

## 一、教材要点

s05 的核心洞察：**不要把所有东西塞进 system prompt，按需加载。**

### 两层架构

```
Layer 1（便宜）：skill 名称 + 一句话描述 → 放在 system prompt
  约 100 tokens/skill，10 个 skill 也才 1000 tokens

Layer 2（按需）：完整 skill 内容 → 通过 load_skill 工具返回
  可能几千 tokens，但只在需要时才加载
```

### 文件结构

```
skills/
  pdf/
    SKILL.md          ← frontmatter(name, description) + 正文
  code-review/
    SKILL.md
```

### SKILL.md 格式

```markdown
---
name: pdf
description: Process PDF files - extract text, create PDFs, merge documents.
---

# PDF Processing Skill

You now have expertise in PDF manipulation. Follow these workflows:
...（具体操作指南）
```

frontmatter 用 `---` 分隔，包含 name 和 description。正文是给 LLM 的详细指令。

### SkillLoader 实现

```python
class SkillLoader:
    def __init__(self, skills_dir):
        self.skills = {}
        self._load_all()  # 启动时扫描所有 SKILL.md

    def get_descriptions(self) -> str:
        """Layer 1：生成 system prompt 片段"""
        # 输出格式：  - pdf: Process PDF files...
        # 每个 skill 约 100 tokens

    def get_content(self, name: str) -> str:
        """Layer 2：返回完整 skill 内容"""
        # 包裹在 <skill name="pdf">...</skill> 标签中
```

### load_skill 工具

```python
# 就是一个普通工具，和 bash/read_file 并列
{"name": "load_skill",
 "description": "Load specialized knowledge by name.",
 "input_schema": {"properties": {"name": {"type": "string"}}}}

# handler 直接调用 SkillLoader.get_content()
"load_skill": lambda **kw: SKILL_LOADER.get_content(kw["name"])
```

关键：skill 内容通过 `tool_result` 返回，进入对话历史。LLM 看到后就"学会"了这个技能。

### 设计哲学

教材的 skill 是**纯知识注入**：
- Skill 内容是 Markdown 文档（操作指南、代码模板、检查清单）
- LLM 读完后自己决定怎么用
- 不涉及流程编排，LLM 有完全的自主权

## 二、NaughtyAgent 现状

NaughtyAgent 的 skill 系统走了一条完全不同的路：**Workflow Skill（工作流技能）**。

### 架构对比

| 方面 | 教材 | NaughtyAgent |
|------|------|-------------|
| Skill 本质 | 纯文本知识（Markdown） | 预编排的工作流（TypeScript 代码） |
| 加载方式 | LLM 调用 `load_skill` 按需加载 | 用户输入 `/command` 触发 |
| 执行者 | LLM 自主决定怎么用 | Harness 按步骤编排执行 |
| 存储格式 | `SKILL.md`（frontmatter + 正文） | TypeScript 对象（SkillDefinition） |
| 注入位置 | tool_result → 对话历史 | 不注入，直接执行工作流 |
| 扩展方式 | 新建 `skills/xxx/SKILL.md` | 新建 `builtin/xxx.ts` + 注册 |

### NaughtyAgent 的 Skill 定义

```typescript
// 以 /commit 为例
export const commitSkill: SkillDefinition = {
  name: "commit",
  description: "Generate commit message and commit staged changes",
  aliases: ["ci"],
  parameters: [...],
  workflow: {
    steps: [
      { name: "get-diff", type: "tool", tool: { name: "bash", params: {...} } },
      { name: "generate-message", type: "llm", llm: { prompt: ... } },
      { name: "do-commit", type: "tool", tool: { name: "bash", params: ... } },
    ]
  }
}
```

每个 skill 是一个**硬编码的工作流**，步骤、条件分支、工具调用都在代码里写死。

### NaughtyAgent 的 Skill 系统组件

```
skill/
  types.ts      ← SkillDefinition, SkillResult 类型
  registry.ts   ← 注册表（Map + 别名映射）
  executor.ts   ← 解析 /command，执行 workflow
  index.ts      ← 导出 + initSkills()
  builtin/
    commit.ts   ← /commit 工作流
    pr.ts       ← /pr 工作流
    review.ts   ← /review 工作���
    test.ts     ← /test 工作流
```

## 三、核心差异分析

### 两种 Skill 哲学

```
教材（Knowledge Skill）：
  用户说 "帮我处理这个 PDF"
  → LLM 判断需要 PDF 技能
  → LLM 调用 load_skill("pdf")
  → Harness 返回 PDF 操作指南（纯文本）
  → LLM 阅读指南，自主决定用哪些命令
  → LLM 调用 bash/read_file 等工具执行

NaughtyAgent（Workflow Skill）：
  用户输入 /commit
  → Harness 解析命令，找到 commitSkill
  → Harness 按 workflow.steps 逐步执行
  → 遇到 type: "llm" 的步骤才调用 LLM
  → 遇到 type: "tool" 的步骤直接执行工具
  → 最终返回结果
```

### 各自的优劣

**教材方式（Knowledge Skill）的优势：**
- 扩展极其简单：写个 Markdown 文件就行，不需要写代码
- LLM 有自主权：可以灵活组合知识，应对意外情况
- token 效率高：只在需要时加载，不用的 skill 零成本
- 社区友好：非程序员也能贡献 skill

**教材方式的劣势：**
- 依赖 LLM 的理解能力：如果 LLM 理解错了，执行就错了
- 不可预测：同样的 skill，不同次执行可能走不同路径
- 无法保证步骤顺序：LLM 可能跳过关键步骤

**NaughtyAgent 方式（Workflow Skill）的优势：**
- 执行可预测：步骤固定，每次都一样
- 可以有条件分支：type: "condition" 实现精确控制
- 减少 LLM 调用：只在需要生成内容时才调 LLM
- 适合标准化操作：commit、PR 这类流程固定的任务

**NaughtyAgent 方式的劣势：**
- 扩展成本高：每个 skill 都要写 TypeScript 代码
- 灵活性差：遇到意外情况无法自适应
- 不支持按需加载：所有 skill 都在启动时注册
- LLM 无法主动请求：只能用户手动 /command 触发

## 四、商业产品怎么做的？

Claude Code 和 Kiro 都采用了**接近教材的方式**，但更成熟：

### Claude Code 的 Skill 系统

Claude Code 用 `CLAUDE.md` 文件作为 skill 载体：
- 项目根目录的 `CLAUDE.md` 自动加载（类似 always-on skill）
- 子目录的 `CLAUDE.md` 在访问该目录时按需加载
- 本质上就是教材的 Two-Layer：全局摘要 + 按需加载详情

### Kiro 的 Steering + Skills

Kiro 有两套机制：
- **Steering**（`.kiro/steering/*.md`）：类似 always-on skill，自动注入
- **Skills**（通过 `discloseContext` 加载）：按需激活，和教材的 `load_skill` 几乎一样

### 共同点

商业产品都选择了**知识注入**而非**工作流编排**：
- Skill 是文本，不是代码
- LLM 有自主权决定怎么用
- 扩展成本低（写 Markdown 就行）

## 五、NaughtyAgent 的改进方向

NaughtyAgent 目前的 Workflow Skill 适合标准化操作（commit、PR），但缺少教材的 Knowledge Skill 能力。

### 建议：两套并存

```
现有 Workflow Skill（保留）：
  /commit, /pr, /review, /test
  → 适合流程固定、步骤明确的操作
  → 用户通过 /command 触发

新增 Knowledge Skill（待实现）：
  skills/
    pdf/SKILL.md
    code-review/SKILL.md
  → 适合领域知识、操作指南
  → LLM 通过 load_skill 工具按需加载
  → 摘要注入 system prompt
```

### 需要做的事

1. 实现 `SkillLoader`：扫描 `skills/` 目录，解析 frontmatter
2. 注册 `load_skill` 工具：返回完整 skill 内容
3. 修改 `buildSystemPrompt`：注入 Layer 1 摘要
4. 保留现有 `/command` 系统不变

## 六、与前几章的关系

| 章节 | 关系 |
|------|------|
| s01 Agent Loop | 循环不变，load_skill 只是又一个工具 |
| s02 Tool Use | load_skill 的注册方式和其他工具完全一样 |
| s03 Todo Write | 无直接关系，但 skill 可以包含 "使用 todo 跟踪进度" 的指导 |
| s04 Subagent | 子代理可以有自己的 skill 集合（或继承父代理的） |

核心洞察：**每一章都没有改变循环本身，只是往循环里加东西。**
- s02 加了工具
- s03 加了 todo 工具 + nag reminder
- s04 加了子代理工具
- s05 加了 load_skill 工具 + system prompt 注入

## 七、面试考点

> Q：为什么不把所有 skill 内容都放进 system prompt？

token 浪费 + 注意力稀释。10 个 skill 每个 2000 tokens = 20000 tokens 的 system prompt，大部分时候用不到。Two-Layer 方式只花 ~1000 tokens 放摘要，需要时再加载。

> Q：Knowledge Skill 和 Workflow Skill 哪个更好？

各有场景。Knowledge Skill 适合领域知识（PDF 处理、代码审查），LLM 有自主权。Workflow Skill 适合标准化流程（git commit、PR），执行可预测。商业产品（Claude Code、Kiro）都选了 Knowledge Skill 路线。

> Q：load_skill 返回的内容放在哪里？

放在 `tool_result` 里，进入对话历史。和其他工具结果一样，LLM 在后续轮次都能看到。这就是为什么叫"注入"——skill 内容注入到了 LLM 的上下文窗口。

> Q：如果 skill 内容很长，会不会挤占上下文？

会。这是 Two-Layer 的权衡：加载一个 skill 可能花 2000-5000 tokens。所以要控制 skill 大小，或者配合 s06 的上下文压缩机制。
