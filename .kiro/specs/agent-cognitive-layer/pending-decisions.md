# 决策记录

> 创建日期：2026-01-17
> 状态：✅ 已决策

---

## 决策总结

| 问题 | 决策 | 理由 |
|------|------|------|
| 1. ToolRegistry 扩展模式 | **A - 扩展现有 namespace** | 保持一致性，无破坏性变更 |
| 2. 权限控制架构 | **D - 废弃角色权限，采用 Claude Code 模式** | 用户体验更好，业界标准做法 |
| 3. Claude SDK Beta API | **B - 添加适配层** | 隔离风险，约 50 行代码 |

---

## 问题 1：ToolRegistry 扩展模式 ✅ 已决策

**决策：A - 扩展现有 namespace**

在 `tool/registry.ts` 基础上扩展，添加：
- category 和 tags 支持
- unregister 方法
- query 方法（按名称模式、类别、标签）
- 事件发射（registered、unregistered）
- toClaudeTools() 格式转换

**理由**：
- ✅ 保持一致性，无破坏性变更
- ✅ 与现有 Tool.define() 模式兼容
- ✅ 实现简单，约 100 行代码

---

## 问题 2：权限控制架构 ✅ 已决策

**决策：D - 废弃角色权限，采用 Claude Code 模式**

### 调研发现（2026-01-17）

对比 Claude Code、Cursor、Windsurf 等产品：
- **没有** build/plan/explore 这种角色区分
- 只有单一 Agent，通过**权限模式**控制行为
- Claude Code 的权限模式：
  - **ask（默认）**：read-only，每次操作询问
  - **allow**：自动执行不询问
  - **deny**：拒绝执行
  - **sandbox**：沙箱内自由执行，超出边界才询问
- 通过静态分析自动允许安全命令（如 `echo`、`cat`）
- 声明式规则：deny > allow > ask

### 问题分析

当前 build/plan/explore 设计的问题：
1. **用户心智负担**：需要手动选择用哪个 Agent
2. **不够智能**：应该由 AI 自己判断需要什么权限
3. **违背自然交互**：用户只想说"帮我做 X"，不想管用什么 Agent
4. **体验不顺手**：实际使用中频繁切换角色很麻烦

### 实施方案

**架构调整**：
- ❌ 删除 `AgentType = "build" | "plan" | "explore"`
- ❌ 删除基于角色的 PermissionController
- ✅ 保留单一 Agent，所有工具默认可用
- ✅ 实现 Claude Code 风格的 PermissionController：
  - 声明式规则（JSON/YAML 配置）
  - 三种模式：ask/allow/deny
  - 规则优先级：deny > allow > ask
  - 模式匹配：支持字符串、glob、正则
  - 静态分析：自动允许安全命令
- ✅ 与现有 `permission/` 模块集成

**配置示例**：
```typescript
const config: PermissionConfig = {
  defaultMode: 'ask',
  safeCommands: ['echo', 'cat', 'ls', 'pwd'],
  rules: [
    { commandPattern: /^rm\s+-rf/, mode: 'deny', priority: 100 },
    { toolPattern: 'read', mode: 'allow', priority: 10 },
    { toolPattern: 'write', pathPattern: 'src/**', mode: 'allow', priority: 5 },
  ],
};
```

**用户体验**：
```typescript
用户："帮我分析一下这个项目的架构"
→ Agent 自动只用 read/glob/grep（已配置 allow）

用户："实现这个功能"  
→ Agent 自动用 read/write/edit/bash
→ write 操作根据路径规则决定是否询问

用户："执行测试"
→ Agent 请求 bash 权限（如果没有 allow 规则）
```

---

## 问题 3：Claude SDK Beta API 风险 ✅ 已决策

**决策：B - 添加适配层**

封装 `betaZodTool`，隔离变更影响，增加约 50 行代码。

**理由**：
- ✅ 隔离 Beta API 变更风险
- ✅ 保持使用官方能力的便利性
- ✅ 代码量适中，维护成本低

---

## 影响范围

### 需要更新的文档
- [x] `.kiro/steering/product.md` - 删除 Agent 类型说明
- [x] `.kiro/specs/agent-cognitive-layer/requirements.md` - 更新 Requirement 8
- [x] `.kiro/specs/agent-cognitive-layer/design.md` - 更新 PermissionController 设计
- [x] `.kiro/specs/agent-cognitive-layer/tasks.md` - 更新 Phase 2.3-2.4

### 需要更新的代码
- [ ] `packages/agent/src/agent/agent.ts` - 删除 AgentType，简化为单一 Agent
- [ ] `packages/agent/src/permission/controller.ts` - 实现新的权限控制器
- [ ] `packages/agent/src/session/session.ts` - 删除 AgentType 相关类型

### 测试更新
- [ ] 更新 Property 17-19（权限相关属性测试）
- [ ] 删除角色切换相关测试

---

## 后续行动

1. 更新 `agent.ts`，删除角色机制
2. 按新设计实现 PermissionController
3. 更新相关测试
4. 更新用户文档
