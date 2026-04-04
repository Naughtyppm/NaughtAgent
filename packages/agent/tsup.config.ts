import { defineConfig } from "tsup"

// Windows UTF-8 编码修复：注入到 cli.js bundle 最顶部
// ESM 中用 createRequire 同步加载 child_process
const WIN_UTF8_BANNER = `
import { createRequire as __createRequire__ } from "node:module";
if (typeof process !== "undefined" && process.platform === "win32") {
  try {
    const __require__ = __createRequire__(import.meta.url);
    __require__("child_process").execSync("chcp 65001", { stdio: "ignore" });
  } catch {}
}
`.trim()

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/cli/cli.ts",
    "src/cli/ink/index.ts",  // Ink REPL 入口
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  splitting: false,
  // CJS 包强制内联（避免 ESM/CJS named export 运行时错误）
  noExternal: [
    "react-reconciler",
    "auto-bind",
    "signal-exit",
    "usehooks-ts",
  ],
  // 支持 JSX/TSX
  esbuildOptions(options) {
    options.jsx = "automatic"
  },
  // 在 cli bundle 最顶部注入 chcp 65001（shebang 之后）
  banner: {
    js: WIN_UTF8_BANNER,
  },
})
