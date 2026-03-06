# Unit 1.2 完成报告：Extended Thinking

## 概述
- 完成日期：2026-02-27
- 耗时：1 天
- 状态：✅ 完成

## 实现内容

### 这个系统/模块做了什么
Extended Thinking 模块为 NaughtyAgent 添加了 Claude 的深度思考能力。当用户面对复杂推理任务时，可以启用此功能让 AI 进行更深入的思考，提升回答质量。

### 起到什么作用
- 提升复杂任务（代码架构设计、算法优化、多步骤推理）的回答质量
- 让用户可以观察 AI 的思考过程，增强透明度
- 通过可折叠面板展示思考内容，不干扰正常交互流程

### 一般怎么做（业界常见方案）
1. 直接调用 API 的 thinking 参数，不做 UI 展示
2. 将思考内容混入正常输出
3. 使用单独的调试模式查看思考过程

### 我们怎么做的
1. Provider 层：在 Anthropic provider 中添加 thinking 参数支持
2. 事件系统：新增 `thinking` 和 `thinking_end` 事件类型
3. CLI 参数：`--thinking` / `-t` 启用，`--thinking-budget` 设置预算
4. UI 组件：独立的 ThinkingPanel 组件，可折叠显示思考内容
5. 状态管理：在 App.tsx 中管理 thinking 状态，流式更新内容

### 为什么这样做
- 分离关注点：thinking 事件独立于 text 事件，便于 UI 差异化展示
- 用户控制：默认关闭，不影响普通任务的响应速度
- 可观察性：可折叠面板让用户按需查看，不强制展示
- API 限制适配：thinking 启用时 temperature 必须为 1，在 provider 层处理

## 关键文件

| 文件 | 描述 |
|------|------|
| `packages/agent/src/provider/anthropic.ts` | Anthropic provider，添加 thinking 参数和事件处理 |
| `packages/agent/src/provider/types.ts` | ThinkingConfig 接口定义 |
| `packages/agent/src/agent/agent.ts` | AgentEvent 类型扩展 |
| `packages/agent/src/agent/loop.ts` | Agent 循环中的 thinking 事件处理 |
| `packages/agent/src/cli/cli.ts` | CLI 参数定义 (--thinking, --thinking-budget) |
| `packages/agent/src/cli/runner.ts` | Runner 层 thinking 配置和事件处理 |
| `packages/agent/src/cli/ink/types.ts` | Ink 类型定义扩展 |
| `packages/agent/src/cli/ink/hooks/useRunner.ts` | useRunner hook 扩展 |
| `packages/agent/src/cli/ink/components/ThinkingPanel.tsx` | 思考面板 UI 组件 |
| `packages/agent/src/cli/ink/App.tsx` | 主应用集成 |

## 实现细节

### Provider 层改动
```typescript
// anthropic.ts - 请求构建
if (params.model.thinking?.enabled) {
  request.thinking = {
    type: 'enabled',
    budget_tokens: params.model.thinking.budgetTokens || 16000,
  }
  // API 限制：thinking 启用时 temperature 必须为 1
}

// 流式事件处理
case 'content_block_start':
  if (block.type === 'thinking') {
    yield { type: 'thinking', content: '' }
  }
case 'content_block_delta':
  if (delta.type === 'thinking_delta') {
    yield { type: 'thinking', content: delta.thinking }
  }
case 'content_block_stop':
  if (currentBlockType === 'thinking') {
    yield { type: 'thinking_end' }
  }
```

### CLI 参数
```bash
# 启用 Extended Thinking
naughty --thinking "复杂的推理问题"

# 自定义预算（默认 16000，最小 1024）
naughty --thinking --thinking-budget 32000 "需要深度思考的问题"
```

### UI 组件设计
ThinkingPanel 组件特点：
- 可折叠：默认折叠，用户可展开查看完整内容
- 淡色样式：使用 `dimColor` 和 magenta 边框，区分于正常输出
- 流式更新：实时显示思考内容
- 状态指示：显示 "🧠 思考中..." 或 "🧠 思考过程"

### 状态管理
App.tsx 中的状态：
```typescript
const [thinkingContent, setThinkingContent] = useState('')
const [isThinking, setIsThinking] = useState(false)

// 事件处理
case 'thinking':
  setIsThinking(true)
  setThinkingContent(prev => prev + content)
case 'thinking_end':
  setIsThinking(false)
case 'done':
  setThinkingContent('')
  setIsThinking(false)
```

## 测试覆盖

### 测试策略
由于 Extended Thinking 依赖实际 API 调用，主要通过以下方式验证：
1. 类型检查：确保所有类型定义正确
2. 构建验证：确保代码可以正常编译
3. 手动测试：使用 `--thinking` 参数实际运行

### 验证结果
- 构建成功：`pnpm --filter @naughtyagent/agent build` ✅
- 类型检查通过 ✅
- 现有测试不受影响（2507 passed）

## 遇到的问题和解决方案

### 问题 1：Temperature 限制
- 问题：Claude API 在启用 thinking 时要求 temperature 必须为 1
- 解决：在 provider 层检测 thinking 启用时，强制设置 temperature 为 1

### 问题 2：事件类型扩展
- 问题：需要在多个层级添加新的事件类型
- 解决：从底层 provider 到顶层 UI，逐层添加 thinking/thinking_end 事件支持

### 问题 3：状态重置
- 问题：任务完成后需要清理 thinking 状态
- 解决：在 'done' 事件处理中重置 thinkingContent 和 isThinking

## 后续注意事项
- thinking 功能会增加 API 调用成本，建议仅在复杂任务时启用
- budget_tokens 最小值为 1024，设置过小可能导致思考不充分
- 未来可考虑添加自动检测复杂任务并建议启用 thinking 的功能
