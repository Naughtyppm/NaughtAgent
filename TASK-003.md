# TASK-003: safe-path 模块增强与测试

## 目标

增强 `packages/agent/src/tool/safe-path.ts` 模块，添加以下功能：

1. **新函数 `isWithinCwd(targetPath, cwd)`**：判断给定路径是否在 cwd 内（返回 boolean，不抛异常）
2. **为新函数编写测试**：在 `packages/agent/test/tool/safe-path.test.ts` 中添加测试用例

## 要求

- 直接读取 `safe-path.ts` 源码理解现有实现
- 直接读取 `test/tool/safe-path.test.ts` 了解现有测试结构
- `isWithinCwd` 函数实现：使用 path.resolve 标准化路径后比较前缀
- 新增至少 4 个测试用例：
  - 子路径返回 true
  - cwd 自身返回 true
  - 逃逸路径返回 false
  - Windows 盘符不同返回 false
- 运行测试确认通过：`npx vitest run test/tool/safe-path.test.ts`
- **禁止使用 dispatch_agent**，所有操作自己完成

## 验收标准

- [ ] `isWithinCwd` 函数已导出
- [ ] 4+ 个新测试用例全部通过
- [ ] `npx tsc --noEmit` 零错误
- [ ] 没有使用 dispatch_agent
