# Phase 1: CC Ink 引擎迁移到 NaughtAgent

## 目标

替换 NA 的 npm `ink@5` 社区版为 CC 的自定义 Ink fork，获得：
- 自定义 React reconciler + 事件冒泡系统
- 鼠标交互、文本选择、虚拟滚动
- 增量渲染优化
- 纯 TS yoga 布局引擎（无 WASM）
- 正确的 raw mode 引用计数管理（解决键盘异常）

## 源码位置

- CC ink 引擎: `D:\AISpace\Temp\claude-code-source\src\ink\` (96 文件, 19,842 行)
- CC yoga-layout: `D:\AISpace\Temp\claude-code-source\src\native-ts\yoga-layout\` (2 文件)
- NA 目标: `D:\AISpace\Apps\NaughtAgent\packages\agent\src\cli\cc-ink\`

## 步骤

### Step 1: 复制源码 (Day 1)

1. 创建目录 `src/cli/cc-ink/`
2. 复制 CC `src/ink/` 全部文件到 `src/cli/cc-ink/ink/`
3. 复制 CC `src/native-ts/yoga-layout/` 到 `src/cli/cc-ink/yoga-layout/`
4. 创建 `src/cli/cc-ink/index.ts` 导出入口

### Step 2: 处理外部依赖 (Day 1)

CC ink 对外引用 4 个位置，需要 stub：

| 原 import | 来源文件 | 替代 |
|-----------|---------|------|
| `src/bootstrap/state.js` → `flushInteractionTime` | App.tsx | 空函数 |
| `src/utils/debug.js` → `logForDebugging` | ink.tsx | `console.debug` or noop |
| `src/utils/log.js` → `logError` | ink.tsx, App.tsx | `console.error` |
| `src/native-ts/yoga-layout/index.js` | layout/yoga.ts | 指向本地 yoga-layout |

创建 `src/cli/cc-ink/stubs.ts`:
```typescript
export function flushInteractionTime(): void {}
export function logForDebugging(..._args: unknown[]): void {}
export function logError(msg: string, err?: unknown): void { console.error(msg, err) }
```

### Step 3: 处理 React Compiler Runtime (Day 1-2)

CC 代码使用 React Compiler，生成了 `_c()` 缓存模式：
```typescript
import { c as _c } from "react/compiler-runtime"
const $ = _c(5)
if ($[0] !== ...) { ... $[0] = ... }
```

**方案 A (推荐)**: 提供 `react/compiler-runtime` shim
```typescript
// src/cli/cc-ink/compiler-runtime-shim.ts
export function c(size: number): unknown[] {
  return new Array(size).fill(Symbol.for("EMPTY"))
}
```
然后在 tsconfig.json paths 映射: `"react/compiler-runtime": ["./cc-ink/compiler-runtime-shim"]`

**方案 B**: 手动移除所有 `_c()` 模式（工作量大，不推荐）

### Step 4: 更新 package.json 依赖 (Day 2)

移除:
- `ink` (npm 社区版)
- `@inkjs/ui`

新增（CC ink 需要的）:
- `react-reconciler` (应该已有)
- `auto-bind`
- `signal-exit`
- `strip-ansi` (可能已有)
- `wrap-ansi` (可能已有)
- `chalk` (可能已有)
- `lodash-es`

### Step 5: 修改 NA 现有 Ink 组件 import (Day 2-3)

将 `src/cli/ink/` 中所有组件的:
```typescript
import { Box, Text } from "ink"
```
改为:
```typescript
import { Box, Text } from "../cc-ink/ink/components/Box"
import { Text } from "../cc-ink/ink/components/Text"
```

或创建一个兼容层 `src/cli/cc-ink/compat.ts` 统一导出。

### Step 6: TypeCheck + Build (Day 3)

1. `npx tsc --noEmit` 排查所有类型错误
2. 逐步修复 API 差异（CC ink vs 社区 ink 的 props 差异）
3. `npx tsup` 构建
4. 手动测试 `na` 命令

## 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| CC ink API 与社区 ink 不兼容 | NA 现有 25 个 ink 组件需要大改 | 创建兼容层包装 |
| React Compiler shim 不工作 | 运行时错误 | 方案 B 手动清理 |
| tsup 不支持 CC ink 的某些 TS 特性 | 编译失败 | 调整 tsup 配置 |
| 总行数 20K+ 导致调试困难 | 排错耗时 | 分模块逐步启用 |

## 成功标准

- `npx tsc --noEmit` 零错误
- `npx tsup` 构建成功
- `na` 命令能正常启动、显示欢迎界面、输入命令
- 权限对话框正常工作，无键盘残留
- /model /help 等命令正常
