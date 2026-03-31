# s02 - Tool Use

> 教材：`learn-claude-code-main/agents/s02_tool_use.py`
> 作业：`packages/agent/src/tool/tool.ts`, `packages/agent/src/tool/registry.ts`

## 术语表

| 术语 | 英文 | 含义 |
|------|------|------|
| Tool Definition / Tool Schema | Tool Definition | 给 LLM 看的工具描述（名字、参数、说明），告诉模型"你能用什么" |
| Tool Handler / Tool Implementation | Tool Handler | 实际执行函数，真正干活的代码 |
| Tool Registration | Tool Registration | 把 definition + handler 注册到系统里的过程 |
| Tool Dispatch | Tool Dispatch | 工具分发，根据 LLM 返回的 tool name 路由到对应 handler |
| Function Calling | Function Calling | OpenAI/Anthropic 官方对这套机制的叫法 |
| Tool Use | Tool Use | Anthropic API 中的术语，模型返回 `tool_use` block 表示要调用工具 |
| Dispatch Map | Dispatch Map | `{tool_name: handler}` 的映射表，实现工具路由 |
| Path Traversal | Path Traversal（路径穿越） | 安全漏洞，LLM 传入 `../../etc/passwd` 逃逸工作目录，`safe_path` 防御此攻击 |
| Input Schema | Input Schema | 工具参数的 JSON Schema 定义，LLM 根据它生成正确的参数 |

## 一、教材要点

s02 的核心洞察：**循环没变，只是往工具数组里加了东西。**

教材从 s01 的单个 `bash` 工具扩展到 4 个工具：

```python
TOOL_HANDLERS = {
    "bash":       lambda **kw: run_bash(kw["command"]),
    "read_file":  lambda **kw: run_read(kw["path"], kw.get("limit")),
    "write_file": lambda **kw: run_write(kw["path"], kw["content"]),
    "edit_file":  lambda **kw: run_edit(kw["path"], kw["old_text"], kw["new_text"]),
}
```

关键设计：
- **Dispatch Map**：`{tool_name: handler}` 的字典，loop 里一行 `handler = TOOL_HANDLERS.get(block.name)` 搞定路由
- **路径安全**：`safe_path()` 确保所有文件操作不逃逸出工作目录
- **工具定义与实现分离**：`TOOLS` 数组（给 LLM 看的 schema）和 `TOOL_HANDLERS`（实际执行）是两个独立结构
- **输出截断**：所有工具输出限制 50000 字符


## 二、NaughtyAgent 现状

NaughtyAgent 的工具系统比教材复杂得多，分成了三层：

### 层 1：工具定义 (`tool.ts`)

用 `Tool.define()` 工厂函数创建工具，内置：
- Zod schema 验证参数（教材用的是 JSON Schema 裸定义）
- 统一的错误处理包装 `executeToolWithErrorHandling`
- 超时控制 `withTimeout`
- 错误类型分类 `detectErrorType` → `isRecoverableError`

```typescript
// NaughtyAgent 的工具定义方式
Tool.define({
  id: "read",
  description: "读取文件内容",
  params: z.object({ path: z.string(), limit: z.number().optional() }),
  execute: async (params, ctx) => { ... }
})
```

### 层 2：工具注册表 (`registry.ts`)

一个全局单例 `ToolRegistry`，提供：
- 按来源分类：`builtin` / `mcp` / `custom`
- 按 MCP 服务器索引
- 变更事件监听（`onChange`）
- 输出截断器集成
- 弃用工具警告机制

### 层 3：输出截断 (`output-truncator.ts`)

独立的截断模块，比教材的 `[:50000]` 切片精细得多。

### 与教材的结构对比

| 概念 | 教材 | NaughtyAgent |
|------|------|-------------|
| 工具定义 | `TOOLS` 数组（JSON Schema） | `Tool.define()` + Zod |
| 路由分发 | `TOOL_HANDLERS` 字典 | `ToolRegistry.get(id)` |
| 参数验证 | 无（信任 LLM） | Zod 自动验证 |
| 路径安全 | `safe_path()` 函数 | 各工具自行处理 |
| 输出截断 | `[:50000]` 切片 | 独立 Truncator 模块 |
| 工具来源 | 只有内置 | builtin + MCP + custom |
| 动态注册 | 不支持 | 支持运行时注册/注销 |


## 三、差距分析

### ✅ 做得好的

- `Tool.define()` 工厂模式比教材的裸字典更类型安全，Zod 验证能在工具执行前拦截参数错误
- `ToolRegistry` 支持动态注册，为后续 MCP 工具热加载打好了基础
- 错误分类 + 可恢复判断是教材没有但生产必需的

### ⚠️ 需要改进的

1. **缺少统一的 `safe_path`**：教材有一个全局的路径安全函数，NaughtyAgent 的文件工具各自处理路径校验，容易遗漏
2. **Registry 是全局单例**：用 namespace + 模块级 state 实现，测试时需要手动 `reset()`，不如教材的纯函数式 dispatch map 干净
3. **工具定义和 LLM schema 的转换**：`getOrGenerateSchema` 把 Zod → JSON Schema，多了一层运行时转换。教材直接写 JSON Schema 虽然原始但零开销
4. **弃用机制过早**：项目还在早期就加了 `deprecatedBy` 和弃用警告，属于过度设计

## 四、重构计划

### 目标：保持类型安全，减少间接层

1. **添加全局 `safePath` 工具函数**：统一路径校验，所有文件工具共用
2. **Registry 改为可实例化**：`createToolRegistry()` 返回实例，而非 namespace 单例，方便测试和多 Agent 场景
3. **精简 tool.ts**：错误分类逻辑（`detectErrorType` 等）移到独立的 `tool-errors.ts`，tool.ts 只保留定义和执行
4. **暂时移除弃用机制**：等工具体系稳定后再加

### 优先级

- P0：全局 safePath（安全问题）
- P1：Registry 实例化（影响测试和多 Agent）
- P2：tool.ts 拆分瘦身

## 五、面试考点

> Q：Agent 的工具系统怎么设计？

两个核心结构：工具定义（给 LLM 看的 schema，描述工具能做什么、参数是什么）和工具实现（实际执行函数）。Loop 里通过 dispatch map 把 LLM 返回的 tool_name 路由到对应的 handler。工具系统的扩展就是往这个 map 里加条目，循环本身不需要改。

> Q：为什么需要工具注册表？

静态工具数组够用于教学，但生产环境需要：运行时动态注册（MCP 工具热加载）、按来源分类管理、变更通知（UI 更新工具列表）。注册表就是工具的集中管理层。

> Q：参数验证应该在哪一层做？

在工具执行前，由 Harness 层做。不能信任 LLM 的输出一定符合 schema。Zod 这类运行时验证库能在执行前拦截非法参数，避免工具内部处理脏数据。
