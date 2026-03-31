# TASK-004: output-truncator 单元测试

## 目标

为 `packages/agent/src/tool/output-truncator.ts` 编写单元测试。

## 要求

1. **先读取源码** `packages/agent/src/tool/output-truncator.ts`，理解其 API 和行为
2. **创建测试文件** `packages/agent/test/tool/output-truncator.test.ts`
3. **测试用例至少 6 个**，覆盖：
   - 短输出不截断（原样返回）
   - 超长输出被截断
   - 截断信息中包含原始长度
   - 自定义 maxLength 参数（如果支持）
   - 空字符串输入
   - 多次调用的独立性（不互相影响）
4. **运行测试确认通过**：`npx vitest run test/tool/output-truncator.test.ts`
5. **运行类型检查**：`npx tsc --noEmit`
6. **禁止使用 dispatch_agent**，所有操作自己完成

## 注意

- 使用 `read` 工具读文件，不要用 bash 的 type/cat
- bash 命令用 PowerShell 语法（`;` 分隔，不用 `&&`）
- 不要重复读取已读过的文件

## 验收标准

- [ ] 测试文件已创建
- [ ] 6+ 个测试用例
- [ ] `npx vitest run test/tool/output-truncator.test.ts` 全通过
- [ ] `npx tsc --noEmit` 零错误
