# TASK-005: 为 compact.ts 编写单元测试

## 目标

为 `packages/agent/src/agent/compact.ts` 编写单元测试。

## 需要读取的文件（了解接口）

1. `packages/agent/src/agent/compact.ts` — 被测模块
2. `packages/agent/src/session/message.ts` — 消息类型定义
3. `packages/agent/src/session/session.ts` — Session 类型
4. `packages/agent/src/config/constants.ts` — AUTO_COMPACT_TOKEN_THRESHOLD 常量

## 测试文件

`packages/agent/test/agent/compact.test.ts`

## 测试用例要求（至少 8 个）

### microCompact 测试
1. 少于 KEEP_RECENT_RESULTS 个 tool_result 时不压缩
2. 超过 KEEP_RECENT_RESULTS 后，旧的 tool_result 被替换为 `[Previous: used xxx]`
3. 短内容（<100字符）的 tool_result 不替换
4. 最近 3 个 tool_result 保持不变

### estimateTokens 测试
5. 空消息返回 0
6. 文本消息正确估算（字符数/4）
7. 包含 tool_use 和 tool_result 的消息正确估算

### extractRecentFileContents 测试（如果导出了的话，否则通过 autoCompact 间接测试）
8. autoCompact 后的消息中包含 "Preserved File Contents" 段落

## 验收标准

- [ ] 测试文件存在于 `packages/agent/test/agent/compact.test.ts`
- [ ] 至少 8 个测试用例
- [ ] `npx vitest run test/agent/compact.test.ts` 全部通过
- [ ] `npx tsc --noEmit` 零错误
