# 技术决策：LLM 调用方案

> 记录时间：2026-01-15
> 状态：当前使用 AI SDK，保留替换选项

## 当前方案：Vercel AI SDK

### 选择原因

1. **多提供商支持** - 虽然目前只用 Claude，但保留切换能力
2. **流式处理** - 内置 `streamText`，处理 SSE 流
3. **工具调用** - 统一的 tool 定义和结果处理
4. **TypeScript** - 类型完善

### 使用方式

```typescript
import { createAnthropic } from "@ai-sdk/anthropic"
import { streamText, generateText } from "ai"

const anthropic = createAnthropic({
  apiKey: config.apiKey,
  baseURL: config.baseURL,  // 支持代理
})

// 流式调用
const result = streamText({
  model: anthropic("claude-sonnet-4-20250514"),
  system: "...",
  messages: [...],
  tools: {...},
})

// 非流式调用
const result = await generateText({...})
```

### 遇到的问题

1. **API 变化快** - 版本间类型不兼容
2. **类型复杂** - tool 定义的类型推断有问题，需要 `as any`
3. **属性名变化** - `textDelta` vs `text`，`args` vs `input`

### 当前实现

文件：`packages/agent/src/provider/provider.ts`

为了绕过类型问题，使用了 `any` 类型：
- `convertTools()` 返回 `any`
- `messages` 参数用 `as any`
- `part.input` 用 `(part as any).input`

---

## 替代方案

### 方案 A：@anthropic-ai/sdk

Anthropic 官方 SDK，只支持 Claude。

```typescript
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic({ apiKey })

const response = await client.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 8192,
  system: "...",
  messages: [...],
  tools: [...],
})

// 流式
const stream = await client.messages.stream({...})
for await (const event of stream) {
  // ...
}
```

**优点：**
- API 稳定，与 Claude 文档一致
- 类型准确
- 更轻量

**缺点：**
- 只支持 Claude
- 需要自己封装流式事件

### 方案 B：直接 HTTP 调用

最底层的方案。

```typescript
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: "...",
    messages: [...],
    tools: [...],
    stream: true,
  }),
})

// 处理 SSE 流
const reader = response.body.getReader()
// ...
```

**优点：**
- 完全可控
- 无依赖
- 最灵活

**缺点：**
- 需要自己处理 SSE 解析
- 需要自己处理重试、错误
- 代码量大

---

## 何时替换

考虑替换的情况：

1. **AI SDK 持续有类型问题** - 影响开发效率
2. **需要 Claude 特有功能** - AI SDK 不支持
3. **性能问题** - AI SDK 抽象层开销
4. **依赖更新困难** - 版本冲突

## 替换步骤

如果决定替换：

1. 安装新依赖：`pnpm add @anthropic-ai/sdk`
2. 重写 `src/provider/provider.ts`
3. 保持 `Provider` 命名空间的接口不变
4. 更新测试
5. 移除 AI SDK：`pnpm remove ai @ai-sdk/anthropic`

## 相关文件

- `packages/agent/src/provider/provider.ts` - 当前实现
- `.spec/sdd/interfaces/provider.spec.md` - 接口规格
