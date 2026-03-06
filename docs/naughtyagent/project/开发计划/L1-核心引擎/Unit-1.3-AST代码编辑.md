# Unit 1.3: AST 代码编辑

| 属性 | 值 |
|------|-----|
| 优先级 | P1 |
| 预估工时 | 5 天 |
| 前置依赖 | 无 |
| 状态 | ⏳ 待开始 |
| Spec | - |

## 目标

基于 AST 的结构化代码编辑，替代纯文本搜索替换。

## 当前实现分析

- `packages/agent/src/tool/edit.ts`: 仅支持文本搜索替换

## 任务清单

- [ ] 集成 tree-sitter 或 @babel/parser
- [ ] 实现 AST 解析器（支持 TS/JS/Python）
- [ ] 实现基于 AST 的编辑操作（replace_node/insert_node/delete_node）
- [ ] 保留原有 edit 工具作为 fallback
- [ ] 添加语法验证（编辑后检查 AST 是否有效）

## 完成标准

- 支持 TypeScript/JavaScript/Python 的 AST 编辑
- 编辑后代码语法正确
- 复杂编辑场景成功率 > 90%

## 关键文件

- `packages/agent/src/tool/edit.ts`
- 新增: `packages/agent/src/tool/ast-edit.ts`

## 影响范围

- edit 工具
- 代码修改质量
