# Unit 1.2: Extended Thinking

| 属性 | 值 |
|------|-----|
| 优先级 | P0 |
| 预估工时 | 3 天 |
| 前置依赖 | 无 |
| 状态 | ✅ 完成 |
| Spec | - |

## 目标

利用 Claude 的 Extended Thinking 能力，提升复杂推理任务质量。

## 实现内容

### Provider 层
- `packages/agent/src/provider/anthropic.ts`: 添加 thinking 参数支持
  - 启用 thinking 时，temperature 必须为 1（API 限制）
  - 处理 `ThinkingBlock` 和 `ThinkingDelta` 流式事件
  - 发出 `thinking` 和 `thinking_end` StreamEvent

### 类型定义
- `packages/agent/src/provider/types.ts`: 添加 `ThinkingConfig` 接口
- `packages/agent/src/agent/agent.ts`: 添加 `thinking` 和 `thinking_end` AgentEvent
- `packages/agent/src/cli/ink/types.ts`: 添加 thinking 相关类型

### CLI 参数
- `packages/agent/src/cli/cli.ts`: 
  - `--thinking` / `-t` 启用 Extended Thinking
  - `--thinking-budget` 设置预算 token 数（默认 16000，最小 1024）

### Runner 层
- `packages/agent/src/cli/runner.ts`: 添加 thinking 事件处理
- `packages/agent/src/cli/ink/hooks/useRunner.ts`: 传递 thinking 配置和事件

### Agent 循环
- `packages/agent/src/agent/loop.ts`: 处理 thinking 事件

### UI 组件
- `packages/agent/src/cli/ink/components/ThinkingPanel.tsx`: 新建组件
  - 可折叠显示 thinking 内容
  - 淡色样式区分于正常输出
- `packages/agent/src/cli/ink/App.tsx`: 集成 ThinkingPanel

## 使用方式

```bash
# 启用 Extended Thinking
naughty --thinking "复杂的推理问题"

# 自定义预算
naughty --thinking --thinking-budget 32000 "需要深度思考的问题"
```

## 完成标准

- [x] 复杂任务可启用 Extended Thinking
- [x] thinking 过程可在 CLI 中查看（可折叠面板）
- [x] 不影响普通任务的响应速度（默认关闭）

## 关键文件

- `packages/agent/src/provider/anthropic.ts` - Provider 实现
- `packages/agent/src/agent/loop.ts` - Agent 循环
- `packages/agent/src/cli/ink/components/ThinkingPanel.tsx` - UI 组件
- `packages/agent/src/cli/ink/App.tsx` - 主应用集成

## 影响范围

- Agent 循环
- 复杂任务质量
