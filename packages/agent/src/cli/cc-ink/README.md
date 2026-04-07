# cc-ink: Custom Ink Fork

NaughtyAgent 使用的自定义 Ink 5 终端 UI 框架，从 Claude Code 的 Ink fork 迁移而来。

## 为什么需要 Fork

1. **Yoga Layout 引擎**: 使用纯 TypeScript 实现替代 `yoga-wasm-web` (WASM) 和 `yoga-layout` (C++ binding)
   - 零依赖，ESM 友好
   - 专为 Ink 的 flexbox 子集优化（flex/align/gap/margin）
   - 脏标志布局缓存，性能提升 ~2.7x

2. **React Compiler Runtime**: Ink 源码经过 React Compiler 编译，需要 `_c()` shim

3. **自包含**: 不依赖 npm `ink@5` 包，避免 WASM/native binding 环境问题

## 目录结构

```
cc-ink/
├── bootstrap/         # NA 适配的状态管理 stub
├── compiler-runtime.ts # React Compiler _c() shim
├── index.d.ts         # 手写类型声明
├── index.js           # Re-export 适配层
├── stubs.ts           # 日志 stub
├── utils/             # CC 工具函数 stub（NA 不使用的部分为 noop）
├── yoga-layout/       # 纯 TS Yoga flexbox 引擎 (~2500 行)
│   ├── index.ts       # 核心布局算法
│   └── enums.ts       # Yoga 枚举常量
└── ink/               # Ink 5 渲染框架
    ├── components/    # Box, Text, Newline, Spacer 等
    ├── hooks/         # useInput, useApp, useStdin 等
    ├── layout/        # Yoga 适配器
    ├── events/        # 键盘/鼠标/焦点事件
    ├── termio/        # ANSI 解析器
    └── ...            # 渲染管道核心
```

## 维护说明

- `yoga-layout/`: 算法已稳定，极少需要修改
- `ink/`: 跟踪上游 Ink 5 更新，评估是否需要同步
- `utils/`: 仅保留有引用的 stub，定期清理无用文件
