# 快照 #001 - NaughtyAgent
> 日期: 2026-02-06 18:22:46
> 重要性: ⭐⭐⭐⭐ HIGH（手动指定）
> 精准度: B级（含修改文件和测试结果）

## 📋 本次工作
根因：App.tsx 中 useInput（全局）和 useKeyboard 同时监听了 Tab 键，导致按一次 Tab 触发两次 toggleSelectedTool → 展开又立刻折叠。修复：移除 useInput 中的全局 Tab 处理，只保留 useKeyboard 的 onTab 作为唯一入口，同时清理了未使用的 useInput import。

## 📁 修改文件
packages/agent/src/cli/ink/App.tsx

## 🏷️ 标签
bugfix,ui,tab,ink,闪烁, [IMP]
