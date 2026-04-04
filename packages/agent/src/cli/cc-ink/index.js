/**
 * CC Ink 适配层（运行时）
 *
 * Re-export cc-ink/ink/ 的核心 API。
 * 类型由同目录 index.d.ts 提供。
 * tsup/esbuild 打包时直接解析此 .js 文件。
 */

// 核心渲染函数
export { default as render } from "./ink/root.js"
export { createRoot } from "./ink/root.js"

// 核心组件
export { default as Box } from "./ink/components/Box.js"
export { default as Text } from "./ink/components/Text.js"
export { default as Newline } from "./ink/components/Newline.js"
export { default as Spacer } from "./ink/components/Spacer.js"

// Hooks
export { default as useInput } from "./ink/hooks/use-input.js"
export { default as useApp } from "./ink/hooks/use-app.js"
export { default as useStdin } from "./ink/hooks/use-stdin.js"
